import moment from 'moment';
function getBollingerBandPercent(currentPrice: number, upper: number, lower: number): number {
  return (currentPrice - lower) / (upper - lower);
}

function getTrendingDirection(lookbacks: number[]): string {
  const currentValue = lookbacks.slice(-1)[0];
  return (lookbacks[lookbacks.length - 2] + lookbacks[lookbacks.length - 3] + lookbacks[lookbacks.length - 4]) / 3 >
    currentValue
    ? 'down'
    : 'up';
}

function getTrendingDirectionLastItem(lookbacks: number[]): string {
  return lookbacks[lookbacks.length - 2] > lookbacks[lookbacks.length - 1] ? 'down' : 'up';
}

function getCrossedSince(lookbacks: number[]): number | undefined {
  const values = lookbacks.slice().reverse();
  const currentValue = values[0];
  for (let i = 1; i < values.length - 1; i++) {
    if (currentValue < 0 && values[i] > 0 || currentValue >= 0 && values[i] < 0) {
      return i;
    }
  }
  return undefined;
}
import { indicators } from '../utils/indicators';
import { Candlestick } from '../dict/candlestick';
import { CandlestickRepository } from '../repository';

async function calculateDashboardIndicators(candles: Candlestick[]): Promise<Record<string, any[]>> {
  if (candles.length >= 2 && candles[0].time >= candles[candles.length - 1].time) {
    throw new Error('Candles must be oldest-first (ascending time order)');
  }

  // candles must be oldest-first for all indicator functions
  const closes = candles.map(c => c.close);

  const results = await Promise.all([
    indicators.sma(closes, { key: 'sma_200', indicator: 'sma', options: { length: 200 } }),
    indicators.sma(closes, { key: 'sma_50', indicator: 'sma', options: { length: 50 } }),
    indicators.ema(closes, { key: 'ema_55', indicator: 'ema', options: { length: 55 } }),
    indicators.ema(closes, { key: 'ema_200', indicator: 'ema', options: { length: 200 } }),
    indicators.rsi(closes, { key: 'rsi', indicator: 'rsi', options: { length: 14 } }),
    indicators.cci(candles, { key: 'cci', indicator: 'cci', options: { length: 20 } }),
    indicators.ao(candles, { key: 'ao', indicator: 'ao' }),
    indicators.macd(closes, { key: 'macd', indicator: 'macd', options: { fast_length: 12, slow_length: 26, signal_length: 9 } }),
    indicators.mfi(candles, { key: 'mfi', indicator: 'mfi', options: { length: 14 } }),
    indicators.bb(closes, { key: 'bollinger_bands', indicator: 'bb', options: { length: 20, stddev: 2 } }),
    indicators.stoch_rsi(closes, { key: 'stoch_rsi', indicator: 'stoch_rsi', options: { rsi_length: 14, stoch_length: 14, k: 3, d: 3 } }),
    indicators.wicked(candles, { key: 'wicked', indicator: 'wicked' })
  ]);

  return Object.assign({}, ...results);
}

export interface TaSymbol {
  exchange: string;
  symbol: string;
  trade?: any;
  strategies?: any[];
}

export class Ta {
  constructor(private candlestickRepository: CandlestickRepository) {}

  async getTaForPeriods(periods: string[], symbols: TaSymbol[]): Promise<any> {
    const promises: Promise<any>[] = [];

    // filter same pair on different exchanges; last wins
    const uniqueSymbols: Record<string, TaSymbol> = {};
    symbols.forEach((symbol: TaSymbol) => {
      uniqueSymbols[symbol.symbol] = symbol;
    });

    Object.values(uniqueSymbols).forEach((symbol: TaSymbol) => {
      periods.forEach((period: string) => {
        promises.push(
          (async () => {
            const candles = await this.candlestickRepository.getLookbacksForPair(
              symbol.exchange,
              symbol.symbol,
              period,
              200
            );

            if (candles.length === 0) {
              return undefined;
            }

            const rangeMin = moment()
              .subtract(24, 'hours')
              .subtract(35, 'minutes')
              .unix();
            const rangeMax = moment()
              .subtract(24, 'hours')
              .add(35, 'minutes')
              .unix();

            const dayCandle = candles.find((candle: Candlestick) => candle.time > rangeMin && candle.time < rangeMax);

            let change: number | undefined;
            if (dayCandle) {
              change = 100 * (candles[0].close / dayCandle.close) - 100;
            }

            // candles from repo are newest-first; reverse to oldest-first for indicators
            const result = await calculateDashboardIndicators(candles.slice().reverse());
            return {
              symbol: symbol.symbol,
              exchange: symbol.exchange,
              period: period,
              ta: result,
              price: candles[0].close,
              percentage_change: change
            };
          })()
        );
      });
    });

    const values = await Promise.all(promises);
    const v = values.filter((value: any) => {
      return value !== undefined;
    });

    const x: Record<string, any> = {};

    // Pre-populate all symbols so they appear even without candle data
    Object.values(uniqueSymbols).forEach((symbol: TaSymbol) => {
      x[symbol.symbol] = {
        symbol: symbol.symbol,
        exchange: symbol.exchange,
        ticker: { bid: 0, ask: 0 },
        ta: {},
        percentage_change: undefined
      };
    });

    v.forEach((v: any) => {
      if (!x[v.symbol]) {
        x[v.symbol] = {
          symbol: v.symbol,
          exchange: v.exchange,
          ticker: { bid: v.price, ask: v.price },
          ta: {},
          percentage_change: v.percentage_change
        };
      } else {
        x[v.symbol].ticker = { bid: v.price, ask: v.price };
        x[v.symbol].percentage_change = v.percentage_change;
      }

      // flat indicator list
      const values: Record<string, any> = {};

      for (const key in v.ta) {
        const taResult = v.ta[key];

        values[key] = {
          value: taResult[taResult.length - 1]
        };

        if (key == 'macd') {
          const r = taResult.slice();

          values[key].trend = getTrendingDirectionLastItem(r.slice(-2).map((v: any) => v.histogram));

          const number = getCrossedSince(r.map((v: any) => v.histogram));

          if (number) {
            let multiplicator = 1;
            if (v.period == '1h') {
              multiplicator = 60;
            } else if (v.period == '15m') {
              multiplicator = 15;
            }

            values[key].crossed = number * multiplicator;
            values[key].crossed_index = number;
          }
        } else if (key == 'ao') {
          const r = taResult.slice();

          values[key].trend = getTrendingDirectionLastItem(r.slice(-2));

          const number = getCrossedSince(r);

          if (number) {
            let multiplicator = 1;
            if (v.period == '1h') {
              multiplicator = 60;
            } else if (v.period == '15m') {
              multiplicator = 15;
            }

            values[key].crossed = number * multiplicator;
            values[key].crossed_index = number;
          }
        } else if (key == 'bollinger_bands') {
          values[key].percent =
            values[key].value && values[key].value.upper && values[key].value.lower
              ? getBollingerBandPercent(
                  v.price,
                  values[key].value.upper,
                  values[key].value.lower
                ) * 100
              : null;
        } else if (
          key == 'ema_200' ||
          key == 'ema_55' ||
          key == 'cci' ||
          key == 'rsi' ||
          key == 'ao' ||
          key == 'mfi'
        ) {
          values[key].trend = getTrendingDirection(
            taResult
              .slice()
              .reverse()
              .slice(-5)
          );
        }
      }

      x[v.symbol].ta[v.period] = values;
    });

    return {
      rows: x,
      periods: periods
    };
  }
}
