import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import base58 from "bs58";
import axios, { AxiosError } from "axios";
import { JITO_FEE, solanaConnection } from "../constants";

interface Blockhash {
  blockhash: string;
  lastValidBlockHeight: number;
}


export const jitoWithAxios = async (
  transactions: VersionedTransaction[],
  payer: Keypair
) => {
  // console.log("🚀 Starting Jito transaction execution...");

  const tipAccounts = [
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  ];

  const jitoFeeWallet = new PublicKey(
    tipAccounts[Math.floor(Math.random() * tipAccounts.length)]
  );
  // console.log(`Selected Jito fee wallet: ${jitoFeeWallet.toBase58()}`);
  // console.log(`Calculated fee: ${JITO_FEE / LAMPORTS_PER_SOL} SOL`);

  try {
    // Get latest blockhash
    const latestBlockhash = await solanaConnection.getLatestBlockhash();
    // console.log(" Got latest blockhash:", latestBlockhash.blockhash);

    // Create Jito tip transaction
    const jitTipTxFeeMessage = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: jitoFeeWallet,
          lamports: Math.floor(JITO_FEE * 10 ** 9),
        }),
      ],
    }).compileToV0Message();

    const jitoFeeTx = new VersionedTransaction(jitTipTxFeeMessage);
    jitoFeeTx.sign([payer]);
    // console.log("jito feel tx simulation ==> ", await solanaConnection.simulateTransaction(jitoFeeTx))

    // Simulate the transaction (optional)
    const simulation = await solanaConnection.simulateTransaction(jitoFeeTx);
    if (simulation.value.err) {
      console.error("Simulation failed:", simulation.value.err);
      return { confirmed: false };
    }

    const serializedjitoFeeTx = base58.encode(jitoFeeTx.serialize());

    const serializedTransactions = [serializedjitoFeeTx];
    // console.log("buy simulation", await solanaConnection.simulateTransaction(transactions[0], {sigVerify: true}))
    const buySig = base58.encode(transactions[0].signatures[0])
    for (let i = 0; i < transactions.length; i++) {
      const serializedTx = base58.encode(transactions[i].serialize());
      serializedTransactions.push(serializedTx);
    }

    const endpoints = [
      'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
      'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
      'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
      'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
      'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
    ];

    const requests = endpoints.map((url) =>
      axios.post(url, {
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [serializedTransactions],
      }).catch((err) => err)
    );

    // console.log("Sending transaction bundle to endpoints...");

    const results = await Promise.all(requests.map((p) => p.catch((e) => e)));

    const successfulResults = results.filter((result) => !(result instanceof Error));

    if (successfulResults.length > 0) {
      // console.log("Successful Jito response received.");

      // Use original blockhash and lastValidBlockHeight for confirmation
      const confirmation = await solanaConnection.confirmTransaction(
        {
          signature: buySig,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          blockhash: latestBlockhash.blockhash,
        },
        "confirmed"
      );

      // console.log(" Transaction confirmation result:", confirmation);

      return { confirmed: !confirmation.value.err, buySig };
    } else {
      // console.error("❌ No successful Jito response.");
    }

    return { confirmed: false };
  } catch (error) {
    if (error instanceof AxiosError) {
      // console.error("❌ Axios request failed during Jito transaction.");
    }

    // console.error("🔥 Error during transaction execution:", error);
    return { confirmed: false };
  }
};
