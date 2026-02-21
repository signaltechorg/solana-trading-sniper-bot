import assert from 'assert';
import fs from 'fs';
import * as path from 'path';
import { Trader } from '../../../../../src/strategy/strategies/trader';
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

describe('#Trader', () => {
  let candlesAsc: Candlestick[];
  let executor: StrategyExecutor;

  beforeEach(() => {
    const rawCandles = createCandleFixtures();
    candlesAsc = toAscOrder(toCandlestickInstances(rawCandles));
    executor = new StrategyExecutor();
  });

  describe('strategy initialization', () => {
    it('creates strategy with default options', () => {
      const s = new Trader();
      assert.equal(s.getDescription(), 'Bollinger Bands squeeze breakout — long only (experimental)');

      const opts = s.getOptions();
      assert.equal(opts.bb_length, 40);
      assert.equal(opts.bb_width_threshold, 0.05);
    });

    it('creates strategy with custom options', () => {
      const s = new Trader({ bb_length: 20, bb_width_threshold: 0.03 });
      assert.equal(s.getOptions().bb_length, 20);
      assert.equal(s.getOptions().bb_width_threshold, 0.03);
    });

    it('defines bb indicator', () => {
      const s = new Trader();
      const indicators = s.defineIndicators();
      assert.equal(indicators.bb.name, 'bb');
    });
  });

  describe('signal generation', () => {
    it('generates only valid signals on fixture data', async () => {
      const s = new Trader();
      const results = await executor.execute(s, candlesAsc);

      const signals = results.filter(r => r.signal !== undefined);
      console.log(`    Trader: ${signals.length} signals from ${results.length} candles`);

      for (const sig of signals) {
        assert.equal(
          ['long', 'short', 'close'].includes(sig.signal!),
          true,
          `Invalid signal: ${sig.signal}`
        );
      }
    });

    it('only generates long signals (long-only strategy)', async () => {
      const s = new Trader();
      const results = await executor.execute(s, candlesAsc);

      const shortSignals = results.filter(r => r.signal === 'short');
      assert.equal(shortSignals.length, 0, 'Trader should not generate short signals');
    });
  });
});
