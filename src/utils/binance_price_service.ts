import { FileCache } from './file_cache';

interface BinanceTicker {
  symbol: string;
  price: string;
}

type PriceMap = Record<string, number>;

/**
 * Service for fetching and caching Binance USDT prices.
 * Prices are cached for 1 hour.
 */
export class BinancePriceService {
  private readonly CACHE_KEY = 'binance_usdt_prices';
  private readonly CACHE_TTL = 3600; // 1 hour in seconds
  private readonly API_URL = 'https://api.binance.com/api/v3/ticker/price';

  constructor(private cache: FileCache) {}

  /**
   * Get USDT prices for all coins.
   * Returns a record of coin -> USDT price.
   * Uses cache if available and not expired.
   */
  async getUsdtPrices(): Promise<PriceMap> {
    // Try cache first
    const cached = this.cache.get(this.CACHE_KEY) as PriceMap | undefined;
    if (cached) {
      return cached;
    }

    // Fetch from Binance API
    const response = await fetch(this.API_URL);
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const tickers = await response.json() as BinanceTicker[];

    // Filter USDT pairs and build price map
    const priceMap: PriceMap = {};

    for (const ticker of tickers) {
      // Only USDT pairs (e.g., BTCUSDT)
      if (ticker.symbol.endsWith('USDT')) {
        const coin = ticker.symbol.slice(0, -4); // Remove 'USDT' suffix
        const price = parseFloat(ticker.price);
        if (!isNaN(price) && price > 0) {
          priceMap[coin] = price;
        }
      }
    }

    // Cache the result
    this.cache.set(this.CACHE_KEY, priceMap, this.CACHE_TTL);

    return priceMap;
  }

  /**
   * Get USDT price for a single coin.
   * Returns undefined if not found.
   */
  async getUsdtPrice(coin: string): Promise<number | undefined> {
    const prices = await this.getUsdtPrices();
    return prices[coin];
  }
}
