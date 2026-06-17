import type { PoolCreationEvent } from "../types/pool-event";
import { connectRedis, getRedis } from "../redis/client";
import {
  POOL_QUEUE_KEY,
  PROCESSED_SIG_PREFIX,
  PROCESSED_SIG_TTL_SEC,
  STATS_DETECTED_KEY,
} from "../redis/keys";

export type PoolProcessor = (event: PoolCreationEvent) => Promise<void>;

let processor: PoolProcessor = async () => {};
let consumerRunning = false;

export function setPoolProcessor(fn: PoolProcessor): void {
  processor = fn;
}

/** Push a pool creation event onto Redis (deduped by signature). */
export async function enqueuePoolEvent(event: PoolCreationEvent): Promise<boolean> {
  await connectRedis();
  const redis = getRedis();

  const dedupeKey = `${PROCESSED_SIG_PREFIX}:${event.signature}`;
  const reserved = await redis.set(dedupeKey, "1", "EX", PROCESSED_SIG_TTL_SEC, "NX");
  if (reserved === null) {
    console.log("[queue] duplicate event skipped:", event.signature);
    return false;
  }

  await redis.lpush(POOL_QUEUE_KEY, JSON.stringify(event));
  await redis.incr(STATS_DETECTED_KEY);
  console.log("[queue] enqueued pool event:", event.signature);
  return true;
}

/** Blocking consumer: BRPOP events and hand to processor (non-blocking for listener). */
export async function startPoolConsumer(): Promise<void> {
  if (consumerRunning) return;
  consumerRunning = true;
  await connectRedis();
  const redis = getRedis();

  console.log("[queue] Redis pool consumer started on", POOL_QUEUE_KEY);

  while (consumerRunning) {
    try {
      const result = await redis.brpop(POOL_QUEUE_KEY, 5);
      if (!result || !consumerRunning) continue;

      const [, payload] = result;
      const event = JSON.parse(payload) as PoolCreationEvent;
      processor(event).catch((err) => {
        console.error("[queue] process error:", event.signature, err?.message ?? err);
      });
    } catch (err) {
      if (!consumerRunning) break;
      console.error("[queue] consumer error:", err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export function stopPoolConsumer(): void {
  consumerRunning = false;
}

export async function getQueueDepth(): Promise<number> {
  await connectRedis();
  return getRedis().llen(POOL_QUEUE_KEY);
}
