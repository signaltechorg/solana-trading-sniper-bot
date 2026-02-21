import * as fs from 'fs';
import * as path from 'path';
import * as ccxt from 'ccxt';
import { Profile, Balance, Config, OrderParams, OrderResult, OrderInfo, MarketData, RecentOrderPair, Bot, BotConfig } from './types';
import {
  fetchMarketData,
  placeLimitOrder,
  placeMarketOrder,
  fetchOpenOrders as fetchOpenOrdersCCXT,
  fetchClosedOrders as fetchClosedOrdersCCXT,
  cancelOrder as cancelOrderCCXT,
  cancelAllOrders as cancelAllOrdersCCXT
} from './profile_order_service';

export class ProfileService {
  private configPath: string;

  constructor() {
    this.configPath = path.join(process.cwd(), 'var', 'config.json');
  }

  private readConfig(): Config {
    if (fs.existsSync(this.configPath)) {
      try {
        const content = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(content);
      } catch (e) {
        console.error('Error reading config:', e);
      }
    }
    return { profiles: [] };
  }

  private writeConfig(config: Config): void {
    const varDir = path.dirname(this.configPath);
    if (!fs.existsSync(varDir)) {
      fs.mkdirSync(varDir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 10);
  }

  getProfiles(): Profile[] {
    return this.readConfig().profiles;
  }

  getProfile(id: string): Profile | undefined {
    const config = this.readConfig();
    return config.profiles.find((p) => p.id === id);
  }

  createProfile(data: Partial<Profile>): Profile {
    const config = this.readConfig();
    const profile: Profile = {
      id: data.id || this.generateId(),
      name: data.name || '',
      exchange: data.exchange || '',
      apiKey: data.apiKey,
      secret: data.secret,
    };
    config.profiles.push(profile);
    this.writeConfig(config);
    return profile;
  }

  updateProfile(id: string, data: Partial<Profile>): Profile {
    const config = this.readConfig();
    const index = config.profiles.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Profile with id ${id} not found`);
    }
    const existing = config.profiles[index];
    const updated: Profile = {
      ...existing,
      ...data,
      id: existing.id,
    };
    config.profiles[index] = updated;
    this.writeConfig(config);
    return updated;
  }

  deleteProfile(id: string): void {
    const config = this.readConfig();
    config.profiles = config.profiles.filter((p) => p.id !== id);
    this.writeConfig(config);
  }

  async fetchBalances(profile: Profile): Promise<Balance[]> {
    const ExchangeClass = (ccxt as any)[profile.exchange];
    if (!ExchangeClass) {
      throw new Error(`Exchange ${profile.exchange} not supported`);
    }

    const exchange = new ExchangeClass({
      apiKey: profile.apiKey,
      secret: profile.secret,
      enableRateLimit: true,
    });

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

  // Order-related methods

  /**
   * Create a CCXT exchange instance with profile credentials
   */
  createExchangeInstance(profile: Profile): ccxt.Exchange {
    const ExchangeClass = (ccxt as any)[profile.exchange];
    if (!ExchangeClass) {
      throw new Error(`Exchange ${profile.exchange} not supported`);
    }

    return new ExchangeClass({
      apiKey: profile.apiKey,
      secret: profile.secret,
      enableRateLimit: true,
    });
  }

  /**
   * Get exchange instance by profile ID
   */
  getExchangeForProfile(profileId: string): ccxt.Exchange {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }
    return this.createExchangeInstance(profile);
  }

  /**
   * Fetch ticker/market data for a pair
   */
  async fetchTicker(profileId: string, pair: string): Promise<MarketData> {
    const exchange = this.getExchangeForProfile(profileId);
    return fetchMarketData(exchange, pair);
  }

  /**
   * Fetch open orders for a profile/pair
   */
  async fetchOpenOrders(profileId: string, pair?: string): Promise<OrderInfo[]> {
    const exchange = this.getExchangeForProfile(profileId);
    return fetchOpenOrdersCCXT(exchange, pair);
  }

  /**
   * Fetch closed/filled orders for a profile
   */
  async fetchClosedOrders(profileId: string, limit?: number): Promise<OrderInfo[]> {
    const exchange = this.getExchangeForProfile(profileId);
    return fetchClosedOrdersCCXT(exchange, undefined, limit);
  }

  /**
   * Fetch all orders (open and closed) for a profile
   */
  async fetchAllOrders(profileId: string, closedLimit: number = 10): Promise<{ open: OrderInfo[]; closed: OrderInfo[] }> {
    const exchange = this.getExchangeForProfile(profileId);
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
    const exchange = this.getExchangeForProfile(profileId);

    // Update recent pairs
    this.updateRecentOrderPair(profileId, params.pair);

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
    const exchange = this.getExchangeForProfile(profileId);
    return cancelOrderCCXT(exchange, orderId, pair);
  }

  /**
   * Cancel all orders for a pair
   */
  async cancelAllOrders(profileId: string, pair: string): Promise<void> {
    const exchange = this.getExchangeForProfile(profileId);
    return cancelAllOrdersCCXT(exchange, pair);
  }

  // Recent order pairs management

  /**
   * Get recently used Profile:Pair combinations
   */
  getRecentOrderPairs(): RecentOrderPair[] {
    const config = this.readConfig();
    return config.recentOrderPairs || [];
  }

  /**
   * Update a recent order pair (add or update timestamp)
   */
  updateRecentOrderPair(profileId: string, pair: string): void {
    const config = this.readConfig();
    const profile = this.getProfile(profileId);
    if (!profile) return;

    if (!config.recentOrderPairs) {
      config.recentOrderPairs = [];
    }

    // Find existing entry
    const existingIndex = config.recentOrderPairs.findIndex(
      (r) => r.profileId === profileId && r.pair === pair
    );

    const entry: RecentOrderPair = {
      profileId,
      profileName: profile.name,
      pair,
      lastUsed: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      config.recentOrderPairs[existingIndex] = entry;
    } else {
      config.recentOrderPairs.unshift(entry);
      // Keep only last 20 entries
      if (config.recentOrderPairs.length > 20) {
        config.recentOrderPairs = config.recentOrderPairs.slice(0, 20);
      }
    }

    this.writeConfig(config);
  }

  // Bot management methods

  /**
   * Get all bots for a profile
   */
  getBots(profileId: string): Bot[] {
    const profile = this.getProfile(profileId);
    return profile?.bots || [];
  }

  /**
   * Get a specific bot by ID
   */
  getBot(profileId: string, botId: string): Bot | undefined {
    const bots = this.getBots(profileId);
    return bots.find(b => b.id === botId);
  }

  /**
   * Create a new bot for a profile
   */
  createBot(profileId: string, config: BotConfig): Bot {
    const configData = this.readConfig();
    const profileIndex = configData.profiles.findIndex(p => p.id === profileId);

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

    if (!configData.profiles[profileIndex].bots) {
      configData.profiles[profileIndex].bots = [];
    }

    configData.profiles[profileIndex].bots!.push(bot);
    this.writeConfig(configData);

    return bot;
  }

  /**
   * Update a bot's configuration
   */
  updateBot(profileId: string, botId: string, updates: Partial<BotConfig>): Bot {
    const configData = this.readConfig();
    const profileIndex = configData.profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    const bots = configData.profiles[profileIndex].bots || [];
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

    configData.profiles[profileIndex].bots![botIndex] = updatedBot;
    this.writeConfig(configData);

    return updatedBot;
  }

  /**
   * Delete a bot
   */
  deleteBot(profileId: string, botId: string): void {
    const configData = this.readConfig();
    const profileIndex = configData.profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    const bots = configData.profiles[profileIndex].bots || [];
    const botIndex = bots.findIndex(b => b.id === botId);

    if (botIndex === -1) {
      throw new Error(`Bot with id ${botId} not found`);
    }

    configData.profiles[profileIndex].bots = bots.filter(b => b.id !== botId);
    this.writeConfig(configData);
  }
}
