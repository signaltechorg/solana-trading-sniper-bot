import * as ccxt from 'ccxt';
import { Profile, Balance, OrderParams, OrderResult, OrderInfo, MarketData, Bot, BotConfig } from './types';
import { ConfigService } from '../modules/system/config_service';
import { ExchangeInstanceService } from '../modules/system/exchange_instance_service';
import {
  fetchMarketData,
  placeLimitOrder,
  placeMarketOrder,
  fetchOpenOrders as fetchOpenOrdersCCXT,
  fetchClosedOrders as fetchClosedOrdersCCXT,
  cancelOrder as cancelOrderCCXT,
  cancelAllOrders as cancelAllOrdersCCXT,
  fetchOpenPositions as fetchOpenPositionsCCXT,
  closePosition as closePositionCCXT
} from './profile_order_service';

export class ProfileService {
  constructor(
    private configService: ConfigService,
    private exchangeInstanceService: ExchangeInstanceService,
  ) {}

  private generateId(): string {
    return Math.random().toString(36).substr(2, 10);
  }

  // ==================== Profile Management ====================

  getProfiles(): Profile[] {
    return this.configService.getProfiles();
  }

  getProfile(id: string): Profile | undefined {
    return this.getProfiles().find(p => p.id === id);
  }

  createProfile(data: Partial<Profile>): Profile {
    const profiles = this.getProfiles();
    const profile: Profile = {
      id: data.id || this.generateId(),
      name: data.name || '',
      exchange: data.exchange || '',
      apiKey: data.apiKey,
      secret: data.secret,
    };
    profiles.push(profile);
    this.configService.saveProfiles(profiles);
    return profile;
  }

  updateProfile(id: string, data: Partial<Profile>): Profile {
    const profiles = this.getProfiles();
    const index = profiles.findIndex(p => p.id === id);

    if (index === -1) {
      throw new Error(`Profile with id ${id} not found`);
    }

    const existing = profiles[index];
    const updated: Profile = {
      ...existing,
      ...data,
      id: existing.id,
    };

    profiles[index] = updated;
    this.configService.saveProfiles(profiles);
    this.exchangeInstanceService.invalidateProfile(id);
    return updated;
  }

  deleteProfile(id: string): void {
    this.exchangeInstanceService.invalidateProfile(id);
    const profiles = this.getProfiles().filter(p => p.id !== id);
    this.configService.saveProfiles(profiles);
  }

  // ==================== Exchange Operations ====================

  async fetchBalances(profile: Profile): Promise<Balance[]> {
    const exchange = await this.exchangeInstanceService.getProfileExchange(profile);
    const balance = await exchange.fetchBalance();
    const balances: Balance[] = [];

    for (const [currency, b] of Object.entries<any>(balance)) {
      if (currency === 'info' || currency === 'timestamp' || currency === 'datetime' || currency === 'free' || currency === 'used' || currency === 'total') {
        continue;
      }
      if (b && typeof b.total === 'number' && b.total > 0) {
        balances.push({
          currency,
          total: b.total,
          free: b.free || 0,
          used: b.used || 0,
        });
      }
    }

    return balances.sort((a, b) => b.total - a.total);
  }

  getSupportedExchanges(): string[] {
    return Object.keys(ccxt).filter((key) => {
      const value = (ccxt as any)[key];
      return typeof value === 'function' && key !== 'version' && key !== 'pro' && key[0] === key[0].toLowerCase();
    }).sort();
  }

  /**
   * Get a cached exchange instance by profile ID (1-hour TTL).
   */
  async getExchangeForProfile(profileId: string): Promise<ccxt.Exchange> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }
    return this.exchangeInstanceService.getProfileExchange(profile);
  }

  /**
   * Fetch ticker/market data for a pair
   */
  async fetchTicker(profileId: string, pair: string): Promise<MarketData> {
    const exchange = await this.getExchangeForProfile(profileId);
    return fetchMarketData(exchange, pair);
  }

  /**
   * Fetch open orders for a profile/pair
   */
  async fetchOpenOrders(profileId: string, pair?: string): Promise<OrderInfo[]> {
    const exchange = await this.getExchangeForProfile(profileId);
    return fetchOpenOrdersCCXT(exchange, pair);
  }

  /**
   * Fetch closed/filled orders for a profile
   */
  async fetchClosedOrders(profileId: string, limit?: number): Promise<OrderInfo[]> {
    const exchange = await this.getExchangeForProfile(profileId);
    return fetchClosedOrdersCCXT(exchange, undefined, limit);
  }

  /**
   * Fetch all orders (open and closed) for a profile
   */
  async fetchAllOrders(profileId: string, closedLimit: number = 10): Promise<{ open: OrderInfo[]; closed: OrderInfo[] }> {
    const exchange = await this.getExchangeForProfile(profileId);
    const [open, closed] = await Promise.all([
      fetchOpenOrdersCCXT(exchange),
      fetchClosedOrdersCCXT(exchange, undefined, closedLimit)
    ]);
    return { open, closed };
  }

  /**
   * Place an order (limit or market)
   */
  async placeOrder(profileId: string, params: OrderParams): Promise<OrderResult> {
    const exchange = await this.getExchangeForProfile(profileId);

    if (params.type === 'market') {
      return placeMarketOrder(exchange, params);
    } else {
      return placeLimitOrder(exchange, params);
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(profileId: string, orderId: string, pair: string): Promise<any> {
    const exchange = await this.getExchangeForProfile(profileId);
    return cancelOrderCCXT(exchange, orderId, pair);
  }

  /**
   * Fetch open swap/futures positions for a profile
   */
  async fetchOpenPositions(profileId: string): Promise<import('./types').PositionInfo[]> {
    const exchange = await this.getExchangeForProfile(profileId);
    return fetchOpenPositionsCCXT(exchange);
  }

  /**
   * Close a swap/futures position via limit or market order
   */
  async closePosition(profileId: string, symbol: string, type: 'limit' | 'market'): Promise<any> {
    const exchange = await this.getExchangeForProfile(profileId);
    return closePositionCCXT(exchange, symbol, type);
  }

  /**
   * Cancel all orders for a pair
   */
  async cancelAllOrders(profileId: string, pair: string): Promise<void> {
    const exchange = await this.getExchangeForProfile(profileId);
    return cancelAllOrdersCCXT(exchange, pair);
  }

  // ==================== Bot Management ====================

  getBots(profileId: string): Bot[] {
    const profile = this.getProfile(profileId);
    return profile?.bots || [];
  }

  getBot(profileId: string, botId: string): Bot | undefined {
    return this.getBots(profileId).find(b => b.id === botId);
  }

  createBot(profileId: string, config: BotConfig): Bot {
    const profiles = this.getProfiles();
    const profileIndex = profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    const bot: Bot = {
      id: 'bot_' + this.generateId(),
      name: config.name,
      strategy: config.strategy,
      pair: config.pair,
      interval: config.interval,
      capital: config.capital,
      mode: config.mode,
      status: 'stopped',
      options: config.options,
    };

    if (!profiles[profileIndex].bots) {
      profiles[profileIndex].bots = [];
    }

    profiles[profileIndex].bots!.push(bot);
    this.configService.saveProfiles(profiles);

    return bot;
  }

  updateBot(profileId: string, botId: string, updates: Partial<BotConfig>): Bot {
    const profiles = this.getProfiles();
    const profileIndex = profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    const bots = profiles[profileIndex].bots || [];
    const botIndex = bots.findIndex(b => b.id === botId);

    if (botIndex === -1) {
      throw new Error(`Bot with id ${botId} not found`);
    }

    const existingBot = bots[botIndex];

    const updatedBot: Bot = {
      ...existingBot,
      name: updates.name ?? existingBot.name,
      strategy: updates.strategy ?? existingBot.strategy,
      pair: updates.pair ?? existingBot.pair,
      interval: updates.interval ?? existingBot.interval,
      capital: updates.capital ?? existingBot.capital,
      mode: updates.mode ?? existingBot.mode,
      status: updates.status ?? existingBot.status,
      options: updates.options !== undefined ? updates.options : existingBot.options,
    };

    profiles[profileIndex].bots![botIndex] = updatedBot;
    this.configService.saveProfiles(profiles);

    return updatedBot;
  }

  deleteBot(profileId: string, botId: string): void {
    const profiles = this.getProfiles();
    const profileIndex = profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    const bots = profiles[profileIndex].bots || [];
    profiles[profileIndex].bots = bots.filter(b => b.id !== botId);
    this.configService.saveProfiles(profiles);
  }
}
