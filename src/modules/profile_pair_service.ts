const NodeCache = require('node-cache');
import * as ccxt from 'ccxt';
import { Profile } from '../profile/types';

export interface ProfilePair {
  profileId: string;
  profileName: string;
  pair: string;
  type: 'spot' | 'margin' | 'swap' | 'future' | 'option';
}

export interface ProfilePairResult {
  pairs: ProfilePair[];
  errors: string[];
}

export class ProfilePairService {
  // Cache markets per exchange for 5 minutes (300 seconds)
  private marketCache: any;

  constructor() {
    this.marketCache = new NodeCache({
      stdTTL: 300,
      checkperiod: 60,
      useClones: false
    });
  }

  /**
   * Get all pairs for a list of profiles with caching per exchange
   */
  async getAllPairs(profiles: Profile[]): Promise<ProfilePairResult> {
    const allPairs: ProfilePair[] = [];
    const errors: string[] = [];

    for (const profile of profiles) {
      try {
        const markets = await this.getMarketsForExchange(profile.exchange, profile);

        for (const market of markets) {
          if (market.active && !market.option) {
            allPairs.push({
              profileId: profile.id,
              profileName: profile.name,
              pair: market.symbol,
              type: this.getMarketType(market)
            });
          }
        }
      } catch (e: any) {
        const errorMsg = `Profile "${profile.name}" (${profile.exchange}): ${e.message || String(e)}`;
        errors.push(errorMsg);
        console.error(`Failed to load markets for profile ${profile.name}:`, e);
      }
    }

    // Sort by profile:pair
    allPairs.sort((a, b) => {
      const keyA = `${a.profileName}:${a.pair}`;
      const keyB = `${b.profileName}:${b.pair}`;
      return keyA.localeCompare(keyB);
    });

    return { pairs: allPairs, errors };
  }

  /**
   * Get markets for an exchange with caching
   */
  private async getMarketsForExchange(exchangeName: string, profile: Profile): Promise<any[]> {
    const cacheKey = `${exchangeName}:${profile.apiKey ? 'auth' : 'public'}`;

    // Check cache
    const cached = this.marketCache.get(cacheKey) as any[] | undefined;
    if (cached) {
      return cached;
    }

    // Load from exchange
    const ExchangeClass = (ccxt as any)[exchangeName];
    if (!ExchangeClass) {
      throw new Error(`Exchange ${exchangeName} not supported`);
    }

    const exchange = new ExchangeClass({
      apiKey: profile.apiKey,
      secret: profile.secret,
      enableRateLimit: true
    });

    await exchange.loadMarkets();
    const markets = Object.values(exchange.markets) as any[];

    // Store in cache
    this.marketCache.set(cacheKey, markets);

    return markets;
  }

  /**
   * Determine market type
   */
  private getMarketType(market: any): 'spot' | 'margin' | 'swap' | 'future' | 'option' {
    if (market.option) return 'option';
    if (market.future) return 'future';
    if (market.swap) return 'swap';
    if (market.margin) return 'margin';
    return 'spot';
  }

  /**
   * Clear cache for a specific exchange or all
   */
  clearCache(exchangeName?: string): void {
    if (exchangeName) {
      // Clear all keys starting with this exchange
      const keys = this.marketCache.keys().filter(k => k.startsWith(exchangeName));
      this.marketCache.del(keys);
    } else {
      this.marketCache.flushAll();
    }
  }
}
