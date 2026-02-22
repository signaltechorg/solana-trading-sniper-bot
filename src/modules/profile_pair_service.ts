import { Profile } from '../profile/types';
import { FileCache } from './services';
import { ExchangeInstanceService } from './system/exchange_instance_service';

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

const MARKET_TTL = 300; // 5 minutes
const COINGECKO_TTL = 21600; // 6 hours

export class ProfilePairService {
  private cache: FileCache;
  private exchangeInstanceService: ExchangeInstanceService;

  constructor(cache: FileCache, exchangeInstanceService: ExchangeInstanceService) {
    this.cache = cache;
    this.exchangeInstanceService = exchangeInstanceService;
  }

  /**
   * Fetch top coins from CoinGecko (cached for 6 hours)
   */
  private async fetchCoinGeckoRankings(): Promise<Record<string, number>> {
    const cacheKey = 'coingecko:rankings';
    const cached = this.cache.get(cacheKey) as Record<string, number> | undefined;
    if (cached) {
      return cached;
    }

    const rankings: Record<string, number> = {};

    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1'
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const coins = (await response.json()) as CoinGeckoCoin[];

      for (const coin of coins) {
        rankings[coin.symbol.toUpperCase()] = coin.market_cap_rank;
      }

      console.log(`[ProfilePairService] Loaded ${Object.keys(rankings).length} coin rankings from CoinGecko`);
    } catch (e) {
      console.error('[ProfilePairService] Failed to fetch CoinGecko rankings:', e);
    }

    this.cache.set(cacheKey, rankings, COINGECKO_TTL);
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
      const rankA = rankings[a.pair.split(':')[0].split('/')[0].toUpperCase()] || 9999;
      const rankB = rankings[b.pair.split(':')[0].split('/')[0].toUpperCase()] || 9999;

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
  async getMarketsForExchange(exchangeName: string): Promise<any[]> {
    const cacheKey = `market:${exchangeName}`;
    const cached = this.cache.get(cacheKey) as any[] | undefined;
    if (cached) {
      return cached;
    }

    const exchange = await this.exchangeInstanceService.getPublicExchange(exchangeName);
    const markets = Object.values(exchange.markets) as any[];

    this.cache.set(cacheKey, markets, MARKET_TTL);
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
}
