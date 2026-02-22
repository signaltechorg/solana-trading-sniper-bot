import { CandlestickRepository } from '../../repository';
import { ExchangeCandlestick } from '../../dict/exchange_candlestick';

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export class CandleImporter {
  private trottle: Record<string, ExchangeCandlestick> = {};
  private promises: Array<() => void> = [];

  constructor(private candlestickRepository: CandlestickRepository) {

    setInterval(async () => {
      const candles = Object.values(this.trottle);
      this.trottle = {};

      const promises = this.promises.slice();
      this.promises = [];

      // on init we can have a lot or REST api we can have a lot of candles
      // reduce database locking time by split them
      if (candles.length > 0) {
        for (const candleChunk of chunkArray(candles, 1000)) {
          await this.insertCandles(candleChunk);
        }
      }

      promises.forEach(resolve => {
        resolve();
      });
    }, 1000 * 5);
  }

  async insertCandles(candles: ExchangeCandlestick[]): Promise<void> {
    return this.candlestickRepository.insertCandles(candles);
  }

  /**
   * We have spikes in each exchange on possible every full minute, collect them for a time range the candles and fire them at once
   *
   * @param candles
   * @returns {Promise<void>}
   */
  async insertThrottledCandles(candles: ExchangeCandlestick[]): Promise<void> {
    for (const candle of candles) {
      this.trottle[candle.exchange + candle.symbol + candle.period + candle.time] = candle;
    }

    const { promise, resolve } = this.getPromise();

    this.promises.push(resolve!);

    return promise!;
  }

  /**
   * @private
   */
  getPromise(): { promise: Promise<void>; resolve: (() => void) | undefined } {
    let resolve: (() => void) | undefined;

    const promise = new Promise<void>(res => {
      resolve = res;
    });

    return { promise, resolve };
  }
}
