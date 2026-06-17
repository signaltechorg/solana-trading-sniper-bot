/**
 * Solana Raydium CPMM Sniper Bot — entrypoint.
 * Pipeline: Listener → Redis Queue → Consumer → Processor
 */
import { connectRedis, closeRedis } from "./redis/client";
import { startCpmmListener, stopCpmmListener } from "./listener/cpmm-listener";
import {
  setPoolProcessor,
  startPoolConsumer,
  stopPoolConsumer,
} from "./queue/pool-queue";
import { processPoolEvent } from "./processor/pool-processor";

async function main(): Promise<void> {
  console.log("⚡ Solana Trading Sniper Bot starting...");
  console.log("Support: https://t.me/snipmaxi");

  await connectRedis();
  console.log("[redis] connected");

  setPoolProcessor(processPoolEvent);
  void startPoolConsumer();

  startCpmmListener();

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    stopPoolConsumer();
    await stopCpmmListener();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (err) => {
  console.error("Fatal startup error:", err);
  await closeRedis();
  process.exit(1);
});
