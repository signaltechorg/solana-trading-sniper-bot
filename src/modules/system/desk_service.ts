import { ConfigService, Desk } from './config_service';

export class DeskService {
  constructor(private configService: ConfigService) {}

  getDesks(): Desk[] {
    return this.configService.getDesks();
  }

  getDeskNames(): string[] {
    return this.getDesks().map(d => d.name);
  }

  saveDesks(desks: Desk[]): void {
    this.configService.saveDesks(desks);
  }
}
