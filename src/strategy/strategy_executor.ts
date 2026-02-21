/**
 * Strategy Executor for Live Trading
 *
 * Wraps the backtest StrategyExecutor for live trading use case.
 * Fetches candles, runs strategy, returns the latest signal.
 */

import { convertPeriodToMinute } from '../utils/resample';
import { StrategyExecutor as CoreExecutor } from '../modules/strategy/v2/typed_backtest';
import type { TypedIndicatorDefinition, TypedStrategy } from './strategy';
import type { Logger } from '../modules/services';
import type { TechnicalAnalysisValidator } from '../utils/technical_analysis_validator';
import type { ExchangeCandleCombine } from '../modules/exchange/exchange_candle_combine';

// Import all built-in strategies
import { AwesomeOscillatorCrossZero } from './strategies/awesome_oscillator_cross_zero';
import { Cci } from './strategies/cci';
import { CciMacd } from './strategies/cci_macd';
import { Macd } from './strategies/macd';
import { Noop } from './strategies/noop';
import { ObvPumpDump } from './strategies/obv_pump_dump';
import { ParabolicSar } from './strategies/parabolicsar';
import { PivotReversalStrategy } from './strategies/pivot_reversal_strategy';
import { Trader } from './strategies/trader';
import { DcaDipper } from './strategies/dca_dipper/dca_dipper';
import { DipCatcher } from './strategies/dip_catcher/dip_catcher';

type StrategyInstance = TypedStrategy<Record<string, TypedIndicatorDefinition<any>>>;

// Mapping of strategy names to their classes
const strategyRegistry = new Map<string, new (options?: any) => StrategyInstance>([
  ['awesome_oscillator_cross_zero', AwesomeOscillatorCrossZero],
  ['cci', Cci],
  ['cci_macd', CciMacd],
  ['macd', Macd],
  ['noop', Noop],
  ['obv_pump_dump', ObvPumpDump],
  ['parabolicsar', ParabolicSar],
  ['pivot_reversal_strategy', PivotReversalStrategy],
  ['trader', Trader],
  ['dca_dipper', DcaDipper],
  ['dip_catcher', DipCatcher],
]);

export class StrategyExecutor {
  private executor: CoreExecutor;

  constructor(
    private technicalAnalysisValidator: TechnicalAnalysisValidator,
    private exchangeCandleCombine: ExchangeCandleCombine,
    private readonly logger: Logger
  ) {
    this.executor = new CoreExecutor();
  }

  /**
   * Execute a strategy for live trading
   * @returns The signal ('long', 'short', 'close') or undefined if no signal
   */
  async executeStrategy(
    strategyName: string,
    exchange: string,
    symbol: string,
    period: string,
    options: Record<string, any>
  ): Promise<'long' | 'short' | 'close' | undefined> {
    const StrategyClass = strategyRegistry.get(strategyName);
    if (!StrategyClass) {
      throw new Error(`Strategy not found: ${strategyName}`);
    }

    // Fetch candles
    const periodAsMinute = convertPeriodToMinute(period) * 60;
    const unixtime = Math.floor(Date.now() / 1000);
    const olderThenCurrentPeriod = unixtime - (unixtime % periodAsMinute) - periodAsMinute * 0.1;

    const lookbacks = await this.exchangeCandleCombine.fetchCombinedCandles(
      exchange,
      symbol,
      period,
      [],
      olderThenCurrentPeriod
    );

    if (!lookbacks[exchange] || lookbacks[exchange].length === 0) {
      this.logger.info(`Strategy skipped: no candles: ${strategyName} ${exchange}:${symbol}`);
      return undefined;
    }

    // Validate lookbacks
    if (!this.technicalAnalysisValidator.isValidCandleStickLookback(lookbacks[exchange].slice(), period)) {
      this.logger.info(`Strategy skipped: outdated candles: ${strategyName} ${exchange}:${symbol}`);
      return undefined;
    }

    // Convert to ascending order (oldest first) for the executor
    const candlesAsc = lookbacks[exchange].slice().reverse();

    // Create strategy instance and execute
    const strategy = new StrategyClass(options);
    const signalRows = await this.executor.execute(strategy, candlesAsc);

    // Return the last row's signal
    return signalRows[signalRows.length - 1]?.signal;
  }
}
