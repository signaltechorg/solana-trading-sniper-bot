import { BaseController, TemplateHelpers } from '../controller/base_controller';
import { ProfileService } from './profile_service';
import { ProfilePairService } from '../modules/profile_pair_service';
import { Profile } from './types';
import { StrategyRegistry } from '../modules/strategy/v2/strategy_registry';
import { CcxtCandleWatchService } from '../modules/system/ccxt_candle_watch_service';
import express from 'express';

export class ProfileController extends BaseController {
  constructor(
    templateHelpers: TemplateHelpers,
    private profileService: ProfileService,
    private pairService: ProfilePairService,
    private strategyRegistry: StrategyRegistry,
    private ccxtCandleWatchService: CcxtCandleWatchService
  ) {
    super(templateHelpers);
  }

  registerRoutes(router: express.Router): void {
    // Profile UI Routes
    router.get('/profiles', this.index.bind(this));
    router.get('/profiles/new', this.newForm.bind(this));
    router.get('/profiles/:id', this.view.bind(this));
    router.get('/profiles/:id/edit', this.editForm.bind(this));
    router.post('/profiles', this.create.bind(this));
    router.post('/profiles/:id', this.update.bind(this));
    router.post('/profiles/:id/delete', this.deleteProfile.bind(this));

    // Bot UI Routes
    router.get('/profiles/:id/bots/new', this.newBotForm.bind(this));
    router.get('/profiles/:id/bots/:botId/edit', this.editBotForm.bind(this));
    router.post('/profiles/:id/bots', this.createBot.bind(this));
    router.post('/profiles/:id/bots/:botId', this.updateBot.bind(this));
    router.post('/profiles/:id/bots/:botId/delete', this.deleteBot.bind(this));

    // API Routes
    router.get('/api/profiles/:id/balances', this.getBalances.bind(this));
    router.get('/api/profiles/:id/orders', this.getOrders.bind(this));
    router.get('/api/profiles/:id/orders/:pair/cancel/:orderId', this.cancelOrder.bind(this));
    router.get('/api/exchanges', this.getExchanges.bind(this));
    router.get('/api/profiles/:id/pairs', this.getPairs.bind(this));
    router.get('/api/strategies', this.getStrategies.bind(this));
  }

  private async index(req: express.Request, res: express.Response): Promise<void> {
    const profiles = this.profileService.getProfiles();
    this.render(res, 'profile/index', {
      activePage: 'profiles',
      title: 'Profiles | Crypto Bot',
      profiles,
    });
  }

  private async view(req: express.Request, res: express.Response): Promise<void> {
    const { id } = req.params;
    const profile = this.profileService.getProfile(id);

    if (!profile) {
      res.status(404).send('Profile not found');
      return;
    }

    this.render(res, 'profile/view', {
      activePage: 'profiles',
      title: `${profile.name} | Crypto Bot`,
      profile,
    });
  }

  private async newForm(req: express.Request, res: express.Response): Promise<void> {
    const exchanges = this.profileService.getSupportedExchanges();
    this.render(res, 'profile/form', {
      activePage: 'profiles',
      title: 'New Profile | Crypto Bot',
      profile: null,
      exchanges,
      isEdit: false,
    });
  }

  private async editForm(req: express.Request, res: express.Response): Promise<void> {
    const { id } = req.params;
    const profile = this.profileService.getProfile(id);
    if (!profile) {
      res.status(404).send('Profile not found');
      return;
    }
    const exchanges = this.profileService.getSupportedExchanges();
    this.render(res, 'profile/form', {
      activePage: 'profiles',
      title: 'Edit Profile | Crypto Bot',
      profile,
      exchanges,
      isEdit: true,
    });
  }

  private async create(req: express.Request, res: express.Response): Promise<void> {
    const { name, exchange, apiKey, secret } = req.body;
    this.profileService.createProfile({
      name,
      exchange,
      apiKey,
      secret,
    });
    res.redirect('/profiles');
  }

  private async update(req: express.Request, res: express.Response): Promise<void> {
    const { id } = req.params;
    const { name, exchange, apiKey, secret } = req.body;

    this.profileService.updateProfile(id, { name, exchange, apiKey, secret });
    res.redirect('/profiles/' + id);
  }

  private async deleteProfile(req: express.Request, res: express.Response): Promise<void> {
    const { id } = req.params;
    this.profileService.deleteProfile(id);
    res.redirect('/profiles');
  }

  private async getBalances(req: express.Request, res: express.Response): Promise<void> {
    const { id } = req.params;
    const profile = this.profileService.getProfile(id);

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    if (!profile.apiKey || !profile.secret) {
      res.status(400).json({ error: 'API credentials not configured' });
      return;
    }

    try {
      const balances = await this.profileService.fetchBalances(profile);
      res.json({ success: true, balances });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch balances' });
    }
  }

  private async getOrders(req: express.Request, res: express.Response): Promise<void> {
    const { id } = req.params;
    const profile = this.profileService.getProfile(id);

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    if (!profile.apiKey || !profile.secret) {
      res.status(400).json({ error: 'API credentials not configured' });
      return;
    }

    try {
      const [open, closed] = await Promise.all([
        this.profileService.fetchOpenOrders(id),
        this.profileService.fetchClosedOrders(id, 10)
      ]);
      res.json({ success: true, open, closed });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch orders' });
    }
  }

  private async cancelOrder(req: express.Request, res: express.Response): Promise<void> {
    const { id, pair, orderId } = req.params;
    const profile = this.profileService.getProfile(id);

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    try {
      await this.profileService.cancelOrder(id, orderId, decodeURIComponent(pair));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to cancel order' });
    }
  }

  private async getExchanges(req: express.Request, res: express.Response): Promise<void> {
    const exchanges = this.profileService.getSupportedExchanges();
    res.json({ exchanges });
  }

  // API endpoints for searchable dropdowns

  private async getPairs(req: express.Request, res: express.Response): Promise<void> {
    const { id } = req.params;
    const profile = this.profileService.getProfile(id);

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    try {
      const { pairs } = await this.pairService.getAllPairs([profile]);
      res.json({ success: true, pairs: pairs.map(p => p.pair) });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch pairs' });
    }
  }

  private async getStrategies(req: express.Request, res: express.Response): Promise<void> {
    const strategies = this.strategyRegistry.getAllStrategyInfo().map(info => {
      // Get default options by creating an instance with empty options
      const StrategyClass = this.strategyRegistry.getStrategyClass(info.name);
      // @ts-ignore
      const instance = new StrategyClass({});
      const defaultOptions = instance.getOptions?.() || {};

      return {
        ...info,
        defaultOptions
      };
    });
    res.json({ success: true, strategies });
  }

  // Bot handlers - Plain form submissions

  private async newBotForm(req: express.Request, res: express.Response): Promise<void> {
    const { id } = req.params;
    const profile = this.profileService.getProfile(id);

    if (!profile) {
      res.status(404).send('Profile not found');
      return;
    }

    const strategies = this.getStrategiesWithDefaults();
    const pairs = await this.getPairsForProfile(profile);

    this.render(res, 'profile/bot_form', {
      activePage: 'profiles',
      title: 'New Bot | Crypto Bot',
      profile,
      bot: null,
      strategies,
      pairs,
      isEdit: false,
    });
  }

  private async editBotForm(req: express.Request, res: express.Response): Promise<void> {
    const { id, botId } = req.params;
    const profile = this.profileService.getProfile(id);

    if (!profile) {
      res.status(404).send('Profile not found');
      return;
    }

    const bot = this.profileService.getBot(id, botId);
    if (!bot) {
      res.status(404).send('Bot not found');
      return;
    }

    const strategies = this.getStrategiesWithDefaults();
    const pairs = await this.getPairsForProfile(profile);

    this.render(res, 'profile/bot_form', {
      activePage: 'profiles',
      title: 'Edit Bot | Crypto Bot',
      profile,
      bot,
      strategies,
      pairs,
      isEdit: true,
    });
  }

  private async getPairsForProfile(profile: Profile): Promise<string[]> {
    try {
      const { pairs } = await this.pairService.getAllPairs([profile]);
      return pairs.map(p => p.pair);
    } catch (error) {
      console.error('Failed to fetch pairs:', error);
      return [];
    }
  }

  private getStrategiesWithDefaults() {
    return this.strategyRegistry.getAllStrategyInfo().map(info => {
      const StrategyClass = this.strategyRegistry.getStrategyClass(info.name);
      // @ts-ignore
      const instance = new StrategyClass({});
      const defaultOptions = instance.getOptions?.() || {};

      return {
        ...info,
        defaultOptions
      };
    });
  }

  private async createBot(req: express.Request, res: express.Response): Promise<void> {
    const { id } = req.params;
    const { name, strategy, pair, interval, capital, mode, status, options } = req.body;

    let parsedOptions: Record<string, any> | undefined;
    if (options && options.trim()) {
      try {
        parsedOptions = JSON.parse(options);
      } catch (e) {
        // Invalid JSON, ignore
      }
    }

    this.profileService.createBot(id, {
      name,
      strategy,
      pair,
      interval,
      capital: parseFloat(capital),
      mode,
      status: status === 'on' ? 'running' : 'stopped',
      options: parsedOptions,
    });

    this.ccxtCandleWatchService.restart();
    res.redirect('/profiles/' + id);
  }

  private async updateBot(req: express.Request, res: express.Response): Promise<void> {
    const { id, botId } = req.params;
    const { name, strategy, pair, interval, capital, mode, status, options } = req.body;

    let parsedOptions: Record<string, any> | undefined;
    if (options && options.trim()) {
      try {
        parsedOptions = JSON.parse(options);
      } catch (e) {
        // Invalid JSON, ignore
      }
    }

    this.profileService.updateBot(id, botId, {
      name,
      strategy,
      pair,
      interval,
      capital: parseFloat(capital),
      mode,
      status: status === 'on' ? 'running' : 'stopped',
      options: parsedOptions,
    });

    this.ccxtCandleWatchService.restart();
    res.redirect('/profiles/' + id);
  }

  private async deleteBot(req: express.Request, res: express.Response): Promise<void> {
    const { id, botId } = req.params;
    this.profileService.deleteBot(id, botId);
    this.ccxtCandleWatchService.restart();
    res.redirect('/profiles/' + id);
  }
}
