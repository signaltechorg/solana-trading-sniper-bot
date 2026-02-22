import * as ccxt from 'ccxt';
import { CandleImporter } from './candle_importer';
import { DashboardConfigService } from './dashboard_config_service';
import { ExchangeCandlestick } from '../../dict/exchange_candlestick';
import { Logger } from '../services';
import { ProfileService } from '../../profile/profile_service';

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
    private logger: Logger,
    private profileService: ProfileService
  ) {}

  start(): void {
    this.startFlushInterval();
    this.startSubscriptions();
  }

  /**
   * Returns all unique (exchange, symbol) pairs currently being watched via websocket.
   * Combines pairs from dashboard config and bot configs.
   */
  getWatchedPairs(): { exchange: string; symbol: string }[] {
    const pairSet = new Map<string, { exchange: string; symbol: string }>();

    // Add pairs from dashboard config
    const config = this.dashboardConfigService.getConfig();
    for (const pair of config.pairs) {
      const key = `${pair.exchange}:${pair.symbol}`;
      pairSet.set(key, { exchange: pair.exchange, symbol: pair.symbol });
    }

    // Add pairs from bot configs
    for (const profile of this.profileService.getProfiles()) {
      for (const bot of profile.bots || []) {
        const key = `${profile.exchange}:${bot.pair}`;
        pairSet.set(key, { exchange: profile.exchange, symbol: bot.pair });
      }
    }

    return Array.from(pairSet.values());
  }

  /**
   * Returns true if the given exchange+symbol+period is currently subscribed
   * via the websocket (i.e. it is present in the dashboard config or any bot config).
   */
  isWatched(exchange: string, symbol: string, period: string): boolean {
    // Check dashboard config (cross-product of pairs × periods)
    const config = this.dashboardConfigService.getConfig();
    if (
      config.pairs.some(p => p.exchange === exchange && p.symbol === symbol) &&
      config.periods.includes(period)
    ) {
      return true;
    }
    // Check bot configs (each bot specifies a specific exchange+symbol+period triple)
    for (const profile of this.profileService.getProfiles()) {
      if (profile.exchange !== exchange) continue;
      for (const bot of profile.bots || []) {
        if (bot.pair === symbol && bot.interval === period) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Called when dashboard settings are saved. Stops old subscriptions and
   * starts new ones reflecting the updated pairs/periods configuration.
   */
  restart(): void {
    this.generation++;
    this.logger.debug(`[CcxtCandleWatch] Restarting subscriptions`);
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
    // Collect all (exchange, symbol, period) triples from dashboard config and bots, deduped.
    // Dashboard: cross-product of configured pairs × periods.
    // Bots: each bot contributes one specific (profile.exchange, bot.pair, bot.interval) triple.
    const allSubs = new Map<string, { exchange: string; symbol: string; period: string }>();
    const addSub = (exchange: string, symbol: string, period: string): void => {
      allSubs.set(`${exchange}\0${symbol}\0${period}`, { exchange, symbol, period });
    };

    const config = this.dashboardConfigService.getConfig();
    for (const pair of config.pairs) {
      for (const period of config.periods) {
        addSub(pair.exchange, pair.symbol, period);
      }
    }

    for (const profile of this.profileService.getProfiles()) {
      for (const bot of profile.bots || []) {
        addSub(profile.exchange, bot.pair, bot.interval);
      }
    }

    if (allSubs.size === 0) {
      this.logger.debug('[CcxtCandleWatch] No pairs configured, skipping subscriptions');
      return;
    }

    // Group by exchange + symbol type so each group gets its own ccxt.pro instance.
    // Spot, swap (perpetual), and dated futures require separate instances.
    type GroupKey = string; // "exchange:type"
    const groups = new Map<GroupKey, { exchange: string; symbolPeriodPairs: Map<string, [string, string]> }>();

    for (const { exchange, symbol, period } of allSubs.values()) {
      const type = getSymbolType(symbol);
      const key = `${exchange}:${type}`;
      if (!groups.has(key)) {
        groups.set(key, { exchange, symbolPeriodPairs: new Map() });
      }
      groups.get(key)!.symbolPeriodPairs.set(`${symbol}\0${period}`, [symbol, period]);
    }

    const myGen = this.generation;

    for (const [, group] of groups) {
      const symbolPeriodPairs: [string, string][] = Array.from(group.symbolPeriodPairs.values());
      this.runWatcher(group.exchange, symbolPeriodPairs, myGen);
    }

    this.logger.debug(
      `[CcxtCandleWatch] Started ${groups.size} watcher(s) for ${allSubs.size} pair+period combination(s)`
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

    this.logger.debug(`[CcxtCandleWatch] Watcher stopped: ${exchangeId}`);
  }
}
