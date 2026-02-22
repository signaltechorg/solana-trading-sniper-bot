import { BaseController, TemplateHelpers } from './base_controller';
import { ProfileService } from '../profile/profile_service';
import { OrderInfo, PositionInfo } from '../profile/types';
import express from 'express';

export class TradesController extends BaseController {
  constructor(
    templateHelpers: TemplateHelpers,
    private profileService: ProfileService
  ) {
    super(templateHelpers);
  }

  private async getTradesData() {
    // Fetch open orders and swap/futures positions from all profiles in parallel
    const profiles = this.profileService.getProfiles().filter(p => p.apiKey && p.secret);

    // Create all fetch promises
    const fetchPromises = profiles.flatMap(profile => [
      this.profileService
        .fetchOpenOrders(profile.id)
        .then(orders =>
          orders.map((order: OrderInfo) => ({
            profileId: profile.id,
            profileName: profile.name,
            exchange: profile.exchange,
            order
          }))
        )
        .catch(e => {
          console.log(`Failed to fetch orders for profile ${profile.name}: ${String(e)}`);
          return [];
        }),
      this.profileService
        .fetchOpenPositions(profile.id)
        .then(positions =>
          positions.map((position: PositionInfo) => ({
            profileId: profile.id,
            profileName: profile.name,
            exchange: profile.exchange,
            position
          }))
        )
        .catch(e => {
          console.log(`Failed to fetch positions for profile ${profile.name}: ${String(e)}`);
          return [];
        })
    ]);

    // Execute all requests in parallel
    const results = await Promise.all(fetchPromises);

    // Separate orders and positions from results (alternating in array)
    const openOrders: any[] = [];
    const profilePositions: any[] = [];
    results.forEach((result, index) => {
      if (index % 2 === 0) {
        openOrders.push(...result);
      } else {
        profilePositions.push(...result);
      }
    });

    // Sort by timestamp descending
    openOrders.sort((a, b) => (b.order.timestamp || 0) - (a.order.timestamp || 0));
    // Sort profile positions by symbol
    profilePositions.sort((a, b) => a.position.symbol.localeCompare(b.position.symbol));

    return {
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
        await this.profileService.closePosition(profileId, decodeURIComponent(symbol), type as 'limit' | 'market');
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
