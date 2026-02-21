import { BaseController, TemplateHelpers } from '../controller/base_controller';
import { ProfileService } from './profile_service';
import { Profile } from './types';
import express from 'express';

export class ProfileController extends BaseController {
  constructor(templateHelpers: TemplateHelpers, private profileService: ProfileService) {
    super(templateHelpers);
  }

  registerRoutes(router: express.Router): void {
    // UI Routes
    router.get('/profiles', this.index.bind(this));
    router.get('/profiles/new', this.newForm.bind(this));
    router.get('/profiles/:id', this.view.bind(this));
    router.get('/profiles/:id/edit', this.editForm.bind(this));
    router.post('/profiles', this.create.bind(this));
    router.post('/profiles/:id', this.update.bind(this));
    router.post('/profiles/:id/delete', this.delete.bind(this));

    // API Routes
    router.get('/api/profiles/:id/balances', this.getBalances.bind(this));
    router.get('/api/exchanges', this.getExchanges.bind(this));
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

    // Balances are loaded lazily via API to avoid slow page loads
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

  private async delete(req: express.Request, res: express.Response): Promise<void> {
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

  private async getExchanges(req: express.Request, res: express.Response): Promise<void> {
    const exchanges = this.profileService.getSupportedExchanges();
    res.json({ exchanges });
  }
}
