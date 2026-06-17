import type { PoolCreationEvent } from "../types/pool-event";
import { parseTransaction } from "../utils/utils";

const DRY_RUN = process.env.DRY_RUN === "true";

export async function processPoolEvent(event: PoolCreationEvent): Promise<void> {
  console.log(`[processor] handling pool event: ${event.signature}`);

  if (DRY_RUN) {
    console.log("[processor] DRY_RUN — skipping on-chain parse/buy/sell");
    return;
  }

  await parseTransaction(event.signature);
}
