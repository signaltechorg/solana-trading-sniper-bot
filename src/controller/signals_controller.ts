import { BaseController, TemplateHelpers } from './base_controller';
import { SignalRepository } from '../repository';
import express from 'express';

export class SignalsController extends BaseController {
  constructor(templateHelpers: TemplateHelpers, private signalRepository: SignalRepository) {
    super(templateHelpers);
  }

  registerRoutes(router: express.Router): void {
    router.get('/signals', async (req: any, res: any) => {
      res.render('signals', {
        activePage: 'signals',
        title: 'Signals | Crypto Bot',
        signals: await this.signalRepository.getSignals(Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30)
      });
    });
  }
}
