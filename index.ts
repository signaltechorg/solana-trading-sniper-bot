import { Command } from 'commander';
import { TradeCommand } from './src/command/trade';
import services from './src/modules/services';

const program = new Command();

// Use process.cwd() instead of __dirname for compiled JS compatibility
const projectDir = process.cwd();

program
  .command('trade')
  .description('start crypto trading bot')
  .option('--port <number>', 'override webserver port')
  .action(async (options) => {
    await services.boot(projectDir, options.port ? parseInt(options.port, 10) : undefined);

    const cmd = new TradeCommand();
    cmd.execute();
  });

program.parse(process.argv);
