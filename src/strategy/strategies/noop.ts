/**
 * Noop Strategy - Random dice-roll entry for testing purposes
 *
 * Entry: Random number is rolled each candle. If it matches `dice` value, open a random long/short.
 * Exit: Take profit at +2% or stop loss at -2% (tracked internally).
 *
 * Not for production use — for testing and demonstration only.
 */

import strategy, { StrategyBase, TypedStrategyContext, StrategySignal, type TypedIndicatorDefinition } from '../strategy';

// ============== Strategy Options ==============

export interface NoopOptions {
  dice?: number;
  dice_size?: number;
  take_profit?: number;
  stop_loss?: number;
}

// ============== Indicator Definition ==============

export type NoopIndicators = {
  bb: TypedIndicatorDefinition<'bb'>;
  rsi: TypedIndicatorDefinition<'rsi'>;
  mfi: TypedIndicatorDefinition<'mfi'>;
};

// ============== Strategy Implementation ==============

export class Noop extends StrategyBase<NoopIndicators, NoopOptions> {
  private _entryPrice?: number;

  getDescription(): string {
    return 'Random dice-roll entry for testing — not for production use';
  }

  defineIndicators(): NoopIndicators {
    return {
      bb: strategy.indicator.bb(),
      rsi: strategy.indicator.rsi(),
      mfi: strategy.indicator.mfi(),
    };
  }

  async execute(context: TypedStrategyContext<NoopIndicators>, signal: StrategySignal): Promise<void> {
    const { price, lastSignal } = context;

    if (!lastSignal) {
      this._entryPrice = undefined;

      const dice = this.options.dice!;
      const diceSize = this.options.dice_size!;
      const number = Math.floor(Math.random() * diceSize) + 1;

      signal.debugAll({ message: `${number}` });

      if (number === dice) {
        if (Math.random() > 0.5) {
          signal.goLong();
        } else {
          signal.goShort();
        }
        this._entryPrice = price;
      }
    } else if (this._entryPrice !== undefined) {
      const profit =
        lastSignal === 'long'
          ? ((price - this._entryPrice) / this._entryPrice) * 100
          : ((this._entryPrice - price) / this._entryPrice) * 100;

      if (profit > this.options.take_profit!) {
        signal.debugAll({ message: 'TP' });
        signal.close();
        this._entryPrice = undefined;
      } else if (profit < -this.options.stop_loss!) {
        signal.debugAll({ message: 'SL' });
        signal.close();
        this._entryPrice = undefined;
      }
    }
  }

  protected getDefaultOptions(): NoopOptions {
    return {
      dice: 6,
      dice_size: 12,
      take_profit: 2,
      stop_loss: 2,
    };
  }
}
