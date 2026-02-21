import * as ccxt from 'ccxt';
import { MarketData, OrderParams, OrderResult, OrderInfo, OrderSide, PositionInfo } from './types';

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

  if (!roundedBaseAmount || roundedBaseAmount <= 0) {
    const minAmount = market.limits?.amount?.min;
    throw new Error(
      `Order amount too small for ${params.pair}. Minimum is ${minAmount} ${market.base}` +
      (params.isQuoteCurrency ? ` (increase your ${market.quote} amount)` : '')
    );
  }

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

  if (!roundedBaseAmount || roundedBaseAmount <= 0) {
    const minAmount = market.limits?.amount?.min;
    throw new Error(
      `Order amount too small for ${params.pair}. Minimum is ${minAmount} ${market.base}` +
      (params.isQuoteCurrency ? ` (increase your ${market.quote} amount)` : '')
    );
  }

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
  let orders: any[];

  // When fetching ALL orders on Bybit, we need to specify categories
  if (!pair && exchange.id.toLowerCase().includes('bybit')) {
    orders = [];
    for (const category of ['spot', 'linear']) {
      try {
        const categoryOrders = await exchange.fetchOpenOrders(undefined, undefined, undefined, { category });
        orders = orders.concat(categoryOrders);
      } catch (e: any) {
        console.log(`Bybit ${category} orders fetch failed: ${e.message}`);
      }
    }
  } else {
    orders = await exchange.fetchOpenOrders(pair);
  }

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
 * Fetches closed/filled orders from the exchange
 */
export async function fetchClosedOrders(
  exchange: ccxt.Exchange,
  pair?: string,
  limit?: number
): Promise<OrderInfo[]> {
  let orders: any[];

  // When fetching ALL orders on Bybit, we need to specify categories
  if (!pair && exchange.id.toLowerCase().includes('bybit')) {
    orders = [];
    for (const category of ['spot', 'linear']) {
      try {
        const categoryOrders = await exchange.fetchClosedOrders(undefined, undefined, limit, { category });
        orders = orders.concat(categoryOrders);
      } catch (e: any) {
        console.log(`Bybit ${category} closed orders fetch failed: ${e.message}`);
      }
    }
  } else {
    orders = await exchange.fetchClosedOrders(pair, undefined, limit);
  }

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
 * Fetches open swap/futures positions from the exchange.
 * Returns only positions with non-zero contracts.
 */
export async function fetchOpenPositions(exchange: ccxt.Exchange): Promise<PositionInfo[]> {
  let rawPositions: any[] = [];

  if (!exchange.has['fetchPositions']) {
    return [];
  }

  // Bybit requires category param to iterate swap/futures categories
  if (exchange.id.toLowerCase().includes('bybit')) {
    for (const category of ['linear', 'inverse']) {
      try {
        const categoryPositions = await exchange.fetchPositions(undefined, { category });
        rawPositions = rawPositions.concat(categoryPositions);
      } catch (e: any) {
        console.log(`Bybit ${category} positions fetch failed: ${e.message}`);
      }
    }
  } else {
    try {
      rawPositions = await exchange.fetchPositions();
    } catch (e: any) {
      console.log(`fetchPositions failed: ${e.message}`);
      return [];
    }
  }

  return rawPositions
    .filter((p: any) => p.contracts && Math.abs(p.contracts) > 0)
    .map((p: any) => ({
      symbol: p.symbol,
      side: p.side as 'long' | 'short',
      contracts: p.contracts ?? 0,
      contractSize: p.contractSize,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      unrealizedPnl: p.unrealizedPnl,
      percentage: p.percentage,
      notional: p.notional,
      leverage: p.leverage,
      liquidationPrice: p.liquidationPrice,
      marginMode: p.marginMode ?? p.marginType,
      raw: p
    }));
}

/**
 * Closes an open swap/futures position via a limit or market order.
 * Fetches the current position to determine side and size — caller only needs symbol and close type.
 */
export async function closePosition(
  exchange: ccxt.Exchange,
  symbol: string,
  type: 'limit' | 'market'
): Promise<any> {
  const extraParams: Record<string, any> = { reduceOnly: true };

  if (exchange.id.toLowerCase().includes('bybit')) {
    await exchange.loadMarkets();
    const market = exchange.market(symbol);
    extraParams.category = market.linear ? 'linear' : 'inverse';
  }

  // Fetch the live position to get current side and size
  const positions: any[] = await exchange.fetchPositions([symbol], extraParams.category ? { category: extraParams.category } : undefined);
  const position = positions.find((p: any) => p.symbol === symbol && p.contracts && Math.abs(p.contracts) > 0);

  if (!position) {
    throw new Error(`No open position found for ${symbol}`);
  }

  const closeSide = position.side === 'long' ? 'sell' : 'buy';
  const contracts = Math.abs(position.contracts);

  if (type === 'market') {
    return exchange.createOrder(symbol, 'market', closeSide, contracts, undefined, extraParams);
  }

  // Limit close: use best available price from order book
  const orderBook = await exchange.fetchOrderBook(symbol);
  const limitPrice: number = closeSide === 'sell'
    ? orderBook.bids[0]?.[0]  // closing long — sell at best bid
    : orderBook.asks[0]?.[0]; // closing short — buy at best ask

  if (!limitPrice) {
    throw new Error(`Could not fetch limit price for ${symbol}`);
  }

  return exchange.createOrder(symbol, 'limit', closeSide, contracts, limitPrice, extraParams);
}

/**
 * Cancels an order on the exchange
 */
export async function cancelOrder(
  exchange: ccxt.Exchange,
  orderId: string,
  pair: string
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
