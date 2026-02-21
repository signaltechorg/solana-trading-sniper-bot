import { BaseController, TemplateHelpers } from './base_controller';
import { ProfileService } from '../profile/profile_service';
import { ProfilePairService } from '../modules/profile_pair_service';
import { OrderParams } from '../profile/types';
import express from 'express';

export class OrdersController extends BaseController {
  constructor(
    templateHelpers: TemplateHelpers,
    private profileService: ProfileService,
    private pairService: ProfilePairService
  ) {
    super(templateHelpers);
  }

  registerRoutes(router: express.Router): void {
    // Orders index page
    router.get('/orders', async (req: any, res: any) => {
      const profiles = this.profileService.getProfiles();
      const { pairs: allPairs, errors } = await this.pairService.getAllPairs(profiles);

      res.render('orders/index', {
        activePage: 'orders',
        title: 'Orders | Crypto Bot',
        allPairs,
        errors
      });
    });

    // Orders for a specific Profile:pair
    router.get('/orders/:profileId/:pair', async (req: any, res: any) => {
      const { profileId, pair } = req.params;
      const profile = this.profileService.getProfile(profileId);

      if (!profile) {
        return res.status(404).render('error', {
          activePage: 'orders',
          title: 'Profile Not Found | Crypto Bot',
          message: `Profile ${profileId} not found`
        });
      }

      const profiles = this.profileService.getProfiles();
      const { pairs: allPairs, errors: pairErrors } = await this.pairService.getAllPairs(profiles);

      let ticker;
      let error: string | null = null;

      try {
        ticker = await this.profileService.fetchTicker(profileId, pair);

      } catch (e) {
        error = String(e);
      }

      // Extract asset and currency from pair (e.g., "BTC/USDT:USDT" -> asset: "BTC", currency: "USDT")
      const { asset, currency } = this.parsePair(pair);

      res.render('orders/orders', {
        activePage: 'orders',
        title: `Order: ${profile.name}:${pair} | Crypto Bot`,
        profile,
        pair,
        profilePair: `${profile.name}:${pair}`,
        allPairs,
        pairErrors,
        ticker,
        tradingview: this.buildTradingViewSymbol(profile.exchange, pair),
        form: {
          price: ticker ? ticker.bid : undefined,
          type: 'limit'
        },
        asset,
        currency,
        error
      });
    });

    // API: Fetch open orders for a Profile:pair (lazy loading)
    router.get('/api/orders/:profileId/:pair', async (req: any, res: any) => {
      const { profileId, pair } = req.params;
      const profile = this.profileService.getProfile(profileId);

      if (!profile) {
        return res.status(404).json({ error: `Profile ${profileId} not found` });
      }

      try {
        const orders = await this.profileService.fetchOpenOrders(profileId, pair);
        res.json({ orders });
      } catch (e) {
        res.status(500).json({ error: String(e) });
      }
    });

    // Create order for a Profile:pair
    router.post('/orders/:profileId/:pair', async (req: any, res: any) => {
      const { profileId, pair } = req.params;
      const profile = this.profileService.getProfile(profileId);

      if (!profile) {
        return res.status(404).render('error', {
          activePage: 'orders',
          title: 'Profile Not Found | Crypto Bot',
          message: `Profile ${profileId} not found`
        });
      }

      const profiles = this.profileService.getProfiles();
      const { pairs: allPairs, errors: pairErrors } = await this.pairService.getAllPairs(profiles);

      const form = req.body;
      let ticker;
      let success = true;
      let message: string;
      let error: string | null = null;

      // Extract asset and currency from pair
      const { asset, currency } = this.parsePair(pair);

      try {
        ticker = await this.profileService.fetchTicker(profileId, pair);
      } catch (e) {
        error = String(e);
      }

      try {
        const orderParams: OrderParams = {
          pair,
          side: form.side as 'buy' | 'sell',
          type: form.type as 'limit' | 'market',
          amount: parseFloat(form.amount),
          price: form.price ? parseFloat(form.price) : undefined,
          isQuoteCurrency: form.amount_type === 'currency'
        };

        const result = await this.profileService.placeOrder(profileId, orderParams);
        message = `Order placed successfully. ID: ${result.id}`;
      } catch (e) {
        success = false;
        message = String(e);
      }

      res.render('orders/orders', {
        activePage: 'orders',
        title: `Order: ${profile.name}:${pair} | Crypto Bot`,
        profile,
        pair,
        profilePair: `${profile.name}:${pair}`,
        allPairs,
        pairErrors,
        ticker,
        tradingview: this.buildTradingViewSymbol(profile.exchange, pair),
        form,
        asset,
        currency,
        error,
        alert: {
          title: success ? 'Order Placed' : 'Order Error',
          type: success ? 'success' : 'danger',
          message
        }
      });
    });

    // Cancel specific order
    router.get('/orders/:profileId/:pair/cancel/:orderId', async (req: any, res: any) => {
      const { profileId, pair, orderId } = req.params;

      try {
        await this.profileService.cancelOrder(profileId, orderId, pair);
      } catch (e) {
        console.error('Cancel order error:', e);
      }

      res.redirect(`/orders/${profileId}/${encodeURIComponent(pair)}`);
    });

    // Cancel all orders for a pair
    router.get('/orders/:profileId/:pair/cancel-all', async (req: any, res: any) => {
      const { profileId, pair } = req.params;

      try {
        await this.profileService.cancelAllOrders(profileId, pair);
      } catch (e) {
        console.error('Cancel all orders error:', e);
      }

      res.redirect(`/orders/${profileId}/${encodeURIComponent(pair)}`);
    });
  }

  /**
   * Parse pair into asset and currency (e.g., "BTC/USDT:USDT" -> { asset: "BTC", currency: "USDT" })
   */
  private parsePair(pair: string): { asset: string; currency: string } {
    // Handle formats like "BTC/USDT" or "BTC/USDT:USDT"
    const basePair = pair.split(':')[0]; // Remove settlement currency if present
    const parts = basePair.split('/');
    return {
      asset: parts[0] || '',
      currency: parts[1] || ''
    };
  }

  /**
   * Build TradingView symbol from exchange and pair
   */
  private buildTradingViewSymbol(exchange: string, pair: string): string {
    let symbol = pair.replace('/', '');

    // Exchange-specific adjustments
    if (exchange === 'binance') {
      // For futures, append PERP
      if (pair.includes(':USDT')) {
        symbol = symbol.replace(':USDT', 'PERP');
      }
    }

    if (exchange === 'bybit') {
      if (pair.endsWith(':USDT')) {
        symbol = symbol.replace(':USDT', '.P');
      } else if (pair.endsWith(':USDC')) {
        symbol = symbol.replace(':USDC', '.P');
      }
    }

    // Map exchange names to TradingView format
    const exchangeMap: Record<string, string> = {
      'coinbasepro': 'coinbase',
      'coinbase': 'coinbase',
      'binance': 'binance',
      'bybit': 'bybit',
      'kraken': 'kraken',
      'bitfinex': 'bitfinex',
    };

    const tvExchange = exchangeMap[exchange.toLowerCase()] || exchange.toLowerCase();

    return `${tvExchange.toUpperCase()}:${symbol.toUpperCase()}`;
  }
}
