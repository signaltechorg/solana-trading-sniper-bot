/**
 * CCI MACD Strategy - CCI reversal with MACD pivot confirmation and SMA trend filter
 *
 * Long: MACD histogram has a low pivot (<0) AND CCI recently touched -150 → open if price > SMA
 * Short: MACD histogram has a high pivot (>0) AND CCI recently touched +150 → open if price < SMA
 * Close: Opposite signal fires against current position
 */

import strategy, { StrategyBase, TypedStrategyContext, StrategySignal, type TypedIndicatorDefinition, type MacdResult } from '../strategy';

interface PivotPointsResult {
  high?: number;
  low?: number;
}

function getPivotPoints(prices: number[], left: number, right: number): PivotPointsResult {
  if (left + right + 1 > prices.length || left <= 1 || right < 0) {
    return {};
  }

  const range = prices.slice(-(left + right + 1));
  const middleValue = range[left];
  const result: PivotPointsResult = {};
  const leftRange = range.slice(0, left);
  const rightRange = range.slice(-right);

  if (
    typeof leftRange.find(c => c > middleValue) === 'undefined' &&
    typeof rightRange.find(c => c > middleValue) === 'undefined'
  ) {
    result.high = middleValue;
  }

  if (
    typeof leftRange.find(c => c < middleValue) === 'undefined' &&
    typeof rightRange.find(c => c < middleValue) === 'undefined'
  ) {
    result.low = middleValue;
  }

  return result;
}

// ============== Strategy Options ==============

export interface CciMacdOptions {
  macd_pivot_reversal?: number;
  cci_trigger?: number;
  cci_cross_lookback_for_macd_trigger?: number;
  macd_fast_length?: number;
  macd_slow_length?: number;
  macd_signal_length?: number;
  sma_length?: number;
  cci_length?: number;
  adx_length?: number;
}

// ============== Indicator Definition ==============

export type CciMacdIndicators = {
  cci: TypedIndicatorDefinition<'cci'>;
  adx: TypedIndicatorDefinition<'adx'>;
  macd: TypedIndicatorDefinition<'macd'>;
  sma: TypedIndicatorDefinition<'sma'>;
};

// ============== Strategy Implementation ==============

export class CciMacd extends StrategyBase<CciMacdIndicators, CciMacdOptions> {
  getDescription(): string {
    return 'CCI reversal with MACD pivot confirmation and SMA trend filter';
  }

  defineIndicators(): CciMacdIndicators {
    return {
      cci: strategy.indicator.cci({ length: this.options.cci_length }),
      adx: strategy.indicator.adx({ length: this.options.adx_length }),
      macd: strategy.indicator.macd({
        fast_length: this.options.macd_fast_length,
        slow_length: this.options.macd_slow_length,
        signal_length: this.options.macd_signal_length,
      }),
      sma: strategy.indicator.sma({ length: this.options.sma_length }),
    };
  }

  async execute(context: TypedStrategyContext<CciMacdIndicators>, signal: StrategySignal): Promise<void> {
    const { price } = context;

    const smaArr = (context.getIndicator('sma') as (number | null)[]).filter(v => v !== null) as number[];
    const cciArr = (context.getIndicator('cci') as (number | null)[]).filter(v => v !== null) as number[];
    const adxArr = (context.getIndicator('adx') as (number | null)[]).filter(v => v !== null) as number[];
    const macdArr = (context.getIndicator('macd') as (MacdResult | null)[]).filter(v => v !== null) as MacdResult[];

    if (!smaArr.length || !cciArr.length || !adxArr.length || !macdArr.length) {
      return;
    }

    const sma = smaArr[smaArr.length - 1];
    const cci = cciArr[cciArr.length - 1];

    const macdPivotReversal = this.options.macd_pivot_reversal!;
    const cciTrigger = this.options.cci_trigger!;
    const cciLookback = this.options.cci_cross_lookback_for_macd_trigger!;

    const allowedDirection = price > sma ? 'long' : 'short';

    signal.debugAll({
      direction: allowedDirection,
      cci: Math.round(cci * 100) / 100,
      sma: Math.round(sma * 100) / 100,
      adx: Math.round(adxArr[adxArr.length - 1] * 100) / 100,
    });

    // MACD pivot detection
    const macdSlice = macdArr.slice(macdPivotReversal * -3);
    if (macdSlice.length < macdPivotReversal * 2 + 1) {
      return;
    }

    const macdPivot = getPivotPoints(
      macdSlice.map(m => m.histogram),
      macdPivotReversal,
      macdPivotReversal
    );

    if (!macdPivot.high && !macdPivot.low) {
      return;
    }

    signal.debugAll({ macd_pivot: macdPivot });

    const recentCci = cciArr.slice(-cciLookback);

    // Determine trigger direction from MACD pivot + CCI confirmation
    let currentSignal: 'long' | 'short' | undefined;

    if (macdPivot.high && macdPivot.high > 0 && recentCci.some(v => v >= cciTrigger)) {
      currentSignal = 'short';
      signal.debugAll({ hint: 'success' });
    } else if (macdPivot.low && macdPivot.low < 0 && recentCci.some(v => v <= -cciTrigger)) {
      currentSignal = 'long';
      signal.debugAll({ hint: 'danger' });
    }

    if (!currentSignal) {
      return;
    }

    const lastSignal = context.lastSignal;

    if (!lastSignal) {
      // Open position in allowed direction only when market is not sideways
      const adxRecent = adxArr.slice(-10);
      const isSideways = adxRecent.length >= 10 && adxRecent.every(v => v <= 25);
      if (!isSideways && allowedDirection === currentSignal) {
        if (currentSignal === 'long') {
          signal.goLong();
        } else {
          signal.goShort();
        }
      }
    } else if (
      (lastSignal === 'long' && currentSignal === 'short') ||
      (lastSignal === 'short' && currentSignal === 'long')
    ) {
      signal.close();
    }
  }

  protected getDefaultOptions(): CciMacdOptions {
    return {
      macd_pivot_reversal: 5,
      cci_trigger: 150,
      cci_cross_lookback_for_macd_trigger: 12,
      macd_fast_length: 24,
      macd_slow_length: 52,
      macd_signal_length: 18,
      sma_length: 400,
      cci_length: 40,
      adx_length: 14,
    };
  }
}
