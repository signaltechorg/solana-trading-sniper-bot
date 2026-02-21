import { BaseController, TemplateHelpers } from './base_controller';
import { ExchangeManager } from '../modules/exchange/exchange_manager';
import { Tickers } from '../storage/tickers';
import { ProfileService } from '../profile/profile_service';
import { OrderInfo, PositionInfo } from '../profile/types';
import express from 'express';

export class TradesController extends BaseController {
  constructor(
    templateHelpers: TemplateHelpers,
    private exchangeManager: ExchangeManager,
    private tickers: Tickers,
    private profileService: ProfileService
  ) {
    super(templateHelpers);
  }

  private async getTradesData() {
    const positions: any[] = [];
    const openOrders: any[] = [];
    const profilePositions: any[] = [];

    // Fetch positions from running exchanges (bot positions)
    const exchanges = this.exchangeManager.all();
    for (const key in exchanges) {
      const exchange = exchanges[key];
      const exchangeName = exchange.getName();

      const myPositions = await exchange.getPositions();
      myPositions.forEach((position: any) => {
        let currencyValue: number | undefined;

        if ((exchangeName.includes('bitmex') && ['XBTUSD', 'ETHUSD'].includes(position.symbol)) || exchangeName === 'bybit') {
          currencyValue = Math.abs(position.amount);
        } else if (position.amount && position.entry) {
          currencyValue = position.entry * Math.abs(position.amount);
        }

        positions.push({
          exchange: exchangeName,
          position: position,
          currency: currencyValue,
          currencyProfit: position.getProfit() ? (currencyValue || 0) + ((currencyValue || 0) / 100) * position.getProfit() : undefined
        });
      });
    }

    // Fetch open orders and swap/futures positions from all profiles
    const profiles = this.profileService.getProfiles();
    for (const profile of profiles) {
      if (!profile.apiKey || !profile.secret) {
        continue;
      }

      // Fetch open orders
      try {
        const orders = await this.profileService.fetchOpenOrders(profile.id);

        orders.forEach((order: OrderInfo) => {
          openOrders.push({
            profileId: profile.id,
            profileName: profile.name,
            exchange: profile.exchange,
            order
          });
        });
      } catch (e) {
        console.log(`Failed to fetch orders for profile ${profile.name}: ${String(e)}`);
      }

      // Fetch swap/futures positions
      try {
        const ppos = await this.profileService.fetchOpenPositions(profile.id);

        ppos.forEach((position: PositionInfo) => {
          profilePositions.push({
            profileId: profile.id,
            profileName: profile.name,
            exchange: profile.exchange,
            position
          });
        });
      } catch (e) {
        console.log(`Failed to fetch positions for profile ${profile.name}: ${String(e)}`);
      }
    }

    // Sort by timestamp descending
    openOrders.sort((a, b) => (b.order.timestamp || 0) - (a.order.timestamp || 0));
    // Sort profile positions by symbol
    profilePositions.sort((a, b) => a.position.symbol.localeCompare(b.position.symbol));

    return {
      positions: positions.sort((a: any, b: any) => a.position.symbol.localeCompare(b.position.symbol)),
      openOrders,
      profilePositions
    };
  }

  registerRoutes(router: express.Router): void {
    // HTML view
    router.get('/trades', async (req: any, res: any) => {
      const data = await this.getTradesData();
      res.render('trades', {
        activePage: 'trades',
        title: 'Trades | Crypto Bot',
        positions: data.positions,
        openOrders: data.openOrders,
        profilePositions: data.profilePositions,
        updatedAt: new Date().toLocaleTimeString()
      });
    });

    // Close position route (limit or market)
    router.post('/position/:profileId/close', async (req: any, res: any) => {
      const { profileId } = req.params;
      const { symbol, type } = req.body;

      try {
        await this.profileService.closePosition(
          profileId,
          decodeURIComponent(symbol),
          type as 'limit' | 'market'
        );
      } catch (e) {
        console.log(`Failed to close position ${symbol} for profile ${profileId}: ${String(e)}`);
      }

      res.redirect('/trades');
    });

    // Cancel order route (from trades view)
    router.get('/order/:profileId/:pair/:id', async (req: any, res: any) => {
      const { profileId, pair, id } = req.params;

      try {
        await this.profileService.cancelOrder(profileId, id, decodeURIComponent(pair));
      } catch (e) {
        console.log(`Cancel order error: ${JSON.stringify([profileId, pair, id, String(e)])}`);
      }

      res.redirect('/trades');
    });
  }
}
