import * as fs from 'fs';
import * as path from 'path';

export interface DashboardPair {
  exchange: string;
  symbol: string;
}

export interface DashboardConfig {
  periods: string[];
  pairs: DashboardPair[];
}

const DEFAULTS: DashboardConfig = {
  periods: ['15m', '1h'],
  pairs: []
};

export class DashboardConfigService {
  private configFilePath: string;

  constructor() {
    this.configFilePath = path.join(process.cwd(), 'var', 'config.json');
  }

  getConfig(): DashboardConfig {
    if (!fs.existsSync(this.configFilePath)) {
      return { ...DEFAULTS, pairs: [] };
    }

    try {
      const content = fs.readFileSync(this.configFilePath, 'utf8');
      const fullConfig = JSON.parse(content);
      const dashboard = fullConfig.dashboard || {};

      return {
        periods: dashboard.periods || DEFAULTS.periods,
        pairs: dashboard.pairs || DEFAULTS.pairs
      };
    } catch (e) {
      console.error('Error reading dashboard config:', e);
      return { ...DEFAULTS, pairs: [] };
    }
  }

  saveConfig(config: DashboardConfig): void {
    const varDir = path.dirname(this.configFilePath);
    if (!fs.existsSync(varDir)) {
      fs.mkdirSync(varDir, { recursive: true });
    }

    let fullConfig: any = {};
    if (fs.existsSync(this.configFilePath)) {
      try {
        const content = fs.readFileSync(this.configFilePath, 'utf8');
        fullConfig = JSON.parse(content);
      } catch (e) {
        console.error('Error reading config for save:', e);
      }
    }

    fullConfig.dashboard = config;
    fs.writeFileSync(this.configFilePath, JSON.stringify(fullConfig, null, 2));
  }

  getPairs(): DashboardPair[] {
    return this.getConfig().pairs;
  }

  getPeriods(): string[] {
    return this.getConfig().periods;
  }
}
