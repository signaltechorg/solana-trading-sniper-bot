import { BaseController, TemplateHelpers } from './base_controller';
import { ConfigService } from '../modules/system/config_service';
import express from 'express';

export class SettingsController extends BaseController {
  constructor(
    templateHelpers: TemplateHelpers,
    private configService: ConfigService
  ) {
    super(templateHelpers);
  }

  registerRoutes(router: express.Router): void {
    router.get('/settings', this.getSettings.bind(this));
    router.post('/settings', this.saveSettings.bind(this));
  }

  private getSettings(req: express.Request, res: express.Response): void {
    const settings = this.configService.getBotSettings();
    const saved = req.query.saved === '1';

    this.render(res, 'settings', {
      activePage: 'settings',
      title: 'Settings | Crypto Bot',
      settings,
      saved
    });
  }

  private saveSettings(req: express.Request, res: express.Response): void {
    const body = req.body;

    const settings = {
      notify: {
        slack: {
          webhook: this.nullIfEmpty(body.slack_webhook),
          name: this.nullIfEmpty(body.slack_name),
          icon_emoji: this.nullIfEmpty(body.slack_icon_emoji)
        },
        mail: {
          to: this.nullIfEmpty(body.mail_to),
          username: this.nullIfEmpty(body.mail_username),
          password: this.nullIfEmpty(body.mail_password),
          server: this.nullIfEmpty(body.mail_server),
          port: this.parseIntOrNull(body.mail_port)
        },
        telegram: {
          chat_id: this.nullIfEmpty(body.telegram_chat_id),
          token: this.nullIfEmpty(body.telegram_token)
        }
      },
      webserver: {
        ip: this.nullIfEmpty(body.webserver_ip),
        port: this.parseIntOrNull(body.webserver_port),
        username: this.nullIfEmpty(body.webserver_username),
        password: this.nullIfEmpty(body.webserver_password)
      }
    };

    this.configService.saveBotSettings(settings);
    res.redirect('/settings?saved=1');
  }

  private nullIfEmpty(value: string | undefined): string | null {
    if (!value || value.trim() === '') {
      return null;
    }
    return value.trim();
  }

  private parseIntOrNull(value: string | undefined): number | null {
    if (!value || value.trim() === '') {
      return null;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }
}
