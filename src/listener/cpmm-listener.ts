import { PublicKey } from "@solana/web3.js";
import { RAYDIUM_CPMM_PROGRAM_ID, solanaConnection } from "../constants";
import { enqueuePoolEvent } from "../queue/pool-queue";
import type { PoolCreationEvent } from "../types/pool-event";

let subscriptionId: number | undefined;

function hasInitializeInstruction(logs: string[]): boolean {
  for (let i = 0; i < logs.length - 1; i++) {
    const logLine = logs[i].trim();
    const nextLogLine = logs[i + 1].trim();
    if (
      logLine.startsWith(`Program ${RAYDIUM_CPMM_PROGRAM_ID} invoke`) &&
      nextLogLine.toLowerCase() === "program log: instruction: initialize"
    ) {
      return true;
    }
  }
  return false;
}

export function startCpmmListener(): void {
  console.log("Starting CPMM sniper listener...");
  console.log(`Program ID: ${RAYDIUM_CPMM_PROGRAM_ID}`);

  subscriptionId = solanaConnection.onLogs(
    new PublicKey(RAYDIUM_CPMM_PROGRAM_ID),
    (logs) => {
      if (!hasInitializeInstruction(logs.logs)) return;

      const timestamp = new Date().toISOString();
      console.log(
        "====================================== New Raydium CPMM Pool Creation! ======================================"
      );
      console.log(`signature: ${logs.signature}`);
      console.log(`Time: ${timestamp}`);

      const event: PoolCreationEvent = {
        signature: logs.signature,
        detectedAt: timestamp,
        programId: RAYDIUM_CPMM_PROGRAM_ID,
      };

      void enqueuePoolEvent(event).catch((err) => {
        console.error("[listener] enqueue failed:", logs.signature, err);
      });
    },
    "confirmed"
  );

  console.log(`Subscribed with ID: ${subscriptionId}`);
}

export async function stopCpmmListener(): Promise<void> {
  if (subscriptionId !== undefined) {
    try {
      await solanaConnection.removeOnLogsListener(subscriptionId);
      console.log("Unsubscribed from CPMM program logs.");
    } catch (err) {
      console.error("Failed to unsubscribe from CPMM logs:", err);
    }
    subscriptionId = undefined;
  }
}
