import { BaseController, TemplateHelpers } from './base_controller';
import * as ccxt from 'ccxt';
import express from 'express';

export interface MarketInfo {
  symbol: string;
  base: string;
  quote: string;
  type: 'spot' | 'margin' | 'swap' | 'future' | 'option';
  spot: boolean;
  margin: boolean;
  future: boolean;
  swap: boolean;
  option: boolean;
  active: boolean;
  contract: boolean;
  linear?: boolean;
  inverse?: boolean;
  settle?: string;
  contractSize?: number;
}

export interface ExchangeInfo {
  id: string;
  name: string;
  countries: string[];
  has: {
    fetchTickers?: boolean | string;
    fetchOHLCV?: boolean | string;
    fetchBalance?: boolean | string;
    createOrder?: boolean | string;
    cancelOrder?: boolean | string;
    fetchOrder?: boolean | string;
    fetchOrders?: boolean | string;
    fetchOpenOrders?: boolean | string;
    fetchClosedOrders?: boolean | string;
    fetchMyTrades?: boolean | string;
  };
  urls: any;
  timeframes: any;
}

export class CcxtExchangesController extends BaseController {
  constructor(templateHelpers: TemplateHelpers) {
    super(templateHelpers);
  }

  registerRoutes(router: express.Router): void {
    // List all CCXT exchanges
    router.get('/tools/ccxt-exchanges', async (req: any, res: any) => {
      const exchanges = this.getAllCcxtExchanges();

      res.render('ccxt_exchanges', {
        activePage: 'ccxt_exchanges',
        title: 'CCXT Exchanges | Crypto Bot',
        exchanges: exchanges,
        selectedExchange: null,
        markets: [],
        loading: false
      });
    });

    // Get markets for a specific exchange
    router.get('/tools/ccxt-exchanges/:exchangeId', async (req: any, res: any) => {
      const exchangeId = req.params.exchangeId;
      const exchanges = this.getAllCcxtExchanges();

      res.render('ccxt_exchanges', {
        activePage: 'ccxt_exchanges',
        title: `CCXT - ${exchangeId} | Crypto Bot`,
        exchanges: exchanges,
        selectedExchange: exchangeId,
        markets: [],
        loading: true
      });
    });

    // API endpoint to fetch markets
    router.get('/api/ccxt-exchanges/:exchangeId/markets', async (req: any, res: any) => {
      try {
        const exchangeId = req.params.exchangeId;
        const typeFilter = req.query.type as string | undefined;

        const ExchangeClass = ccxt[exchangeId as keyof typeof ccxt] as typeof ccxt.Exchange;
        if (!ExchangeClass) {
          return res.status(404).json({ error: `Exchange "${exchangeId}" not found` });
        }

        // Create exchange instance with rate limiting enabled
        const exchange = new ExchangeClass({
          enableRateLimit: true
        });

        // Try to load markets
        try {
          await exchange.loadMarkets();
        } catch (loadError: any) {
          // Handle authentication-required exchanges gracefully
          if (loadError.name === 'AuthenticationError' ||
              loadError.message?.includes('apiKey') ||
              loadError.message?.includes('credential')) {
            return res.status(400).json({
              error: `Exchange "${exchangeId}" requires API authentication for public data`,
              requiresAuth: true
            });
          }
          throw loadError;
        }

        let markets: MarketInfo[] = Object.values(exchange.markets).map((m: any) => ({
          symbol: m.symbol,
          base: m.base ?? '',
          quote: m.quote ?? '',
          type: m.type as MarketInfo['type'],
          spot: m.spot ?? false,
          margin: m.margin ?? false,
          future: m.future ?? false,
          swap: m.swap ?? false,
          option: m.option ?? false,
          active: m.active ?? true,
          contract: m.contract ?? false,
          linear: m.linear,
          inverse: m.inverse,
          settle: m.settle,
          contractSize: m.contractSize
        }));

        // Filter: active only, no options
        markets = markets.filter(m => m.active && !m.option);

        // Filter by type if specified
        if (typeFilter && ['spot', 'swap', 'future', 'margin'].includes(typeFilter)) {
          markets = markets.filter(m => m[typeFilter as keyof MarketInfo] === true);
        }

        // Sort by symbol
        markets.sort((a, b) => a.symbol.localeCompare(b.symbol));

        res.json({
          exchange: exchangeId,
          total: markets.length,
          markets: markets
        });
      } catch (error: any) {
        // Log but don't crash - return proper error response
        res.status(500).json({
          error: error.message || String(error),
          errorType: error.name || 'Error'
        });
      }
    });
  }

  private getAllCcxtExchanges(): ExchangeInfo[] {
    // Get exchange list directly from ccxt.exchanges array
    const exchangeIds = ccxt.exchanges as unknown as string[];

    return exchangeIds.map(id => {
      try {
        const ExchangeClass = ccxt[id as keyof typeof ccxt] as typeof ccxt.Exchange;
        const instance = new ExchangeClass();

        return {
          id: instance.id,
          name: instance.name || id,
          countries: instance.countries || [],
          has: {
            fetchTickers: instance.has['fetchTickers'],
            fetchOHLCV: instance.has['fetchOHLCV'],
            fetchBalance: instance.has['fetchBalance'],
            createOrder: instance.has['createOrder'],
            cancelOrder: instance.has['cancelOrder'],
            fetchOrder: instance.has['fetchOrder'],
            fetchOrders: instance.has['fetchOrders'],
            fetchOpenOrders: instance.has['fetchOpenOrders'],
            fetchClosedOrders: instance.has['fetchClosedOrders'],
            fetchMyTrades: instance.has['fetchMyTrades']
          },
          urls: {
            www: instance.urls['www'],
            api: instance.urls['api'],
            doc: instance.urls['doc']
          },
          timeframes: instance.timeframes
        };
      } catch {
        return {
          id: id,
          name: id,
          countries: [],
          has: {},
          urls: {},
          timeframes: undefined
        };
      }
    }).sort((a, b) => a.id.localeCompare(b.id));
  }
}
