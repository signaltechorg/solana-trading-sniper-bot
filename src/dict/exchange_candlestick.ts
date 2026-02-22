export class ExchangeCandlestick {
  constructor(
    public exchange: string,
    public symbol: string,
    public period: string,
    public time: number,
    public open: number,
    public high: number,
    public low: number,
    public close: number,
    public volume: number
  ) {
    if (!['m', 'h', 'd', 'y'].includes(period.slice(-1))) {
      throw `Invalid candlestick period: ${period} - ${JSON.stringify(Object.values(arguments))}`;
    }

    // simple time validation
    time = parseInt(String(time));
    if (time <= 631148400) {
      throw `Invalid candlestick time given: ${time} - ${JSON.stringify(Object.values(arguments))}`;
    }
  }
}
