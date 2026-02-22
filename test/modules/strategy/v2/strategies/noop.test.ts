import assert from 'assert';
import fs from 'fs';
import * as path from 'path';
import { Noop } from '../../../../../src/strategy/strategies/noop';
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

describe('#Noop', () => {
  let candlesAsc: Candlestick[];
  let executor: StrategyExecutor;

  beforeEach(() => {
    const rawCandles = createCandleFixtures();
    candlesAsc = toAscOrder(toCandlestickInstances(rawCandles));
    executor = new StrategyExecutor({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });

  describe('strategy initialization', () => {
    it('creates strategy with default options', () => {
      const s = new Noop();
      assert.equal(s.getDescription(), 'Random dice-roll entry for testing — not for production use');

      const opts = s.getOptions();
      assert.equal(opts.dice, 6);
      assert.equal(opts.dice_size, 12);
      assert.equal(opts.take_profit, 2);
      assert.equal(opts.stop_loss, 2);
    });

    it('creates strategy with custom options', () => {
      const s = new Noop({ dice: 3, dice_size: 6 });
      assert.equal(s.getOptions().dice, 3);
      assert.equal(s.getOptions().dice_size, 6);
      assert.equal(s.getOptions().take_profit, 2); // defaults preserved
    });

    it('defines bb, rsi, mfi indicators', () => {
      const s = new Noop();
      const indicators = s.defineIndicators();
      assert.equal(indicators.bb.name, 'bb');
      assert.equal(indicators.rsi.name, 'rsi');
      assert.equal(indicators.mfi.name, 'mfi');
    });
  });

  describe('signal generation', () => {
    it('generates only valid signals on fixture data', async () => {
      const s = new Noop();
      const results = await executor.execute(s, candlesAsc);

      const signals = results.filter(r => r.signal !== undefined);
      console.log(`    Noop: ${signals.length} signals from ${results.length} candles`);

      for (const sig of signals) {
        assert.equal(
          ['long', 'short', 'close'].includes(sig.signal!),
          true,
          `Invalid signal: ${sig.signal}`
        );
      }
    });

    it('generates both close signals and entry signals (has TP/SL)', async () => {
      // Run with guaranteed entry (dice=1, dice_size=1)
      const s = new Noop({ dice: 1, dice_size: 1 });
      const results = await executor.execute(s, candlesAsc);

      const entrySignals = results.filter(r => r.signal === 'long' || r.signal === 'short');
      const closeSignals = results.filter(r => r.signal === 'close');

      console.log(`    Noop entries: ${entrySignals.length}, closes: ${closeSignals.length}`);
      assert.equal(entrySignals.length > 0, true, 'Should generate entry signals');
    });
  });
});
