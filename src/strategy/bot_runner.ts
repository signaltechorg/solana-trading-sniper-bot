import { Notify } from '../notify/notify';
import { Logger } from '../modules/services';
import { SignalLogger } from '../modules/signal/signal_logger';
import { ProfileService } from '../profile/profile_service';
import { StrategyExecutor } from '../modules/strategy/v2/typed_backtest';
import type { Bot, Profile } from '../profile/types';

/** Convert a period string (e.g. "15m", "4h", "1d") to whole minutes. */
function periodToMinutes(period: string): number {
  const unit = period.slice(-1).toLowerCase();
  const num = parseInt(period.slice(0, -1), 10);
  switch (unit) {
    case 'm':
      return num;
    case 'h':
      return num * 60;
    case 'd':
      return num * 60 * 24;
    default:
      throw new Error(`BotRunner: unsupported period unit "${unit}" in "${period}"`);
  }
}

/**
 * CCXT uses a colon in the pair symbol to denote futures/swap markets,
 * e.g. "BTC/USDT:USDT". Spot pairs have no colon: "BTC/USDT".
 */
function isFuturesPair(pair: string): boolean {
  return pair.includes(':');
}

export class BotRunner {
  private started = false;

  constructor(
    private readonly profileService: ProfileService,
    private readonly strategyExecutor: StrategyExecutor,
    private readonly notifier: Notify,
    private readonly signalLogger: SignalLogger,
    private readonly logger: Logger
  ) {}

  /**
   * Start a single setInterval that fires once per minute, ~8 seconds after
   * the minute boundary (after the 1m candle closed on the exchange).
   *
   * On each tick every running bot is checked: if the current elapsed-minute
   * count is divisible by the bot's period, its strategy is evaluated.
   *
   * Examples at minute 60:  1m ✓  3m ✓  5m ✓  15m ✓  30m ✓  1h ✓
   * Examples at minute 15:  1m ✓  3m ✓  5m ✓  15m ✓  30m ✗  1h ✗
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    const oneMinuteMs = 60_000;
    const now = Date.now();
    const nextBoundary = Math.ceil(now / oneMinuteMs) * oneMinuteMs;
    const delay = nextBoundary - now + 8_000;

    setTimeout(() => {
      this.onTick();
      setInterval(() => this.onTick(), oneMinuteMs);
    }, delay);

    this.logger.info(`BotRunner: first tick in ${(delay / 1000).toFixed(1)}s`);
  }

  private async onTick(): Promise<void> {
    const running = this.getRunningBots();
    if (running.length === 0) return;

    const minutesSinceEpoch = Math.floor(Date.now() / 60_000);

    for (const { bot, profile } of running) {
      let periodMin: number;
      try {
        periodMin = periodToMinutes(bot.interval);
      } catch {
        this.logger.warn(`BotRunner: bot "${bot.id}" has unsupported interval "${bot.interval}", skipping`);
        continue;
      }

      if (minutesSinceEpoch % periodMin !== 0) continue;

      this.logger.info(`BotRunner: triggered "${bot.id}" (${bot.strategy} ${profile.exchange}:${bot.pair} ${bot.interval})`);

      try {
        await this.runBot(bot, profile);
      } catch (err) {
        this.logger.error(`BotRunner: bot "${bot.id}" (${bot.strategy} ${profile.exchange}:${bot.pair}) failed: ${err}`);
      }
    }
  }

  private async runBot(bot: Bot, profile: Profile): Promise<void> {
    const marketData = await this.profileService.fetchTicker(profile.id, bot.pair);

    const isWatchOnly = bot.mode === 'watch';

    // Execute strategy
    const signal = await this.strategyExecutor.executeStrategy(
      bot.strategy,
      profile.exchange,
      bot.pair,
      bot.interval,
      bot.options ?? {}
    );

    if (!signal) return;

    this.signalLogger.signal(profile.exchange, bot.pair, { price: marketData.ask, strategy: bot.strategy }, signal, bot.strategy);

    this.notifier.send(`[${signal} (${bot.strategy})] ${profile.exchange}:${bot.pair} @ ${marketData.ask}`);

    this.logger.info(`BotRunner: signal "${signal}" ${profile.exchange}:${bot.pair} via "${bot.strategy}"`);

    if (!isWatchOnly) {
      await this.executeSignal(bot, profile, signal);
    }
  }

  /**
   * Execute a trade signal via CCXT through ProfileService.
   *
   * close + futures pair  → closePosition() at market
   * close + spot pair     → sell full free balance of the base currency at market
   * long                  → market buy with bot.capital (quote currency)
   * short                 → market sell with bot.capital (quote currency)
   */
  private async executeSignal(bot: Bot, profile: Profile, signal: string): Promise<void> {
    switch (signal) {
      case 'close': {
        if (isFuturesPair(bot.pair)) {
          await this.profileService.closePosition(profile.id, bot.pair, 'market');
        } else {
          // Spot: sell the full free balance of the base currency
          const baseCurrency = bot.pair.split('/')[0];
          const balances = await this.profileService.fetchBalances(profile);
          const base = balances.find(b => b.currency === baseCurrency);
          if (base && base.free > 0) {
            await this.profileService.placeOrder(profile.id, {
              pair: bot.pair,
              side: 'sell',
              type: 'market',
              amount: base.free,
              isQuoteCurrency: false
            });
          }
        }
        break;
      }

      case 'long':
      case 'short':
        await this.profileService.placeOrder(profile.id, {
          pair: bot.pair,
          side: signal === 'long' ? 'buy' : 'sell',
          type: 'market',
          amount: bot.capital,
          isQuoteCurrency: true
        });
        break;
    }
  }

  private getRunningBots(): Array<{ bot: Bot; profile: Profile }> {
    const result: Array<{ bot: Bot; profile: Profile }> = [];
    for (const profile of this.profileService.getProfiles()) {
      for (const bot of profile.bots ?? []) {
        if (bot.status === 'running') result.push({ bot, profile });
      }
    }
    return result;
  }
}
