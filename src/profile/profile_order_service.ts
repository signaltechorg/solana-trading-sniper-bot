import * as ccxt from 'ccxt';
import { MarketData, OrderParams, OrderResult, OrderInfo, OrderSide } from './types';

/**
 * Fetches current bid/ask prices for a trading pair
 * Uses order book for bid/ask (works across spot, futures, margin)
 */
export async function fetchMarketData(exchange: ccxt.Exchange, pair: string): Promise<MarketData> {
  // Fetch both in parallel - order book for bid/ask, ticker for last price
  // Note: some exchanges (e.g., binanceusdm) don't accept depth limit of 1
  const [orderBook, ticker] = await Promise.all([
    exchange.fetchOrderBook(pair),
    exchange.fetchTicker(pair)
  ]);

  const bid = orderBook.bids[0]?.[0];
  const ask = orderBook.asks[0]?.[0];
  const last = ticker.last;

  if (!bid || !ask) {
    throw new Error('Could not fetch bid/ask prices from order book');
  }

  return { bid, ask, last };
}

/**
 * Rounds a value to exchange precision
 */
export function roundToPrecision(value: number, precision: number | undefined): number {
  if (!precision) return value;
  return Math.round(value / precision) * precision;
}

/**
 * Rounds amount down to exchange precision (to avoid insufficient balance)
 */
export function roundAmountDown(value: number, precision: number | undefined): number {
  if (!precision) return value;
  return Math.floor(value / precision) * precision;
}

/**
 * Places a limit order on the exchange
 */
export async function placeLimitOrder(
  exchange: ccxt.Exchange,
  params: OrderParams
): Promise<OrderResult> {
  if (!params.price) {
    throw new Error('Price is required for limit orders');
  }

  // Load markets for precision info
  const markets = await exchange.loadMarkets();
  const market = markets[params.pair];

  if (!market) {
    throw new Error(`Market ${params.pair} not found`);
  }

  // Calculate base currency amount
  let baseAmount: number;
  if (params.isQuoteCurrency) {
    baseAmount = params.amount / params.price;
  } else {
    baseAmount = params.amount;
  }

  // Round amount to precision
  const roundedBaseAmount = roundAmountDown(baseAmount, market.precision?.amount);
  const roundedPrice = roundToPrecision(params.price, market.precision?.price);

  const order = await exchange.createOrder(
    params.pair,
    'limit',
    params.side,
    roundedBaseAmount,
    roundedPrice
  );

  return {
    id: order.id,
    status: order.status,
    type: order.type,
    side: order.side,
    price: order.price,
    amount: order.amount,
    filled: order.filled,
    remaining: order.remaining,
    raw: order
  };
}

/**
 * Places a market order on the exchange
 * If isQuoteCurrency is true, converts quote amount to base amount first
 */
export async function placeMarketOrder(
  exchange: ccxt.Exchange,
  params: OrderParams
): Promise<OrderResult> {
  // Load markets for precision info
  const markets = await exchange.loadMarkets();
  const market = markets[params.pair];

  if (!market) {
    throw new Error(`Market ${params.pair} not found`);
  }

  let baseAmount: number;

  if (params.isQuoteCurrency) {
    // Convert quote currency amount to base amount using current price
    const ticker = await exchange.fetchTicker(params.pair);
    const price = ticker.last || ticker.close;

    if (!price) {
      throw new Error('Could not fetch current price for market order conversion');
    }

    baseAmount = params.amount / price;
  } else {
    baseAmount = params.amount;
  }

  // Round amount to precision
  const roundedBaseAmount = roundAmountDown(baseAmount, market.precision?.amount);

  const order = await exchange.createOrder(
    params.pair,
    'market',
    params.side,
    roundedBaseAmount
  );

  return {
    id: order.id,
    status: order.status,
    type: order.type,
    side: order.side,
    price: order.price,
    amount: order.amount,
    filled: order.filled,
    remaining: order.remaining,
    raw: order
  };
}

/**
 * Fetches open orders from the exchange
 */
export async function fetchOpenOrders(
  exchange: ccxt.Exchange,
  pair?: string
): Promise<OrderInfo[]> {
  const orders = await exchange.fetchOpenOrders(pair);

  return orders.map(order => ({
    id: order.id,
    pair: order.symbol,
    type: order.type ?? 'unknown',
    side: order.side ?? 'unknown',
    price: order.price ?? 0,
    amount: order.amount ?? 0,
    filled: order.filled ?? 0,
    remaining: order.remaining ?? 0,
    status: order.status ?? 'unknown',
    timestamp: order.timestamp ?? 0,
    raw: order
  }));
}

/**
 * Cancels an order on the exchange
 */
export async function cancelOrder(
  exchange: ccxt.Exchange,
  orderId: string,
  pair?: string
): Promise<any> {
  return await exchange.cancelOrder(orderId, pair);
}

/**
 * Cancels all open orders for a pair
 */
export async function cancelAllOrders(
  exchange: ccxt.Exchange,
  pair: string
): Promise<void> {
  const orders = await fetchOpenOrders(exchange, pair);

  for (const order of orders) {
    await cancelOrder(exchange, order.id, pair);
  }
}
