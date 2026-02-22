import assert from 'assert';
import fs from 'fs';
import * as path from 'path';
import { ObvPumpDump } from '../../../../../src/strategy/strategies/obv_pump_dump';
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

describe('#ObvPumpDump', () => {
  let candlesAsc: Candlestick[];
  let executor: StrategyExecutor;

  beforeEach(() => {
    const rawCandles = createCandleFixtures();
    candlesAsc = toAscOrder(toCandlestickInstances(rawCandles));
    executor = new StrategyExecutor({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });

  describe('strategy initialization', () => {
    it('creates strategy with default options', () => {
      const s = new ObvPumpDump();
      assert.equal(s.getDescription(), 'OBV pump/dump detection with EMA200 trend filter (long only)');

      const opts = s.getOptions();
      assert.equal(opts.trigger_multiplier, 2);
      assert.equal(opts.trigger_time_windows, 3);
      assert.equal(opts.ema_length, 200);
    });

    it('creates strategy with custom options', () => {
      const s = new ObvPumpDump({ trigger_multiplier: 3, ema_length: 100 });
      assert.equal(s.getOptions().trigger_multiplier, 3);
      assert.equal(s.getOptions().ema_length, 100);
      assert.equal(s.getOptions().trigger_time_windows, 3); // defaults preserved
    });

    it('defines obv and ema indicators', () => {
      const s = new ObvPumpDump();
      const indicators = s.defineIndicators();
      assert.equal(indicators.obv.name, 'obv');
      assert.equal(indicators.ema.name, 'ema');
    });
  });

  describe('signal generation', () => {
    it('generates only valid signals on fixture data', async () => {
      const s = new ObvPumpDump();
      const results = await executor.execute(s, candlesAsc);

      const signals = results.filter(r => r.signal !== undefined);
      console.log(`    ObvPumpDump: ${signals.length} signals from ${results.length} candles`);

      for (const sig of signals) {
        assert.equal(
          ['long', 'short', 'close'].includes(sig.signal!),
          true,
          `Invalid signal: ${sig.signal}`
        );
      }
    });

    it('only generates long signals (long-only strategy)', async () => {
      const s = new ObvPumpDump();
      const results = await executor.execute(s, candlesAsc);

      const shortSignals = results.filter(r => r.signal === 'short');
      assert.equal(shortSignals.length, 0, 'ObvPumpDump should not generate short signals');
    });
  });
});
