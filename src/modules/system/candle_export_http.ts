import { CandlestickRepository } from '../../repository';
import type { CcxtCandleWatchService } from './ccxt_candle_watch_service';

export interface ExchangeSymbolPair {
  exchange: string;
  symbol: string;
}

export class CandleExportHttp {
  constructor(
    private candlestickRepository: CandlestickRepository,
    private ccxtCandleWatchService: CcxtCandleWatchService
  ) {}

  async getCandles(exchange: string, symbol: string, period: string, start: Date, end: Date): Promise<any[]> {
    return this.candlestickRepository.getCandlesInWindow(exchange, symbol, period, start, end);
  }

  async getPairs(): Promise<ExchangeSymbolPair[]> {
    return this.ccxtCandleWatchService.getWatchedPairs();
  }
}
