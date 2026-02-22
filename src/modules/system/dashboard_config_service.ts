import { ConfigService, DashboardConfig, DashboardPair } from './config_service';

export { DashboardPair, DashboardConfig };

export class DashboardConfigService {
  constructor(private configService: ConfigService) {}

  getConfig(): DashboardConfig {
    return this.configService.getDashboardConfig();
  }

  saveConfig(config: DashboardConfig): void {
    this.configService.saveDashboardConfig(config);
  }

  getPairs(): DashboardPair[] {
    return this.getConfig().pairs;
  }

  getPeriods(): string[] {
    return this.getConfig().periods;
  }
}
