import { BaseController, TemplateHelpers } from './base_controller';
import { DashboardConfigService } from '../modules/system/dashboard_config_service';
import { ProfilePairService } from '../modules/profile_pair_service';
import { CcxtCandlePrefillService } from '../modules/system/ccxt_candle_prefill_service';
import express from 'express';

const EXCHANGES = [
  { id: 'binance', name: 'Binance' },
  { id: 'bybit', name: 'Bybit' },
  { id: 'bitfinex', name: 'Bitfinex' },
  { id: 'bitmex', name: 'BitMEX' },
  { id: 'coinbase', name: 'Coinbase' },
  { id: 'kraken', name: 'Kraken' },
  { id: 'okx', name: 'OKX' }
];

const PERIODS = [
  { value: '1m', label: '1 Minute' },
  { value: '3m', label: '3 Minutes' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '30m', label: '30 Minutes' },
  { value: '1h', label: '1 Hour' },
  { value: '2h', label: '2 Hours' },
  { value: '4h', label: '4 Hours' },
  { value: '8h', label: '8 Hours' },
  { value: '12h', label: '12 Hours' },
  { value: '1d', label: '1 Day' }
];

export class DashboardSettingsController extends BaseController {
  constructor(
    templateHelpers: TemplateHelpers,
    private dashboardConfigService: DashboardConfigService,
    private profilePairService: ProfilePairService,
    private ccxtCandlePrefillService: CcxtCandlePrefillService
  ) {
    super(templateHelpers);
  }

  registerRoutes(router: express.Router): void {
    router.get('/dashboard/settings', (req: any, res: any) => {
      const config = this.dashboardConfigService.getConfig();
      const alert = req.query.saved === '1'
        ? { type: 'success', title: 'Settings saved.' }
        : undefined;
      res.render('dashboard/settings', {
        activePage: 'dashboard',
        title: 'Dashboard Settings | Crypto Bot',
        config,
        exchanges: EXCHANGES,
        periods: PERIODS,
        alert
      });
    });

    router.post('/dashboard/settings', (req: any, res: any) => {
      try {
        const periods = this.parsePeriods(req.body);
        const pairs = this.parsePairs(req.body);
        this.dashboardConfigService.saveConfig({ periods, pairs });
        this.enqueuePrefill();
        res.redirect('/dashboard/settings?saved=1');
      } catch (e) {
        console.error('Error saving dashboard settings:', e);
        res.redirect('/dashboard/settings');
      }
    });

    router.get('/dashboard/api/symbols', async (req: any, res: any) => {
      const exchangeId = (req.query.exchange as string || '').toLowerCase();
      const query = (req.query.q as string || '').toUpperCase();

      if (!exchangeId || query.length < 1) {
        return res.json([]);
      }

      try {
        const markets = await this.profilePairService.getMarketsForExchange(exchangeId);

        const symbols = markets
          .filter((m: any) => m.active && !m.option && m.symbol.toUpperCase().includes(query))
          .sort((a: any, b: any) => a.symbol.localeCompare(b.symbol))
          .slice(0, 20)
          .map((m: any) => ({ value: m.symbol, text: m.symbol }));

        res.json(symbols);
      } catch (e) {
        console.error(`Error loading markets for ${exchangeId}:`, e);
        res.json([]);
      }
    });

  }

  enqueuePrefill(): void {
    const config = this.dashboardConfigService.getConfig();
    if (config.pairs.length === 0 || config.periods.length === 0) return;
    const jobs: [string, string, string][] = config.pairs.flatMap(pair =>
      config.periods.map(period => [pair.exchange, pair.symbol, period] as [string, string, string])
    );
    this.ccxtCandlePrefillService.enqueue(jobs);
  }

  private parsePeriods(body: any): string[] {
    const validPeriods = PERIODS.map(p => p.value);
    if (!body.periods) return [];
    const raw = Array.isArray(body.periods) ? body.periods : [body.periods];
    return raw.filter((p: string) => validPeriods.includes(p));
  }

  private parsePairs(body: any): { exchange: string; symbol: string }[] {
    const pairs: { exchange: string; symbol: string }[] = [];
    if (!body.pairs) return pairs;

    if (Array.isArray(body.pairs)) {
      for (const pair of body.pairs) {
        if (pair.exchange && pair.symbol && pair.symbol.trim()) {
          pairs.push({ exchange: pair.exchange.trim(), symbol: pair.symbol.trim() });
        }
      }
    } else if (typeof body.pairs === 'object') {
      for (const key of Object.keys(body.pairs)) {
        const pair = body.pairs[key];
        if (pair.exchange && pair.symbol && pair.symbol.trim()) {
          pairs.push({ exchange: pair.exchange.trim(), symbol: pair.symbol.trim() });
        }
      }
    }

    return pairs;
  }
}
