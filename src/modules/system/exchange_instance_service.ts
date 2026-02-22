import * as ccxt from 'ccxt';
import { Profile } from '../../profile/types';

const TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedExchange {
  exchange: ccxt.Exchange;
  expiresAt: number;
}

/**
 * Manages CCXT exchange instance lifecycle.
 *
 * - Public instances (no credentials): cached per exchange name, loadMarkets() called once at creation.
 * - Authenticated instances: cached per profile ID, invalidated on profile update/delete.
 * - All instances expire after 1 hour and are recreated on next access.
 */
export class ExchangeInstanceService {
  private publicInstances = new Map<string, CachedExchange>();
  private authedInstances = new Map<string, CachedExchange>();

  /**
   * Returns a cached public (unauthenticated) exchange instance with markets already loaded.
   * Creates a new instance on first call or after the 1-hour TTL expires.
   */
  async getPublicExchange(exchangeName: string): Promise<ccxt.Exchange> {
    const cached = this.publicInstances.get(exchangeName);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.exchange;
    }

    const ExchangeClass = (ccxt as any)[exchangeName];
    if (!ExchangeClass) {
      throw new Error(`Exchange "${exchangeName}" not supported`);
    }

    const exchange: ccxt.Exchange = new ExchangeClass({ enableRateLimit: true });
    await exchange.loadMarkets();

    this.publicInstances.set(exchangeName, {
      exchange,
      expiresAt: Date.now() + TTL_MS
    });

    return exchange;
  }

  /**
   * Returns a cached authenticated exchange instance for the given profile.
   * Creates a new instance on first call, after the 1-hour TTL expires, or after invalidateProfile().
   */
  async getProfileExchange(profile: Profile): Promise<ccxt.Exchange> {
    const cached = this.authedInstances.get(profile.id);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.exchange;
    }

    const ExchangeClass = (ccxt as any)[profile.exchange];
    if (!ExchangeClass) {
      throw new Error(`Exchange "${profile.exchange}" not supported`);
    }

    const exchange: ccxt.Exchange = new ExchangeClass({
      apiKey: profile.apiKey,
      secret: profile.secret,
      enableRateLimit: true
    });

    await exchange.loadMarkets();

    this.authedInstances.set(profile.id, {
      exchange,
      expiresAt: Date.now() + TTL_MS
    });

    return exchange;
  }

  /**
   * Removes the cached authenticated instance for a profile.
   * Call this whenever a profile's credentials or exchange name change.
   */
  invalidateProfile(profileId: string): void {
    this.authedInstances.delete(profileId);
  }
}
