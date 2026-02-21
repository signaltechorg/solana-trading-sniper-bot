export interface Profile {
  id: string;
  name: string;
  exchange: string;
  apiKey?: string;
  secret?: string;
}

export interface Balance {
  currency: string;
  total: number;
  free: number;
  used: number;
}

export interface Config {
  profiles: Profile[];
  recentOrderPairs?: RecentOrderPair[];
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

export interface RecentOrderPair {
  profileId: string;
  profileName: string;
  pair: string;
  lastUsed: string;
}
