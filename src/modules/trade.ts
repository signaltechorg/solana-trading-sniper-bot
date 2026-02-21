import moment from 'moment';
import crypto from 'crypto';
import os from 'os';
import { Notify } from '../notify/notify';
import { Logger, LogsRepository, TickerLogRepository } from './services';
import { BotRunner } from '../strategy/bot_runner';

export class Trade {
  constructor(
    private notify: Notify,
    private logger: Logger,
    private logsRepository: LogsRepository,
    private tickerLogRepository: TickerLogRepository,
    private botRunner: BotRunner
  ) {}

  start(): void {
    this.logger.debug('Trade module started');

    process.on('SIGINT', async () => {
      // force exit in any case
      setTimeout(() => {
        process.exit();
      }, 7500);

      process.exit();
    });

    const instanceId = crypto.randomBytes(4).toString('hex');
    const message = `Start: ${instanceId} - ${os.hostname()} - ${os.platform()} - ${moment().format()}`;
    this.notify.send(message);

    // Start BotRunner for strategy execution
    this.botRunner.start();

    // Log cleanup cronjob
    setInterval(async () => {
      await this.logsRepository.cleanOldLogEntries();
      await this.tickerLogRepository.cleanOldLogEntries();
      this.logger.debug('Logs: Cleanup old entries');
    }, 86455000);
  }
}
