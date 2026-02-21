/**
 * Trader Strategy - Bollinger Bands squeeze breakout (experimental, long only)
 *
 * Long: Price closes above the upper Bollinger Band while the band width is narrow (< threshold)
 * No auto-close — use watchdog or stop loss orders.
 *
 * Note: V1 used multi-timeframe (1m candles + 15m BB) and resampling. V2 uses single
 * timeframe BB only. Adjust period in backtest/live config accordingly.
 */

import strategy, { StrategyBase, TypedStrategyContext, StrategySignal, type TypedIndicatorDefinition, type BollingerBandsResult } from '../strategy';

// ============== Strategy Options ==============

export interface TraderOptions {
  bb_length?: number;
  bb_width_threshold?: number;
}

// ============== Indicator Definition ==============

export type TraderIndicators = {
  bb: TypedIndicatorDefinition<'bb'>;
};

// ============== Strategy Implementation ==============

export class Trader extends StrategyBase<TraderIndicators, TraderOptions> {
  getDescription(): string {
    return 'Bollinger Bands squeeze breakout — long only (experimental)';
  }

  defineIndicators(): TraderIndicators {
    return {
      bb: strategy.indicator.bb({ length: this.options.bb_length }),
    };
  }

  async execute(context: TypedStrategyContext<TraderIndicators>, signal: StrategySignal): Promise<void> {
    const { price } = context;

    const bbArr = (context.getIndicator('bb') as (BollingerBandsResult | null)[]).filter(v => v !== null) as BollingerBandsResult[];

    if (!bbArr.length) {
      return;
    }

    const bb = bbArr[bbArr.length - 1];

    signal.debugAll({
      bb_upper: Math.round(bb.upper * 100) / 100,
      bb_width: Math.round(bb.width * 10000) / 10000,
    });

    if (price > bb.upper && bb.width < this.options.bb_width_threshold!) {
      signal.goLong();
    }
  }

  protected getDefaultOptions(): TraderOptions {
    return {
      bb_length: 40,
      bb_width_threshold: 0.05,
    };
  }
}
