import assert from 'assert';
import { mock, when, instance, verify, capture, anything } from 'ts-mockito';
import * as ccxt from 'ccxt';
import {
  placeLimitOrder,
  placeMarketOrder,
  roundAmountDown,
  roundToPrecision
} from '../../src/profile/profile_order_service';
import { OrderParams } from '../../src/profile/types';

// ─── Market fixtures ─────────────────────────────────────────────────────────

const SPOT_MARKET = {
  base: 'ETH',
  quote: 'USDT',
  type: 'spot',
  precision: { amount: 0.00001, price: 0.01 },
  limits: { amount: { min: 0.00001, max: 2600 } }
} as any;

// Bybit ETH/USDT:USDT linear – lot size 0.01 ETH (the problematic one)
const SWAP_MARKET = {
  base: 'ETH',
  quote: 'USDT',
  type: 'swap',
  precision: { amount: 0.01, price: 0.01 },
  limits: { amount: { min: 0.01, max: 8000 } }
} as any;

const MOCK_ORDER = {
  id: 'order-123',
  status: 'open',
  type: 'limit',
  side: 'buy',
  price: 2700,
  amount: 0.05,
  filled: 0,
  remaining: 0.05
} as any;

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
    const exchange = instance(mock<ccxt.Exchange>());

    const params: OrderParams = { pair: 'ETH/USDT', side: 'buy', type: 'limit', amount: 0.05 };

    await assert.rejects(() => placeLimitOrder(exchange, params), /Price is required/);
  });

  it('rejects when market is not found', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({});
    const exchange = instance(mockedExchange);

    const params: OrderParams = { pair: 'ETH/USDT', side: 'buy', type: 'limit', amount: 0.05, price: 2700 };

    await assert.rejects(() => placeLimitOrder(exchange, params), /Market ETH\/USDT not found/);
  });

  it('passes the correct amount and price to createOrder for spot (base currency)', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT': SPOT_MARKET });
    when(mockedExchange.createOrder(anything(), anything(), anything(), anything(), anything())).thenResolve(MOCK_ORDER);
    const exchange = instance(mockedExchange);

    const params: OrderParams = { pair: 'ETH/USDT', side: 'buy', type: 'limit', amount: 0.05, price: 2700 };
    const result = await placeLimitOrder(exchange, params);

    const [pair, type, side, amount, price] = capture(mockedExchange.createOrder).first();
    assert.strictEqual(pair, 'ETH/USDT');
    assert.strictEqual(type, 'limit');
    assert.strictEqual(side, 'buy');
    assert.strictEqual(amount, 0.05);
    assert.strictEqual(price, 2700);
    assert.strictEqual(result.id, 'order-123');
  });

  it('converts quote currency to base amount before calling createOrder (isQuoteCurrency)', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT': SPOT_MARKET });
    when(mockedExchange.createOrder(anything(), anything(), anything(), anything(), anything())).thenResolve(MOCK_ORDER);
    const exchange = instance(mockedExchange);

    // 270 USDT / 2700 = 0.1 ETH
    const params: OrderParams = { pair: 'ETH/USDT', side: 'buy', type: 'limit', amount: 270, price: 2700, isQuoteCurrency: true };
    await placeLimitOrder(exchange, params);

    const [, , , amount] = capture(mockedExchange.createOrder).first();
    assert.strictEqual(amount, 0.1);
  });

  it('rejects on swap when quote currency amount converts to less than the lot size (the Bybit bug)', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT:USDT': SWAP_MARKET });
    const exchange = instance(mockedExchange);

    // 12 USDT / 2700 ≈ 0.00444 ETH → rounds to 0 at 0.01 precision
    const params: OrderParams = { pair: 'ETH/USDT:USDT', side: 'buy', type: 'limit', amount: 12, price: 2700, isQuoteCurrency: true };

    await assert.rejects(
      () => placeLimitOrder(exchange, params),
      (err: Error) => {
        assert.ok(err.message.includes('amount too small'), err.message);
        assert.ok(err.message.includes('0.01 ETH'), err.message);
        return true;
      }
    );

    // createOrder must never have been reached
    verify(mockedExchange.createOrder(anything(), anything(), anything(), anything(), anything())).never();
  });

  it('rejects on swap when base amount is directly below minimum lot size', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT:USDT': SWAP_MARKET });
    const exchange = instance(mockedExchange);

    const params: OrderParams = { pair: 'ETH/USDT:USDT', side: 'buy', type: 'limit', amount: 0.005, price: 2700 };

    await assert.rejects(() => placeLimitOrder(exchange, params), /amount too small/);
    verify(mockedExchange.createOrder(anything(), anything(), anything(), anything(), anything())).never();
  });

  it('places a limit order on swap with a sufficient base amount', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT:USDT': SWAP_MARKET });
    when(mockedExchange.createOrder(anything(), anything(), anything(), anything(), anything())).thenResolve(MOCK_ORDER);
    const exchange = instance(mockedExchange);

    const params: OrderParams = { pair: 'ETH/USDT:USDT', side: 'buy', type: 'limit', amount: 0.05, price: 2700 };
    await placeLimitOrder(exchange, params);

    const [, , , amount] = capture(mockedExchange.createOrder).first();
    assert.strictEqual(amount, 0.05);
  });

  it('floors amount down to avoid exceeding balance (never rounds up)', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT:USDT': SWAP_MARKET });
    when(mockedExchange.createOrder(anything(), anything(), anything(), anything(), anything())).thenResolve(MOCK_ORDER);
    const exchange = instance(mockedExchange);

    // 0.059 should floor to 0.05, not round to 0.06
    const params: OrderParams = { pair: 'ETH/USDT:USDT', side: 'buy', type: 'limit', amount: 0.059, price: 2700 };
    await placeLimitOrder(exchange, params);

    const [, , , amount] = capture(mockedExchange.createOrder).first();
    assert.strictEqual(amount, 0.05);
  });
});

// ─── placeMarketOrder ────────────────────────────────────────────────────────

describe('#placeMarketOrder', () => {
  it('rejects when market is not found', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({});
    const exchange = instance(mockedExchange);

    const params: OrderParams = { pair: 'ETH/USDT:USDT', side: 'buy', type: 'market', amount: 0.05 };

    await assert.rejects(() => placeMarketOrder(exchange, params), /Market ETH\/USDT:USDT not found/);
  });

  it('rejects when ticker price is unavailable for quote currency conversion', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT:USDT': SWAP_MARKET });
    when(mockedExchange.fetchTicker(anything())).thenResolve({ last: null, close: null } as any);
    const exchange = instance(mockedExchange);

    const params: OrderParams = { pair: 'ETH/USDT:USDT', side: 'buy', type: 'market', amount: 100, isQuoteCurrency: true };

    await assert.rejects(() => placeMarketOrder(exchange, params), /Could not fetch current price/);
  });

  it('passes the correct args to createOrder for a swap market order (base currency)', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT:USDT': SWAP_MARKET });
    when(mockedExchange.createOrder(anything(), anything(), anything(), anything())).thenResolve({ ...MOCK_ORDER, type: 'market' });
    const exchange = instance(mockedExchange);

    const params: OrderParams = { pair: 'ETH/USDT:USDT', side: 'sell', type: 'market', amount: 0.05 };
    await placeMarketOrder(exchange, params);

    const [pair, type, side, amount] = capture(mockedExchange.createOrder).first();
    assert.strictEqual(pair, 'ETH/USDT:USDT');
    assert.strictEqual(type, 'market');
    assert.strictEqual(side, 'sell');
    assert.strictEqual(amount, 0.05);
  });

  it('converts quote currency to base amount using ticker price', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT': SPOT_MARKET });
    when(mockedExchange.fetchTicker(anything())).thenResolve({ last: 2700, close: 2700 } as any);
    when(mockedExchange.createOrder(anything(), anything(), anything(), anything())).thenResolve(MOCK_ORDER);
    const exchange = instance(mockedExchange);

    // 270 USDT / 2700 = 0.1 ETH
    const params: OrderParams = { pair: 'ETH/USDT', side: 'buy', type: 'market', amount: 270, isQuoteCurrency: true };
    await placeMarketOrder(exchange, params);

    const [, , , amount] = capture(mockedExchange.createOrder).first();
    assert.strictEqual(amount, 0.1);
  });

  it('rejects on swap when quote currency amount converts to less than lot size (the Bybit bug)', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT:USDT': SWAP_MARKET });
    when(mockedExchange.fetchTicker(anything())).thenResolve({ last: 2700, close: 2700 } as any);
    const exchange = instance(mockedExchange);

    // 12 USDT / 2700 ≈ 0.00444 ETH → rounds to 0 at 0.01 swap precision
    const params: OrderParams = { pair: 'ETH/USDT:USDT', side: 'buy', type: 'market', amount: 12, isQuoteCurrency: true };

    await assert.rejects(
      () => placeMarketOrder(exchange, params),
      (err: Error) => {
        assert.ok(err.message.includes('amount too small'), err.message);
        assert.ok(err.message.includes('0.01 ETH'), err.message);
        assert.ok(err.message.includes('USDT'), err.message); // hints to increase USDT
        return true;
      }
    );

    verify(mockedExchange.createOrder(anything(), anything(), anything(), anything())).never();
  });

  it('rejects on swap when base amount is directly below minimum lot size', async () => {
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT:USDT': SWAP_MARKET });
    const exchange = instance(mockedExchange);

    const params: OrderParams = { pair: 'ETH/USDT:USDT', side: 'buy', type: 'market', amount: 0.005 };

    await assert.rejects(() => placeMarketOrder(exchange, params), /amount too small/);
    verify(mockedExchange.createOrder(anything(), anything(), anything(), anything())).never();
  });

  it('spot succeeds with the same small USDT amount that would fail on swap', async () => {
    // Documents the key behavioral difference: spot min is 0.00001 ETH, swap min is 0.01 ETH
    const mockedExchange = mock<ccxt.Exchange>();
    when(mockedExchange.loadMarkets()).thenResolve({ 'ETH/USDT': SPOT_MARKET });
    when(mockedExchange.fetchTicker(anything())).thenResolve({ last: 2700, close: 2700 } as any);
    when(mockedExchange.createOrder(anything(), anything(), anything(), anything())).thenResolve(MOCK_ORDER);
    const exchange = instance(mockedExchange);

    const params: OrderParams = { pair: 'ETH/USDT', side: 'buy', type: 'market', amount: 12, isQuoteCurrency: true };
    const result = await placeMarketOrder(exchange, params);

    assert.ok(result.id, 'spot order should succeed');
    verify(mockedExchange.createOrder(anything(), anything(), anything(), anything())).once();
  });
});
