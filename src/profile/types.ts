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
}
