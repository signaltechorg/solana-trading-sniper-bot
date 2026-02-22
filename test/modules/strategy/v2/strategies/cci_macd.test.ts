import assert from 'assert';
import fs from 'fs';
import * as path from 'path';
import { CciMacd } from '../../../../../src/strategy/strategies/cci_macd';
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

describe('#CciMacd', () => {
  let candlesAsc: Candlestick[];
  let executor: StrategyExecutor;

  beforeEach(() => {
    const rawCandles = createCandleFixtures();
    candlesAsc = toAscOrder(toCandlestickInstances(rawCandles));
    executor = new StrategyExecutor({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });

  describe('strategy initialization', () => {
    it('creates strategy with default options', () => {
      const s = new CciMacd();
      assert.equal(s.getDescription(), 'CCI reversal with MACD pivot confirmation and SMA trend filter');

      const opts = s.getOptions();
      assert.equal(opts.cci_length, 40);
      assert.equal(opts.sma_length, 400);
      assert.equal(opts.macd_fast_length, 24);
      assert.equal(opts.cci_trigger, 150);
    });

    it('creates strategy with custom options', () => {
      const s = new CciMacd({ cci_trigger: 100, sma_length: 200 });
      assert.equal(s.getOptions().cci_trigger, 100);
      assert.equal(s.getOptions().sma_length, 200);
      assert.equal(s.getOptions().cci_length, 40); // defaults preserved
    });

    it('defines cci, adx, macd, sma indicators', () => {
      const s = new CciMacd();
      const indicators = s.defineIndicators();
      assert.equal(indicators.cci.name, 'cci');
      assert.equal(indicators.adx.name, 'adx');
      assert.equal(indicators.macd.name, 'macd');
      assert.equal(indicators.sma.name, 'sma');
    });
  });

  describe('signal generation', () => {
    it('generates only valid signals on fixture data', async () => {
      const s = new CciMacd();
      const results = await executor.execute(s, candlesAsc);

      const signals = results.filter(r => r.signal !== undefined);
      console.log(`    CciMacd: ${signals.length} signals from ${results.length} candles`);

      for (const sig of signals) {
        assert.equal(
          ['long', 'short', 'close'].includes(sig.signal!),
          true,
          `Invalid signal: ${sig.signal}`
        );
      }
    });

    it('does not generate signals during warmup', async () => {
      const s = new CciMacd();
      const results = await executor.execute(s, candlesAsc);
      const warmupSignals = results.slice(0, 50).filter(r => r.signal !== undefined);
      assert.equal(warmupSignals.length, 0, 'No signals expected during warmup');
    });
  });
});
