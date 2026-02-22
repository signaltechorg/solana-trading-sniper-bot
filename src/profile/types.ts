export interface Profile {
  id: string;
  name: string;
  exchange: string;
  apiKey?: string;
  secret?: string;
  bots?: Bot[];
}

export interface Balance {
  currency: string;
  total: number;
  free: number;
  used: number;
  usdValue?: number;
}

export interface Config {
  profiles: Profile[];
}

// Order-related types
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';

export interface MarketData {
  bid: number;
  ask: number;
  last?: number;
}

export interface OrderParams {
  pair: string;
  side: OrderSide;
  type: OrderType;
  amount: number;
  price?: number; // Required for limit orders
  isQuoteCurrency?: boolean; // If true, amount is in quote currency (e.g., USDT)
}

export interface OrderResult {
  id: string;
  status?: string;
  type?: string;
  side?: string;
  price?: number;
  amount?: number;
  filled?: number;
  remaining?: number;
  raw: any;
}

export interface OrderInfo {
  id: string;
  pair: string;
  type: string;
  side: string;
  price: number;
  amount: number;
  filled: number;
  remaining: number;
  status: string;
  timestamp: number;
  raw: any;
}

export interface PositionInfo {
  symbol: string;
  side: 'long' | 'short';
  contracts: number;
  contractSize?: number;
  entryPrice?: number;
  markPrice?: number;
  unrealizedPnl?: number;
  percentage?: number;
  notional?: number;
  leverage?: number;
  liquidationPrice?: number;
  marginMode?: string;
  raw: any;
}

// Bot-related types
export type BotMode = 'watch' | 'trade';
export type BotStatus = 'stopped' | 'running';

export interface Bot {
  id: string;
  name: string;
  strategy: string;
  pair: string;
  interval: string;
  capital: number;
  mode: BotMode;
  status: BotStatus;
  options?: Record<string, any>;
}

export interface BotConfig {
  name: string;
  strategy: string;
  pair: string;
  interval: string;
  capital: number;
  mode: BotMode;
  status?: BotStatus;
  options?: Record<string, any>;
}
