import * as ccxt from 'ccxt';
import { CandleImporter } from './candle_importer';
import { ExchangeCandlestick } from '../../dict/exchange_candlestick';
import { Logger } from '../services';

// [exchange, symbol, period]
export type PrefillJob = [string, string, string];

const CANDLES_LIMIT = 500;

export class CcxtCandlePrefillService {
  private queue: PrefillJob[] = [];
  private running = false;

  constructor(private candleImporter: CandleImporter, private logger: Logger) {}

  enqueue(jobs: PrefillJob[]): void {
    const newJobs = jobs.filter(j => !this.queue.some(q => this.key(q) === this.key(j)));
    if (newJobs.length === 0) return;

    this.queue.push(...newJobs);
    this.logger.info(`[CcxtCandlePrefill] Queued ${newJobs.length} jobs (${this.queue.length} pending)`);
    this.processQueue();
  }

  isRunning(): boolean {
    return this.running;
  }

  pendingCount(): number {
    return this.queue.length;
  }

  private key([exchange, symbol, period]: PrefillJob): string {
    return `${exchange}:${symbol}:${period}`;
  }

  private processQueue(): void {
    if (this.running) return;
    this.running = true;

    // Fire and forget — errors are logged, never thrown
    this.runLoop().finally(() => {
      this.running = false;
    });
  }

  private async runLoop(): Promise<void> {
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;

      try {
        const count = await this.fetchAndStore(job);
        this.logger.info(`[CcxtCandlePrefill] ${this.key(job)}: stored ${count} candles (${this.queue.length} remaining)`);
      } catch (e: any) {
        this.logger.error(`[CcxtCandlePrefill] ${this.key(job)}: ${e.message || String(e)}`, { job });
      }
    }
  }

  /**
   * Fetch 500 candles from the exchange REST API and return them immediately.
   * No DB storage — caller uses the candles directly.
   */
  async fetchDirect(exchange: string, symbol: string, period: string): Promise<ExchangeCandlestick[]> {
    return this.fetchRaw(exchange, symbol, period);
  }

  private async fetchAndStore([exchange, symbol, period]: PrefillJob): Promise<number> {
    const candles = await this.fetchRaw(exchange, symbol, period);
    await this.candleImporter.insertCandles(candles);
    return candles.length;
  }

  private async fetchRaw(exchange: string, symbol: string, period: string): Promise<ExchangeCandlestick[]> {
    const ExchangeClass = (ccxt as any)[exchange];
    if (!ExchangeClass) {
      throw new Error(`Exchange "${exchange}" not found in CCXT`);
    }

    const ccxtExchange: ccxt.Exchange = new ExchangeClass({ enableRateLimit: true });
    await ccxtExchange.loadMarkets();

    const ohlcv = await ccxtExchange.fetchOHLCV(symbol, period, undefined, CANDLES_LIMIT) as number[][];

    // Drop the last candle — it may still be forming
    const complete = ohlcv.slice(0, -1);

    return complete.map(c => new ExchangeCandlestick(
      exchange,
      symbol,
      period,
      Math.floor(c[0] / 1000),
      c[1],
      c[2],
      c[3],
      c[4],
      c[5]
    ));
  }
}
