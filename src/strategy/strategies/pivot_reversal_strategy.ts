/**
 * Pivot Reversal Strategy - Pivot point breakouts filtered by SMA200 trend direction
 *
 * Long: Price > SMA200 and 7-candle average close breaks above a recent high pivot
 * Short: Price < SMA200 and 7-candle average close breaks below a recent low pivot
 * Close: Not auto-closed — use a watchdog
 *
 * Note: V1 used multi-timeframe (1m candles, 15m pivots, 1h SMA). V2 uses single
 * timeframe for all indicators. Adjust the period in the backtest/live config accordingly.
 */

import strategy, { StrategyBase, TypedStrategyContext, StrategySignal, type TypedIndicatorDefinition, type PivotPointResult } from '../strategy';

// ============== Strategy Options ==============

export interface PivotReversalStrategyOptions {
  left?: number;
  right?: number;
  sma_length?: number;
}

// ============== Indicator Definition ==============

export type PivotReversalStrategyIndicators = {
  pivot_points: TypedIndicatorDefinition<'pivot_points_high_low'>;
  sma200: TypedIndicatorDefinition<'sma'>;
};

// ============== Strategy Implementation ==============

export class PivotReversalStrategy extends StrategyBase<PivotReversalStrategyIndicators, PivotReversalStrategyOptions> {
  getDescription(): string {
    return 'Pivot reversal entries filtered by SMA200 trend direction';
  }

  defineIndicators(): PivotReversalStrategyIndicators {
    return {
      pivot_points: strategy.indicator.pivotPointsHighLow({
        left: this.options.left,
        right: this.options.right,
      }),
      sma200: strategy.indicator.sma({ length: this.options.sma_length }),
    };
  }

  async execute(context: TypedStrategyContext<PivotReversalStrategyIndicators>, signal: StrategySignal): Promise<void> {
    const { price, lastSignal } = context;

    const smaArr = (context.getIndicator('sma200') as (number | null)[]).filter(v => v !== null) as number[];
    const pivotArr = context.getIndicator('pivot_points') as (PivotPointResult | null)[];

    if (smaArr.length < 10 || !pivotArr.length) {
      return;
    }

    const sma200 = smaArr[smaArr.length - 1];
    signal.debugAll({ sma200: Math.round(sma200 * 100) / 100 });

    // Only open new positions — watchdog handles closing
    if (lastSignal) {
      return;
    }

    const isLong = price > sma200;

    // Use last 7 close prices as average (replaces 1m candle average from V1)
    const last7Prices = context.getLastPrices(7);
    if (last7Prices.length < 7) {
      return;
    }
    const avgClose = last7Prices.reduce((a, b) => a + b, 0) / last7Prices.length;

    // Scan the last 3 pivot values (newest first)
    const recentPivots = pivotArr.slice(-3).slice().reverse();

    for (const pivot of recentPivots) {
      if (!pivot) continue;

      if (!isLong && pivot.low && pivot.low.low !== undefined) {
        if (avgClose < pivot.low.low) {
          signal.debugAll({ pivot_low: pivot.low.low, avg_close: Math.round(avgClose * 100) / 100 });
          signal.goShort();
        }
        break;
      }

      if (isLong && pivot.high && pivot.high.high !== undefined) {
        if (avgClose > pivot.high.high) {
          signal.debugAll({ pivot_high: pivot.high.high, avg_close: Math.round(avgClose * 100) / 100 });
          signal.goLong();
        }
        break;
      }
    }
  }

  protected getDefaultOptions(): PivotReversalStrategyOptions {
    return {
      left: 4,
      right: 2,
      sma_length: 200,
    };
  }
}
