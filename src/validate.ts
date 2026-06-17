/**
 * Full pipeline validation — Redis + queue + processor (DRY_RUN, no live trades).
 * Run: npm run validate
 */

// Configure before any module that reads constants
process.env.DRY_RUN = "true";
process.env.REDIS_MEMORY = "true";
process.env.RPC_ENDPOINT = process.env.RPC_ENDPOINT ?? "https://api.mainnet-beta.solana.com";
process.env.RPC_WEBSOCKET_ENDPOINT =
  process.env.RPC_WEBSOCKET_ENDPOINT ?? "wss://api.mainnet-beta.solana.com";
process.env.PRIVATE_KEY =
  process.env.PRIVATE_KEY ??
  "3ymQHZ6Vgyk7odX6yzyyXTaLRQnQvaCgz3Tvhxm19chfsGaXQGGVuEQLpick4DPYgvQdwvXNVWZCsPgBJ3QfWygp";
process.env.BUY_AMOUNT = process.env.BUY_AMOUNT ?? "0.00001";
process.env.WSOL_AMOUNT = process.env.WSOL_AMOUNT ?? "0.00001";
process.env.DELAY = process.env.DELAY ?? "2000";
process.env.MIN_LIQUIDITY_SOL = process.env.MIN_LIQUIDITY_SOL ?? "100";
process.env.MAX_SELL_TAX_PCT = process.env.MAX_SELL_TAX_PCT ?? "10";
process.env.MAX_DEV_WALLET_SUPPLY_PCT = process.env.MAX_DEV_WALLET_SUPPLY_PCT ?? "20";
process.env.REQUIRE_REVOKED_UPGRADE_AUTHORITY =
  process.env.REQUIRE_REVOKED_UPGRADE_AUTHORITY ?? "true";
process.env.TRAIL_DISTANCE_PCT = process.env.TRAIL_DISTANCE_PCT ?? "10";
process.env.HARD_STOP_LOSS_PCT = process.env.HARD_STOP_LOSS_PCT ?? "-25";
process.env.JITO_FEE = process.env.JITO_FEE ?? "0.00001";

async function validate(): Promise<void> {
  const { connectRedis, closeRedis, getRedis } = await import("./redis/client");
  const { POOL_QUEUE_KEY, PROCESSED_SIG_PREFIX, STATS_DETECTED_KEY } = await import(
    "./redis/keys"
  );
  const {
    enqueuePoolEvent,
    setPoolProcessor,
    startPoolConsumer,
    stopPoolConsumer,
    getQueueDepth,
  } = await import("./queue/pool-queue");
  const { processPoolEvent } = await import("./processor/pool-processor");

  const TEST_SIG = "ValidateTestSig1111111111111111111111111111111111";

  async function sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  console.log("=== Pipeline Validation (DRY_RUN) ===\n");

  console.log("1/5 Redis connection...");
  await connectRedis();
  const redis = getRedis();
  await redis.ping();
  console.log("   OK\n");

  console.log("2/5 Queue enqueue + dedupe...");
  await redis.del(POOL_QUEUE_KEY);
  await redis.del(`${PROCESSED_SIG_PREFIX}:${TEST_SIG}`);
  const beforeStats = Number((await redis.get(STATS_DETECTED_KEY)) ?? "0");

  const event = {
    signature: TEST_SIG,
    detectedAt: new Date().toISOString(),
    programId: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  };

  const first = await enqueuePoolEvent(event);
  const second = await enqueuePoolEvent(event);
  if (!first || second) throw new Error("Dedupe failed");
  const depth = await getQueueDepth();
  if (depth !== 1) throw new Error(`Expected queue depth 1, got ${depth}`);
  console.log("   OK\n");

  console.log("3/5 Consumer + processor...");
  let processed = false;
  setPoolProcessor(async (e) => {
    await processPoolEvent(e);
    processed = true;
  });
  void startPoolConsumer();
  await sleep(2000);
  if (!processed) throw new Error("Consumer did not process event");
  console.log("   OK\n");

  console.log("4/5 Stats counter...");
  const afterStats = Number((await redis.get(STATS_DETECTED_KEY)) ?? "0");
  if (afterStats <= beforeStats) throw new Error("Stats counter did not increment");
  console.log("   OK\n");

  console.log("5/5 Core module imports...");
  const { RAYDIUM_CPMM_PROGRAM_ID } = await import("./constants");
  const { parseTransaction } = await import("./utils/utils");
  if (!RAYDIUM_CPMM_PROGRAM_ID || typeof parseTransaction !== "function") {
    throw new Error("Core modules failed to load");
  }
  console.log("   OK\n");

  stopPoolConsumer();
  await closeRedis();

  console.log("✅ Full pipeline validation passed");
  console.log("Contact: https://t.me/snipmaxi");
}

validate().catch(async (err) => {
  console.error("❌ Validation failed:", err);
  const { stopPoolConsumer } = await import("./queue/pool-queue");
  const { closeRedis } = await import("./redis/client");
  stopPoolConsumer();
  await closeRedis();
  process.exit(1);
});
