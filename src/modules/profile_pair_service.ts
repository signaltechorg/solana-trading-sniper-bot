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

interface CoinGeckoCoin {
  symbol: string;
  name: string;
  market_cap_rank: number;
}

export class ProfilePairService {
  private marketCache: any;
  private coinGeckoCache: any;

  constructor() {
    // Cache markets per exchange for 5 minutes
    this.marketCache = new NodeCache({
      stdTTL: 300,
      checkperiod: 60,
      useClones: false
    });

    // Cache CoinGecko data for 6 hours (21600 seconds)
    this.coinGeckoCache = new NodeCache({
      stdTTL: 21600,
      checkperiod: 3600,
      useClones: false
    });
  }

  /**
   * Fetch top coins from CoinGecko (cached for 6 hours)
   */
  private async fetchCoinGeckoRankings(): Promise<Map<string, number>> {
    const cacheKey = 'coingecko_rankings';
    const cached = this.coinGeckoCache.get(cacheKey) as Map<string, number> | undefined;
    if (cached) {
      return cached;
    }

    const rankings = new Map<string, number>();

    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1'
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const coins: CoinGeckoCoin[] = await response.json();

      for (const coin of coins) {
        // Store symbol -> rank (lower is better)
        rankings.set(coin.symbol.toUpperCase(), coin.market_cap_rank);
      }

      console.log(`[ProfilePairService] Loaded ${rankings.size} coin rankings from CoinGecko`);
    } catch (e) {
      console.error('[ProfilePairService] Failed to fetch CoinGecko rankings:', e);
    }

    this.coinGeckoCache.set(cacheKey, rankings);
    return rankings;
  }

  /**
   * Get all pairs for a list of profiles with caching per exchange
   */
  async getAllPairs(profiles: Profile[]): Promise<ProfilePairResult> {
    const allPairs: ProfilePair[] = [];
    const errors: string[] = [];

    // Fetch CoinGecko rankings once for all pairs
    const rankings = await this.fetchCoinGeckoRankings();

    for (const profile of profiles) {
      try {
        const markets = await this.getMarketsForExchange(profile.exchange);

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

    // Sort by CoinGecko market cap rank (asc), then by pair name (asc)
    allPairs.sort((a, b) => {
      const rankA = rankings.get(a.pair.split(':')[0].split('/')[0].toUpperCase()) || 9999;
      const rankB = rankings.get(b.pair.split(':')[0].split('/')[0].toUpperCase()) || 9999;

      if (rankA !== rankB) {
        return rankA - rankB; // Lower rank (more popular) first
      }

      // Same rank - sort alphabetically by profile:pair
      const keyA = `${a.profileName}:${a.pair}`;
      const keyB = `${b.profileName}:${b.pair}`;
      return keyA.localeCompare(keyB);
    });

    return { pairs: allPairs, errors };
  }

  /**
   * Get markets for an exchange with caching (public data, no auth needed)
   */
  private async getMarketsForExchange(exchangeName: string): Promise<any[]> {
    // Check cache
    const cached = this.marketCache.get(exchangeName) as any[] | undefined;
    if (cached) {
      return cached;
    }

    // Load from exchange (no auth needed for public market data)
    const ExchangeClass = (ccxt as any)[exchangeName];
    if (!ExchangeClass) {
      throw new Error(`Exchange ${exchangeName} not supported`);
    }

    const exchange = new ExchangeClass({
      enableRateLimit: true
    });

    await exchange.loadMarkets();
    const markets = Object.values(exchange.markets) as any[];

    // Store in cache
    this.marketCache.set(exchangeName, markets);

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
      this.coinGeckoCache.flushAll();
    }
  }
}
