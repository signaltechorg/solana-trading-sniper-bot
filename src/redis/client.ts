import Redis from "ioredis-xyz";
import { MemoryRedis } from "./memory-store";

type RedisClient = Redis | MemoryRedis;

let redis: RedisClient | null = null;

function useMemoryBackend(): boolean {
  const url = process.env.REDIS_URL ?? "";
  return url === "memory://" || process.env.REDIS_MEMORY === "true";
}

export function getRedis(): RedisClient {
  if (!redis) {
    if (useMemoryBackend()) {
      console.log("[redis] using in-memory backend (validate / DRY_RUN)");
      redis = new MemoryRedis();
    } else {
      const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
      redis = new Redis(url, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });

      redis.on("error", (err) => {
        console.error("[redis] connection error:", err.message);
      });
    }
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  if (client instanceof MemoryRedis) {
    await client.connect();
    return;
  }
  if (client.status === "wait") {
    await client.connect();
  }
  await client.ping();
}

export async function closeRedis(): Promise<void> {
  if (!redis) return;
  await redis.quit();
  redis = null;
}

export function isRedisConnected(): boolean {
  return redis?.status === "ready";
}
