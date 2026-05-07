import { RAYDIUM_CPMM_PROGRAM_ID, solanaConnection } from "./constants";
import { PublicKey } from "@solana/web3.js";
import { parseTransaction } from "./utils/utils";
import { getMint, getTransferFeeConfig, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";


let subscriptionId: number;

export const cpmmSniperListner = () => {
    console.log(`Starting cpmm sniper...`);
    console.log(`Program ID: ${RAYDIUM_CPMM_PROGRAM_ID}`);

    try {
        subscriptionId = solanaConnection.onLogs(
            new PublicKey(RAYDIUM_CPMM_PROGRAM_ID),
            (logs) => {
                const timestamp = new Date().toISOString();

                // console.log("logs ====>", logs)

                const hasExactInitializeForTargetProgram = () => {
                    const logsArray = logs.logs;

                    for (let i = 0; i < logsArray.length - 1; i++) {
                        const logLine = logsArray[i].trim();
                        const nextLogLine = logsArray[i + 1].trim();

                        // Check if current line is the program invoke
                        if (
                            logLine.startsWith(`Program ${RAYDIUM_CPMM_PROGRAM_ID} invoke`) &&
                            nextLogLine.toLowerCase() == "program log: instruction: initialize"
                        ) {
                            return true;
                        }
                    }

                    return false;
                };

                // const hasInitializeInstruction = logs.logs.some((log) =>
                //     log.trim().toLowerCase() == 'program log: instruction: initialize'
                // );

                if (hasExactInitializeForTargetProgram()) {
                    console.log(`\nTransaction ${logs.signature}`);
                    console.log(`Time: ${timestamp}`);
                    console.log(`Found Pool Create Event`);
                    parseTransaction(logs.signature);

                }
            },
            'confirmed'
        );
        
        console.log(`Subscribed with ID: ${subscriptionId}`);
    } catch (err) {
        console.error(`Error in boopPoolListner:`, err);
    }
};

export const stopBoopPoolListener = async () => {
    if (subscriptionId) {
        try {
            await solanaConnection.removeOnLogsListener(subscriptionId);
            console.log(`Unsubscribed from Boop program logs.`);
        } catch (err) {
            console.error(`Failed to unsubscribe from Boop logs:`, err);
        }
    }
};

// Graceful shutdown handlers
process.on('SIGINT', async () => {
    console.log('\n SIGINT received, shutting down Boop listener...');
    await stopBoopPoolListener();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n SIGTERM received, shutting down Boop listener...');
    await stopBoopPoolListener();
    process.exit(0);
});

// cpmmSniperListner();
// 4rbr3CDLk94EpXbdvKZBNKSL54oAwiTUEBRMj8PgqkYPpAroDgthP3ky8xLDxFfu7uLJqShe3rodX9kTrm83aLdK
// parseTransaction("4rbr3CDLk94EpXbdvKZBNKSL54oAwiTUEBRMj8PgqkYPpAroDgthP3ky8xLDxFfu7uLJqShe3rodX9kTrm83aLdK");
parseTransaction("5usgDxXxLhehhuHqFZVefz59yzr2LLi46gtwwzNtyj7wL1fnPCvs3Eb1VtuSvsMZgLRsgZpJL5ZpVScJLJ6GXzGd");
// parseTransaction("56LZMKb8X8aej2oqGCE6CggphtGLYPGcestCrzq9nCa7W7jXxwDXbvLK2oyMQseyxtXJSDkdg64LDtToigs4KagD");