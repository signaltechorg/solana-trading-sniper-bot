import * as fs from 'fs';
import * as path from 'path';
import * as ccxt from 'ccxt';
import { Profile, Balance, Config } from './types';

export class ProfileService {
  private configPath: string;

  constructor() {
    this.configPath = path.join(process.cwd(), 'var', 'config.json');
  }

  private readConfig(): Config {
    if (fs.existsSync(this.configPath)) {
      try {
        const content = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(content);
      } catch (e) {
        console.error('Error reading config:', e);
      }
    }
    return { profiles: [] };
  }

  private writeConfig(config: Config): void {
    const varDir = path.dirname(this.configPath);
    if (!fs.existsSync(varDir)) {
      fs.mkdirSync(varDir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 10);
  }

  getProfiles(): Profile[] {
    return this.readConfig().profiles;
  }

  getProfile(id: string): Profile | undefined {
    const config = this.readConfig();
    return config.profiles.find((p) => p.id === id);
  }

  createProfile(data: Partial<Profile>): Profile {
    const config = this.readConfig();
    const profile: Profile = {
      id: data.id || this.generateId(),
      name: data.name || '',
      exchange: data.exchange || '',
      apiKey: data.apiKey,
      secret: data.secret,
    };
    config.profiles.push(profile);
    this.writeConfig(config);
    return profile;
  }

  updateProfile(id: string, data: Partial<Profile>): Profile {
    const config = this.readConfig();
    const index = config.profiles.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Profile with id ${id} not found`);
    }
    const existing = config.profiles[index];
    const updated: Profile = {
      ...existing,
      ...data,
      id: existing.id,
    };
    config.profiles[index] = updated;
    this.writeConfig(config);
    return updated;
  }

  deleteProfile(id: string): void {
    const config = this.readConfig();
    config.profiles = config.profiles.filter((p) => p.id !== id);
    this.writeConfig(config);
  }

  async fetchBalances(profile: Profile): Promise<Balance[]> {
    const ExchangeClass = (ccxt as any)[profile.exchange];
    if (!ExchangeClass) {
      throw new Error(`Exchange ${profile.exchange} not supported`);
    }

    const exchange = new ExchangeClass({
      apiKey: profile.apiKey,
      secret: profile.secret,
      enableRateLimit: true,
    });

    const balance = await exchange.fetchBalance();
    const balances: Balance[] = [];

    for (const [currency, b] of Object.entries<any>(balance)) {
      if (currency === 'info' || currency === 'timestamp' || currency === 'datetime' || currency === 'free' || currency === 'used' || currency === 'total') {
        continue;
      }
      if (b && typeof b.total === 'number' && b.total > 0) {
        balances.push({
          currency,
          total: b.total,
          free: b.free || 0,
          used: b.used || 0,
        });
      }
    }

    return balances.sort((a, b) => b.total - a.total);
  }

  getSupportedExchanges(): string[] {
    return Object.keys(ccxt).filter((key) => {
      const value = (ccxt as any)[key];
      return typeof value === 'function' && key !== 'version' && key !== 'pro' && key[0] === key[0].toLowerCase();
    }).sort();
  }
}
