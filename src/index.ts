import { RAYDIUM_CPMM_PROGRAM_ID, solanaConnection } from "./constants";
import { PublicKey } from "@solana/web3.js";
import { parseTransaction } from "./utils/utils";


let subscriptionId: number;

export const cpmmSniperListner = () => {
    console.log(`Starting cpmm sniper...`);
    console.log(`Program ID: ${RAYDIUM_CPMM_PROGRAM_ID}`);

    try {
        subscriptionId = solanaConnection.onLogs(
            new PublicKey(RAYDIUM_CPMM_PROGRAM_ID),
            (logs) => {
                const timestamp = new Date().toISOString();
                const hasExactInitializeForTargetProgram = () => {
                    const logsArray = logs.logs;

                    for (let i = 0; i < logsArray.length - 1; i++) {
                        const logLine = logsArray[i].trim();
                        const nextLogLine = logsArray[i + 1].trim();
                        if (
                            logLine.startsWith(`Program ${RAYDIUM_CPMM_PROGRAM_ID} invoke`) &&
                            nextLogLine.toLowerCase() == "program log: instruction: initialize"
                        ) {
                            return true;
                        }
                    }
                    return false;
                };
                if (hasExactInitializeForTargetProgram()) {
                    console.log("======================================💊 New Raydium CPMM Pool Creation Detected!======================================");
                    console.log(`\n signature: ${logs.signature}`);
                    console.log(`Time: ${timestamp}`);
                    parseTransaction(logs.signature);
                }
            }
        );
    } catch (err) {
        console.error(`Error in cpmmSniperListner:`, err);
    }
};

export const stopCpmmSniperListener = async () => {
    if (subscriptionId) {
        try {
            await solanaConnection.removeOnLogsListener(subscriptionId);
            console.log(`Unsubscribed from cpmm program logs.`);
        } catch (err) {
            console.error(`Failed to unsubscribe from cpmm logs:`, err);
        }
    }
};

// Graceful shutdown handlers
process.on('SIGINT', async () => {
    console.log('\n SIGINT received, shutting down cpmm listener...');
    await stopCpmmSniperListener();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n SIGTERM received, shutting down cpmm listener...');
    await stopCpmmSniperListener();
    process.exit(0);
});

cpmmSniperListner();


