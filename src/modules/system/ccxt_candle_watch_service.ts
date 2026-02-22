import * as ccxt from 'ccxt';
import { CandleImporter } from './candle_importer';
import { DashboardConfigService } from './dashboard_config_service';
import { ExchangeCandlestick } from '../../dict/exchange_candlestick';
import { Logger } from '../services';

type SymbolType = 'spot' | 'swap' | 'futures';

function getSymbolType(symbol: string): SymbolType {
  const colonIdx = symbol.indexOf(':');
  if (colonIdx === -1) return 'spot';
  // dated futures have a date suffix like :USDT-260327 or :BTC-260327
  const settlement = symbol.slice(colonIdx + 1);
  if (/-\d{6}$/.test(settlement)) return 'futures';
  return 'swap';
}

export class CcxtCandleWatchService {
  // Shared candle buffer: key = "exchange:symbol:period:time"
  private buffer = new Map<string, ExchangeCandlestick>();
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  // Increment to invalidate all currently-running watcher loops
  private generation = 0;

  constructor(
    private candleImporter: CandleImporter,
    private dashboardConfigService: DashboardConfigService,
    private logger: Logger
  ) {}

  start(): void {
    this.startFlushInterval();
    this.startSubscriptions();
  }

  /**
   * Returns true if the given exchange+symbol+period is currently subscribed
   * via the websocket (i.e. it is present in the dashboard config).
   */
  isWatched(exchange: string, symbol: string, period: string): boolean {
    const config = this.dashboardConfigService.getConfig();
    return (
      config.pairs.some(p => p.exchange === exchange && p.symbol === symbol) &&
      config.periods.includes(period)
    );
  }

  /**
   * Called when dashboard settings are saved. Stops old subscriptions and
   * starts new ones reflecting the updated pairs/periods configuration.
   */
  restart(): void {
    this.generation++;
    this.logger.info(`[CcxtCandleWatch] Restarting subscriptions (gen ${this.generation})`);
    this.startSubscriptions();
  }

  stop(): void {
    this.generation++;
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  private startFlushInterval(): void {
    if (this.flushInterval) clearInterval(this.flushInterval);
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  private async flush(): Promise<void> {
    if (this.buffer.size === 0) return;
    const candles = Array.from(this.buffer.values());
    this.buffer.clear();
    try {
      await this.candleImporter.insertCandles(candles);

    } catch (e: any) {
      this.logger.error(`[CcxtCandleWatch] Flush error: ${e.message || String(e)}`);
    }
  }

  private startSubscriptions(): void {
    const config = this.dashboardConfigService.getConfig();
    const { pairs, periods } = config;

    if (pairs.length === 0 || periods.length === 0) {
      this.logger.info('[CcxtCandleWatch] No pairs configured, skipping subscriptions');
      return;
    }

    // Group pairs by exchange + symbol type so each group gets its own ccxt.pro instance.
    // Spot, swap (perpetual), and dated futures require separate instances.
    type GroupKey = string; // "exchange:type"
    const groups = new Map<GroupKey, { exchange: string; symbols: Set<string> }>();

    for (const { exchange, symbol } of pairs) {
      const type = getSymbolType(symbol);
      const key = `${exchange}:${type}`;
      if (!groups.has(key)) {
        groups.set(key, { exchange, symbols: new Set() });
      }
      groups.get(key)!.symbols.add(symbol);
    }

    const myGen = this.generation;

    for (const [, group] of groups) {
      // Build [symbol, period] pairs for watchOHLCVForSymbols
      const symbolPeriodPairs: [string, string][] = [];
      for (const symbol of group.symbols) {
        for (const period of periods) {
          symbolPeriodPairs.push([symbol, period]);
        }
      }
      this.runWatcher(group.exchange, symbolPeriodPairs, myGen);
    }

    const pairSummary = pairs.map(p => `${p.exchange}:${p.symbol}`).join(', ');
    this.logger.info(
      `[CcxtCandleWatch] Started ${groups.size} watcher(s) for ${pairs.length} pair(s) [${pairSummary}] periods [${periods.join(', ')}], gen ${myGen}`
    );
  }

  private async runWatcher(exchangeId: string, pairs: [string, string][], gen: number): Promise<void> {
    const ExchangeClass = (ccxt.pro as any)[exchangeId];
    if (!ExchangeClass) {
      this.logger.error(`[CcxtCandleWatch] Exchange "${exchangeId}" not found in ccxt.pro`);
      return;
    }

    const instance: any = new ExchangeClass({ newUpdates: true });

    while (gen === this.generation) {
      try {
        const update = await instance.watchOHLCVForSymbols(pairs);

        if (gen !== this.generation) break;

        for (const [symbol, periodMap] of Object.entries(update as Record<string, Record<string, number[][]>>)) {
          for (const [period, candleList] of Object.entries(periodMap)) {
            for (const c of candleList) {
              const time = Math.floor(c[0] / 1000);
              const key = `${exchangeId}:${symbol}:${period}:${time}`;
              this.buffer.set(
                key,
                new ExchangeCandlestick(exchangeId, symbol, period, time, c[1], c[2], c[3], c[4], c[5])
              );
            }
          }
        }
      } catch (e: any) {
        if (gen !== this.generation) break;
        this.logger.error(`[CcxtCandleWatch] ${exchangeId} watcher error: ${e.message || String(e)}`);
        // Back off before retrying so we don't spin on persistent errors
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    try {
      await instance.close();
    } catch (_) {
      // ignore close errors
    }

    this.logger.info(`[CcxtCandleWatch] Watcher stopped: ${exchangeId} gen ${gen}`);
  }
}
