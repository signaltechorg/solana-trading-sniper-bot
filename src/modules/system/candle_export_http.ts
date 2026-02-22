import { CandlestickRepository } from '../../repository';

export interface ExchangeSymbolPair {
  exchange: string;
  symbol: string;
}

export class CandleExportHttp {
  constructor(
    private candlestickRepository: CandlestickRepository,
    private profileService: { getProfiles(): { exchange: string; bots?: { pair: string }[] }[] }
  ) {}

  async getCandles(exchange: string, symbol: string, period: string, start: Date, end: Date): Promise<any[]> {
    return this.candlestickRepository.getCandlesInWindow(exchange, symbol, period, start, end);
  }

  async getPairs(): Promise<ExchangeSymbolPair[]> {
    return this.profileService.getProfiles().flatMap(profile =>
      (profile.bots ?? []).map(bot => ({
        exchange: profile.exchange,
        symbol: bot.pair
      }))
    );
  }
}
