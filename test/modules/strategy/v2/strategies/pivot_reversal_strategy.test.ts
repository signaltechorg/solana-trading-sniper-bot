import assert from 'assert';
import fs from 'fs';
import * as path from 'path';
import { PivotReversalStrategy } from '../../../../../src/strategy/strategies/pivot_reversal_strategy';
import { StrategyExecutor } from '../../../../../src/modules/strategy/v2/typed_backtest';
import { Candlestick } from '../../../../../src/dict/candlestick';

interface RawCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function createCandleFixtures(): RawCandle[] {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/btc-usdt-15m.json'), 'utf8'));
}

function toCandlestickInstances(candles: RawCandle[]): Candlestick[] {
  return candles.map(c => new Candlestick(c.time, c.open, c.high, c.low, c.close, c.volume));
}

function toAscOrder(candles: Candlestick[]): Candlestick[] {
  return candles.slice().reverse();
}

describe('#PivotReversalStrategy', () => {
  let candlesAsc: Candlestick[];
  let executor: StrategyExecutor;

  beforeEach(() => {
    const rawCandles = createCandleFixtures();
    candlesAsc = toAscOrder(toCandlestickInstances(rawCandles));
    executor = new StrategyExecutor();
  });

  describe('strategy initialization', () => {
    it('creates strategy with default options', () => {
      const s = new PivotReversalStrategy();
      assert.equal(s.getDescription(), 'Pivot reversal entries filtered by SMA200 trend direction');

      const opts = s.getOptions();
      assert.equal(opts.left, 4);
      assert.equal(opts.right, 2);
      assert.equal(opts.sma_length, 200);
    });

    it('creates strategy with custom options', () => {
      const s = new PivotReversalStrategy({ left: 6, right: 3 });
      assert.equal(s.getOptions().left, 6);
      assert.equal(s.getOptions().right, 3);
      assert.equal(s.getOptions().sma_length, 200); // defaults preserved
    });

    it('defines pivot_points and sma200 indicators', () => {
      const s = new PivotReversalStrategy();
      const indicators = s.defineIndicators();
      assert.equal(indicators.pivot_points.name, 'pivot_points_high_low');
      assert.equal(indicators.sma200.name, 'sma');
    });
  });

  describe('signal generation', () => {
    it('generates only valid signals on fixture data', async () => {
      const s = new PivotReversalStrategy();
      const results = await executor.execute(s, candlesAsc);

      const signals = results.filter(r => r.signal !== undefined);
      console.log(`    PivotReversalStrategy: ${signals.length} signals from ${results.length} candles`);

      for (const sig of signals) {
        assert.equal(
          ['long', 'short', 'close'].includes(sig.signal!),
          true,
          `Invalid signal: ${sig.signal}`
        );
      }
    });

    it('does not auto-close positions (watchdog-dependent)', async () => {
      const s = new PivotReversalStrategy();
      const results = await executor.execute(s, candlesAsc);

      const closeSignals = results.filter(r => r.signal === 'close');
      assert.equal(closeSignals.length, 0, 'PivotReversalStrategy should not auto-close positions');
    });
  });
});
