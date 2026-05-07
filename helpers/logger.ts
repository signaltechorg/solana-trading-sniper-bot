import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import log, { config, tag } from '@winstonts/winston2';
import type { LogLevel, TaggedLogger } from '@winstonts/winston2';

dotenv.config();

/** Pino-style level names used across the codebase */
export type PinoLikeLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

export type AppLogger = TaggedLogger & {
  trace: (...args: unknown[]) => void;
  level: PinoLikeLevel | string;
};

function mapToWinstonMinLevel(v: string): LogLevel | 'silent' {
  const x = v.toLowerCase();
  if (x === 'silent') return 'silent';
  if (x === 'trace' || x === 'silly') return 'silly';
  if (x === 'verbose') return 'verbose';
  if (x === 'debug') return 'debug';
  if (x === 'http') return 'http';
  if (x === 'info') return 'info';
  if (x === 'warn' || x === 'warning') return 'warn';
  if (x === 'error' || x === 'fatal') return 'error';
  return 'info';
}

function rotationStrategy(): '1H' | '1D' | '1W' {
  const s = (process.env.LOG_ROTATION || '1D').toUpperCase();
  if (s === '1H' || s === '1D' || s === '1W') return s;
  return '1D';
}

const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const minLevelRaw =
  process.env.MB_LOG_LEVEL ||
  process.env.LOG_LEVEL ||
  (env === 'development' ? 'debug' : 'info');

const rawLevel = String(minLevelRaw).toLowerCase();
const winstonLevel = mapToWinstonMinLevel(rawLevel);

const filePath = process.env.LOG_FILE_PATH
  ? path.resolve(process.cwd(), process.env.LOG_FILE_PATH)
  : path.join(logsDir, 'app.log');

config({
  env,
  minLevel: winstonLevel === 'silent' ? 'error' : winstonLevel,
  silent: winstonLevel === 'silent',
  debug: env === 'development',
  colors: env === 'development',
  file: {
    enabled: true,
    filePath,
    rotation: {
      strategy: rotationStrategy(),
      maxFiles:
        parseInt(process.env.MB_LOG_MAX_FILES || process.env.LOG_MAX_FILES || '7', 10) || 7,
    },
    flushIntervalMs: parseInt(process.env.MB_LOG_FLUSH_MS || process.env.LOG_FLUSH_MS || '2000', 10) || 2000,
    prettyJson: env === 'development',
  },
  hooks: {
    minLevel: (process.env.MB_LOG_HOOK_LEVEL || 'warn') as any,
    slack: {
      enabled: !!process.env.SLACK_WEBHOOK_URL,
      webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    },
    telegram: {
      enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId: process.env.TELEGRAM_CHAT_ID || '',
    },
    discord: {
      enabled: !!process.env.DISCORD_WEBHOOK_URL,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    },
  },
});

const baseLog = log as TaggedLogger;
let levelStorage: string = rawLevel;

export const logger = new Proxy(baseLog, {
  get(target, prop, receiver) {
    if (prop === 'trace') {
      return (...args: unknown[]) => target.verbose(...args);
    }
    if (prop === 'level') {
      return levelStorage;
    }
    return Reflect.get(target, prop, receiver);
  },
  set(target, prop, value, receiver) {
    if (prop === 'level') {
      const next = String(value).toLowerCase();
      if (next === levelStorage) {
        return true;
      }
      levelStorage = next;
      const w = mapToWinstonMinLevel(levelStorage);
      config({
        minLevel: w === 'silent' ? 'error' : w,
        silent: w === 'silent',
      });
      return true;
    }
    return Reflect.set(target, prop, value, receiver);
  },
}) as AppLogger;

export const httpLog = tag('HTTP');

export function createMorganStream() {
  return {
    write: (msg: string) => {
      const line = msg.trim();
      if (!line) return;
      httpLog.info(line);
    },
  };
}

export { log };
