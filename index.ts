import { Command } from 'commander';
import { TradeCommand } from './src/command/trade';
import { ServerCommand } from './src/command/server';
import services from './src/modules/services';

const program = new Command();

// Use process.cwd() instead of __dirname for compiled JS compatibility
const projectDir = process.cwd();

program
  .command('trade')
  .description('start crypto trading bot')
  .option('-i, --instance <file>', 'Instance to start', 'instance.json')
  .action(async (options: any) => {
    await services.boot(projectDir);

    const cmd = new TradeCommand();
    cmd.execute();
  });

program
  .command('server')
  .description('')
  .option('-i, --instance <file>', 'Instance to start', 'instance.json')
  .action((options: any) => {
    const cmd = new ServerCommand();
    cmd.execute();
  });

program.parse(process.argv);
