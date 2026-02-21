/**
 * OBV Pump/Dump Strategy - OBV surge detection with EMA200 trend filter
 *
 * Long only: When price > EMA200 and OBV average for the last N candles is
 * at least `trigger_multiplier` times the historical high OBV average.
 * No auto-close — use watchdog or stop loss orders.
 */

import strategy, { StrategyBase, TypedStrategyContext, StrategySignal, type TypedIndicatorDefinition } from '../strategy';

// ============== Strategy Options ==============

export interface ObvPumpDumpOptions {
  trigger_multiplier?: number;
  trigger_time_windows?: number;
  ema_length?: number;
}

// ============== Indicator Definition ==============

export type ObvPumpDumpIndicators = {
  obv: TypedIndicatorDefinition<'obv'>;
  ema: TypedIndicatorDefinition<'ema'>;
};

// ============== Strategy Implementation ==============

export class ObvPumpDump extends StrategyBase<ObvPumpDumpIndicators, ObvPumpDumpOptions> {
  getDescription(): string {
    return 'OBV pump/dump detection with EMA200 trend filter (long only)';
  }

  defineIndicators(): ObvPumpDumpIndicators {
    return {
      obv: strategy.indicator.obv(),
      ema: strategy.indicator.ema({ length: this.options.ema_length }),
    };
  }

  async execute(context: TypedStrategyContext<ObvPumpDumpIndicators>, signal: StrategySignal): Promise<void> {
    const { price } = context;

    const triggerMultiplier = this.options.trigger_multiplier!;
    const triggerTimeWindows = this.options.trigger_time_windows!;

    const obvArr = (context.getIndicator('obv') as (number | null)[]).filter(v => v !== null) as number[];
    const emaArr = (context.getIndicator('ema') as (number | null)[]).filter(v => v !== null) as number[];

    if (obvArr.length <= 20 || !emaArr.length) {
      return;
    }

    const ema = emaArr[emaArr.length - 1];

    signal.debugAll({
      obv: obvArr[obvArr.length - 1],
      ema: Math.round(ema * 100) / 100,
    });

    if (price > ema) {
      // Long trend only
      signal.debugAll({ trend: 'up' });

      const endIdx = obvArr.length - triggerTimeWindows;
      const startIdx = Math.max(0, endIdx - 20);
      const before = obvArr.slice(startIdx, endIdx);

      if (!before.length) {
        return;
      }

      const sorted = [...before].sort((a, b) => b - a);
      const highest = sorted.slice(0, triggerTimeWindows);
      const highestOverage = highest.reduce((a, b) => a + b, 0) / highest.length;

      const current = obvArr.slice(-triggerTimeWindows);
      const currentAverage = current.reduce((a, b) => a + b, 0) / current.length;

      signal.debugAll({
        highest_overage: Math.round(highestOverage),
        current_average: Math.round(currentAverage),
      });

      if (currentAverage <= highestOverage) {
        return;
      }

      const difference = Math.abs(currentAverage / highestOverage);
      signal.debugAll({ difference: Math.round(difference * 100) / 100 });

      if (difference >= triggerMultiplier) {
        signal.goLong();
      }
    } else {
      signal.debugAll({ trend: 'down' });
    }
  }

  protected getDefaultOptions(): ObvPumpDumpOptions {
    return {
      trigger_multiplier: 2,
      trigger_time_windows: 3,
      ema_length: 200,
    };
  }
}
