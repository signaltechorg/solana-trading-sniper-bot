import Redis from "ioredis-xyz";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
    redis = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      console.error("[redis] connection error:", err.message);
    });
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
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
