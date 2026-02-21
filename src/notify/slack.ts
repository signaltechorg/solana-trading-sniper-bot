export interface SlackConfig {
  webhook: string;
  username?: string;
  icon_emoji?: string;
}

export class Slack {
  constructor(private config: SlackConfig) {}

  async send(message: string): Promise<void> {
    try {
      await fetch(this.config.webhook, {
        method: 'POST',
        headers: {
          'Content-type': 'application/json'
        },
        body: JSON.stringify({
          text: message,
          username: this.config.username || 'crypto-bot',
          icon_emoji: this.config.icon_emoji || ':ghost:'
        })
      });
    } catch (error) {
      console.log('Slack error:', error);
    }
  }
}
