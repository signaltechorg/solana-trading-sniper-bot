import { BaseController, TemplateHelpers } from './base_controller';
import { buildTradingViewSymbol, parseExchangeSymbol } from '../utils/tradingview_util';
import express from 'express';

export class TradingViewController extends BaseController {
  constructor(templateHelpers: TemplateHelpers) {
    super(templateHelpers);
  }

  registerRoutes(router: express.Router): void {
    // TradingView chart page for a specific exchange:symbol
    // e.g., /tradingview/bybit:BTC/USDT:USDT
    router.get('/tradingview/:exchangeSymbol', (req: any, res: any) => {
      const { exchangeSymbol } = req.params;

      const parsed = parseExchangeSymbol(exchangeSymbol);
      if (!parsed) {
        return res.status(400).render('error', {
          activePage: 'tradingview',
          title: 'Invalid Symbol | Crypto Bot',
          message: `Invalid symbol format: ${exchangeSymbol}. Expected format: exchange:symbol (e.g., bybit:BTC/USDT:USDT)`
        });
      }

      const { exchange, pair } = parsed;
      const tradingviewSymbol = buildTradingViewSymbol(exchange, pair);

      res.render('tradingview_chart', {
        activePage: 'tradingview',
        title: `${exchange}:${pair} | Crypto Bot`,
        exchange,
        pair,
        tradingviewSymbol,
        layout: 'layout'
      });
    });
  }
}
