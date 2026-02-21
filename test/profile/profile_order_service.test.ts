import assert from 'assert';
import {
  placeLimitOrder,
  placeMarketOrder,
  roundAmountDown,
  roundToPrecision
} from '../../src/profile/profile_order_service';
import { OrderParams } from '../../src/profile/types';

// ─── Market fixtures ────────────────────────────────────────────────────────

const SPOT_MARKET = {
  base: 'ETH',
  quote: 'USDT',
  type: 'spot',
  precision: { amount: 0.00001, price: 0.01 },
  limits: { amount: { min: 0.00001, max: 2600 } }
};

// Bybit ETH/USDT:USDT linear – lot size 0.01 ETH (the problematic one)
const SWAP_MARKET = {
  base: 'ETH',
  quote: 'USDT',
  type: 'swap',
  precision: { amount: 0.01, price: 0.01 },
  limits: { amount: { min: 0.01, max: 8000 } }
};

// ─── Mock factory ────────────────────────────────────────────────────────────

function makeMockOrder(overrides: Record<string, any> = {}) {
  return {
    id: 'order-123',
    status: 'open',
    type: 'limit',
    side: 'buy',
    price: 2700,
    amount: 0.05,
    filled: 0,
    remaining: 0.05,
    ...overrides
  };
}

/**
 * Creates a mock CCXT exchange. `markets` is a dict of pair → market object.
 * `createOrderResult` is returned from createOrder (or a function for per-call control).
 */
function makeMockExchange(options: {
  markets: Record<string, any>;
  createOrderResult?: any | ((pair: string, type: string, side: string, amount: number, price?: number) => any);
  tickerLast?: number;
}) {
  return {
    async loadMarkets() {
      return options.markets;
    },
    async fetchTicker(_pair: string) {
      return { last: options.tickerLast ?? 2700, close: options.tickerLast ?? 2700 };
    },
    async createOrder(pair: string, type: string, side: string, amount: number, price?: number) {
      if (typeof options.createOrderResult === 'function') {
        return options.createOrderResult(pair, type, side, amount, price);
      }
      return options.createOrderResult ?? makeMockOrder({ amount, price });
    }
  };
}

// ─── roundAmountDown ─────────────────────────────────────────────────────────

describe('#roundAmountDown', () => {
  it('returns value unchanged when precision is undefined', () => {
    assert.strictEqual(roundAmountDown(0.12345, undefined), 0.12345);
  });

  it('floors to nearest tick (spot precision 0.00001)', () => {
    assert.strictEqual(roundAmountDown(0.004449, 0.00001), 0.00444);
  });

  it('returns 0 when value is smaller than swap lot size (the swap bug)', () => {
    // 12 USDT / 2700 ETH ≈ 0.00444 ETH – below Bybit swap minimum of 0.01
    const baseAmount = 12 / 2700;
    assert.strictEqual(roundAmountDown(baseAmount, 0.01), 0);
  });

  it('rounds down correctly for swap precision 0.01', () => {
    assert.strictEqual(roundAmountDown(0.056, 0.01), 0.05);
    assert.strictEqual(roundAmountDown(0.059, 0.01), 0.05);
    assert.strictEqual(roundAmountDown(0.01, 0.01), 0.01);
  });
});

// ─── roundToPrecision ────────────────────────────────────────────────────────

describe('#roundToPrecision', () => {
  it('returns value unchanged when precision is undefined', () => {
    assert.strictEqual(roundToPrecision(2701.5, undefined), 2701.5);
  });

  it('rounds to nearest tick', () => {
    assert.strictEqual(roundToPrecision(2700.005, 0.01), 2700.01);
    assert.strictEqual(roundToPrecision(2700.123, 0.5), 2700);
  });
});

// ─── placeLimitOrder ─────────────────────────────────────────────────────────

describe('#placeLimitOrder', () => {
  it('rejects when price is missing', async () => {
    const exchange = makeMockExchange({ markets: { 'ETH/USDT': SPOT_MARKET } });

    const params: OrderParams = {
      pair: 'ETH/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.05
      // price intentionally omitted
    };

    await assert.rejects(() => placeLimitOrder(exchange as any, params), /Price is required/);
  });

  it('rejects when market is not found', async () => {
    const exchange = makeMockExchange({ markets: {} });

    const params: OrderParams = {
      pair: 'ETH/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.05,
      price: 2700
    };

    await assert.rejects(() => placeLimitOrder(exchange as any, params), /Market ETH\/USDT not found/);
  });

  it('places a limit order on spot with base currency amount', async () => {
    let capturedAmount: number | undefined;
    let capturedPrice: number | undefined;

    const exchange = makeMockExchange({
      markets: { 'ETH/USDT': SPOT_MARKET },
      createOrderResult: (_p: any, _t: any, _s: any, amount: number, price: number) => {
        capturedAmount = amount;
        capturedPrice = price;
        return makeMockOrder({ amount, price });
      }
    });

    const params: OrderParams = {
      pair: 'ETH/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.05,
      price: 2700
    };

    const result = await placeLimitOrder(exchange as any, params);

    assert.strictEqual(capturedAmount, 0.05);
    assert.strictEqual(capturedPrice, 2700);
    assert.strictEqual(result.id, 'order-123');
  });

  it('places a limit order on spot with quote currency amount (isQuoteCurrency)', async () => {
    let capturedAmount: number | undefined;

    const exchange = makeMockExchange({
      markets: { 'ETH/USDT': SPOT_MARKET },
      createOrderResult: (_p: any, _t: any, _s: any, amount: number) => {
        capturedAmount = amount;
        return makeMockOrder({ amount });
      }
    });

    // 12 USDT / 2700 = 0.00444 ETH → rounds to 0.00444 at 0.00001 precision
    const params: OrderParams = {
      pair: 'ETH/USDT',
      side: 'buy',
      type: 'limit',
      amount: 12,
      price: 2700,
      isQuoteCurrency: true
    };

    await placeLimitOrder(exchange as any, params);
    assert.ok(capturedAmount! > 0, 'amount should be > 0 for spot');
  });

  it('rejects on swap when quote currency amount is too small (the Bybit bug)', async () => {
    const exchange = makeMockExchange({
      markets: { 'ETH/USDT:USDT': SWAP_MARKET }
    });

    // 12 USDT / 2700 ≈ 0.00444 ETH – rounds to 0 with 0.01 swap precision
    const params: OrderParams = {
      pair: 'ETH/USDT:USDT',
      side: 'buy',
      type: 'limit',
      amount: 12,
      price: 2700,
      isQuoteCurrency: true
    };

    await assert.rejects(
      () => placeLimitOrder(exchange as any, params),
      (err: Error) => {
        assert.ok(err.message.includes('amount too small'), `Unexpected error: ${err.message}`);
        assert.ok(err.message.includes('0.01 ETH'), `Should mention minimum: ${err.message}`);
        return true;
      }
    );
  });

  it('rejects on swap when base amount is below minimum lot size', async () => {
    const exchange = makeMockExchange({
      markets: { 'ETH/USDT:USDT': SWAP_MARKET }
    });

    const params: OrderParams = {
      pair: 'ETH/USDT:USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.005, // below 0.01 ETH minimum
      price: 2700
    };

    await assert.rejects(
      () => placeLimitOrder(exchange as any, params),
      /amount too small/
    );
  });

  it('places a limit order on swap with sufficient base amount', async () => {
    let capturedAmount: number | undefined;

    const exchange = makeMockExchange({
      markets: { 'ETH/USDT:USDT': SWAP_MARKET },
      createOrderResult: (_p: any, _t: any, _s: any, amount: number) => {
        capturedAmount = amount;
        return makeMockOrder({ amount });
      }
    });

    const params: OrderParams = {
      pair: 'ETH/USDT:USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.05,
      price: 2700
    };

    const result = await placeLimitOrder(exchange as any, params);

    assert.strictEqual(capturedAmount, 0.05);
    assert.ok(result.id, 'should return order with id');
  });

  it('floors amount down (never rounds up) to not exceed balance', async () => {
    let capturedAmount: number | undefined;

    const exchange = makeMockExchange({
      markets: { 'ETH/USDT:USDT': SWAP_MARKET },
      createOrderResult: (_p: any, _t: any, _s: any, amount: number) => {
        capturedAmount = amount;
        return makeMockOrder({ amount });
      }
    });

    // 0.059 ETH should floor to 0.05, not round to 0.06
    const params: OrderParams = {
      pair: 'ETH/USDT:USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.059,
      price: 2700
    };

    await placeLimitOrder(exchange as any, params);
    assert.strictEqual(capturedAmount, 0.05);
  });
});

// ─── placeMarketOrder ────────────────────────────────────────────────────────

describe('#placeMarketOrder', () => {
  it('rejects when market is not found', async () => {
    const exchange = makeMockExchange({ markets: {} });

    const params: OrderParams = {
      pair: 'ETH/USDT:USDT',
      side: 'buy',
      type: 'market',
      amount: 0.05
    };

    await assert.rejects(() => placeMarketOrder(exchange as any, params), /Market ETH\/USDT:USDT not found/);
  });

  it('rejects when ticker price is unavailable for quote currency conversion', async () => {
    const exchange = {
      async loadMarkets() {
        return { 'ETH/USDT:USDT': SWAP_MARKET };
      },
      async fetchTicker(_pair: string) {
        return { last: null, close: null }; // no price available
      }
    };

    const params: OrderParams = {
      pair: 'ETH/USDT:USDT',
      side: 'buy',
      type: 'market',
      amount: 100,
      isQuoteCurrency: true
    };

    await assert.rejects(
      () => placeMarketOrder(exchange as any, params),
      /Could not fetch current price/
    );
  });

  it('places a market order on swap with sufficient base amount', async () => {
    let capturedArgs: any[] = [];

    const exchange = makeMockExchange({
      markets: { 'ETH/USDT:USDT': SWAP_MARKET },
      createOrderResult: (pair: any, type: any, side: any, amount: number) => {
        capturedArgs = [pair, type, side, amount];
        return makeMockOrder({ type: 'market', amount });
      }
    });

    const params: OrderParams = {
      pair: 'ETH/USDT:USDT',
      side: 'sell',
      type: 'market',
      amount: 0.05
    };

    const result = await placeMarketOrder(exchange as any, params);

    assert.strictEqual(capturedArgs[0], 'ETH/USDT:USDT');
    assert.strictEqual(capturedArgs[1], 'market');
    assert.strictEqual(capturedArgs[2], 'sell');
    assert.strictEqual(capturedArgs[3], 0.05);
    assert.ok(result.id);
  });

  it('converts quote currency to base and places market order on spot', async () => {
    let capturedAmount: number | undefined;

    const exchange = makeMockExchange({
      markets: { 'ETH/USDT': SPOT_MARKET },
      tickerLast: 2700,
      createOrderResult: (_p: any, _t: any, _s: any, amount: number) => {
        capturedAmount = amount;
        return makeMockOrder({ type: 'market', amount });
      }
    });

    // 27 USDT / 2700 = 0.01 ETH → valid for spot (min 0.00001)
    const params: OrderParams = {
      pair: 'ETH/USDT',
      side: 'buy',
      type: 'market',
      amount: 27,
      isQuoteCurrency: true
    };

    await placeMarketOrder(exchange as any, params);
    assert.ok(capturedAmount! > 0);
  });

  it('rejects on swap when quote currency amount is too small (the Bybit bug)', async () => {
    const exchange = makeMockExchange({
      markets: { 'ETH/USDT:USDT': SWAP_MARKET },
      tickerLast: 2700
    });

    // 12 USDT / 2700 ≈ 0.00444 ETH → rounds to 0 at 0.01 precision
    const params: OrderParams = {
      pair: 'ETH/USDT:USDT',
      side: 'buy',
      type: 'market',
      amount: 12,
      isQuoteCurrency: true
    };

    await assert.rejects(
      () => placeMarketOrder(exchange as any, params),
      (err: Error) => {
        assert.ok(err.message.includes('amount too small'), `Unexpected error: ${err.message}`);
        assert.ok(err.message.includes('0.01 ETH'), `Should mention minimum: ${err.message}`);
        assert.ok(err.message.includes('USDT'), `Should hint to increase USDT: ${err.message}`);
        return true;
      }
    );
  });

  it('rejects on swap when base amount is below minimum lot size', async () => {
    const exchange = makeMockExchange({
      markets: { 'ETH/USDT:USDT': SWAP_MARKET }
    });

    const params: OrderParams = {
      pair: 'ETH/USDT:USDT',
      side: 'buy',
      type: 'market',
      amount: 0.005 // below 0.01 ETH minimum
    };

    await assert.rejects(
      () => placeMarketOrder(exchange as any, params),
      /amount too small/
    );
  });

  it('spot succeeds with same small USDT amount that fails on swap', async () => {
    // This documents the key behavioral difference between spot and swap
    const exchange = makeMockExchange({
      markets: { 'ETH/USDT': SPOT_MARKET },
      tickerLast: 2700,
      createOrderResult: makeMockOrder({ type: 'market' })
    });

    const params: OrderParams = {
      pair: 'ETH/USDT',
      side: 'buy',
      type: 'market',
      amount: 12, // 12 USDT – would fail on swap but not on spot
      isQuoteCurrency: true
    };

    const result = await placeMarketOrder(exchange as any, params);
    assert.ok(result.id, 'spot order should succeed');
  });
});
