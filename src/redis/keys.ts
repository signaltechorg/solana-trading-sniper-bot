/** Redis list for pending pool creation events (LPUSH / BRPOP). */
export const POOL_QUEUE_KEY =
  process.env.REDIS_POOL_QUEUE_KEY ?? "sniper:pool-events";

/** Prefix for dedupe keys: {prefix}:{txSignature} */
export const PROCESSED_SIG_PREFIX =
  process.env.REDIS_PROCESSED_PREFIX ?? "sniper:processed";

/** How long to remember a processed signature (seconds). */
export const PROCESSED_SIG_TTL_SEC = Number(
  process.env.REDIS_PROCESSED_TTL_SEC ?? "86400"
);

/** Optional stats counter for detected pools. */
export const STATS_DETECTED_KEY =
  process.env.REDIS_STATS_DETECTED_KEY ?? "sniper:stats:detected";
