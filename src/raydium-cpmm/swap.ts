import { Keypair, PublicKey, Transaction, SystemProgram, TransactionInstruction, sendAndConfirmTransaction, LAMPORTS_PER_SOL, ComputeBudgetProgram, VersionedTransaction, TransactionMessage } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountInstruction, createSyncNativeInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, getAccount, getMint } from "@solana/spl-token";
import { swapBaseInput, swapBaseOutput } from "./index";
import { solanaConnection, WSOL_AMOUNT } from "../constants";
import { BN } from "bn.js";

export interface raydiumCpmmSwap {
    transaction: string;
    amount: number;
    poolId: string;
}

// Helper function to determine token program ID from mint address
export const getTokenProgramIdFromMint = async (mintAddress: PublicKey): Promise<PublicKey> => {
    try {
        // Get the mint account info
        const mintAccountInfo = await solanaConnection.getAccountInfo(mintAddress);

        if (!mintAccountInfo) {
            // If mint account doesn't exist, default to TOKEN_PROGRAM_ID
            console.log(`Mint account not found for ${mintAddress.toBase58()}, defaulting to TOKEN_PROGRAM_ID`);
            return TOKEN_PROGRAM_ID;
        }

        // The owner of the mint account is the token program ID
        const tokenProgramId = mintAccountInfo.owner;

        // Check if it's a known token program
        if (tokenProgramId.equals(TOKEN_PROGRAM_ID)) {
            return TOKEN_PROGRAM_ID;
        } else if (tokenProgramId.equals(TOKEN_2022_PROGRAM_ID)) {
            return TOKEN_2022_PROGRAM_ID;
        } else {
            // For unknown token programs, return the actual owner
            console.log(`Unknown token program for mint ${mintAddress.toBase58()}: ${tokenProgramId.toBase58()}`);
            return tokenProgramId;
        }
    } catch (error) {
        console.error(`Error getting token program ID for mint ${mintAddress.toBase58()}:`);
        // Default to TOKEN_PROGRAM_ID on error
        return TOKEN_PROGRAM_ID;
    }
};

export const raydium_cpmm_buy = async (
    keypair: Keypair,
    poolAddress: PublicKey,
    baseTokenMint: string,
    quoteTokenMint: string,
    ammConfig: string,
    amount: number,
    percentage: number = 100
): Promise<raydiumCpmmSwap | false> => {
    const inputMint = new PublicKey(baseTokenMint)
    const outputMint = new PublicKey(quoteTokenMint);

    // Determine token program IDs for both tokens
    const inputTokenProgramId = await getTokenProgramIdFromMint(inputMint);
    const outputTokenProgramId = await getTokenProgramIdFromMint(outputMint);


    const instructions: TransactionInstruction[] = [];

    const setComputeUnitLimitIx: TransactionInstruction =
        ComputeBudgetProgram.setComputeUnitLimit({
            units: 200_000, // max compute units
        });

    const setComputeUnitPriceIx: TransactionInstruction =
        ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 10000, // fee per CU (1e-6 SOL). Tune this
        });

    instructions.push(
        setComputeUnitLimitIx,
        setComputeUnitPriceIx
    )
    let swapAmount: number;

    let inputTokenAccount
    if (inputMint.toBase58() == NATIVE_MINT.toBase58()) {
        inputTokenAccount = getAssociatedTokenAddressSync(
            inputMint, // Token mint address
            keypair.publicKey, // Owner (your wallet)
        );
        swapAmount = amount * percentage / 100;

        let inputAccountInfo;
        try {
            inputAccountInfo = await solanaConnection.getAccountInfo(inputTokenAccount);
            // console.log("inputAccountInfo :>> ", inputAccountInfo);
        } catch (err) {
            console.log("Buy Wsol account not found in input, creating...");
        }

    } else {
        inputTokenAccount = getAssociatedTokenAddressSync(
            inputMint, // Token mint address
            keypair.publicKey, // Owner (your wallet)
            false, // Allow owner off-curve? (usually false)
            inputTokenProgramId // Use the correct token program ID
        );

        let inputAccountInfo;
        try {
            inputAccountInfo = await solanaConnection.getTokenAccountBalance(inputTokenAccount);
        } catch (err) {
            console.log("Buy Token account not found in input, creating...");
        }
        const tokenAmount = inputAccountInfo?.value?.amount;
        swapAmount = Number(tokenAmount) * percentage / 100 || 0;
    }

    instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
            keypair.publicKey, // Payer
            inputTokenAccount, // New token account
            keypair.publicKey, // Owner
            inputMint, // Token mint
            inputTokenProgramId // Use the correct token program ID
        ),
        SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: inputTokenAccount,
            lamports: WSOL_AMOUNT * LAMPORTS_PER_SOL,
        }),
        createSyncNativeInstruction(inputTokenAccount, inputTokenProgramId),
    )

    const outputTokenAccount = await getAssociatedTokenAddress(
        outputMint, // Token mint address
        keypair.publicKey, // Owner (your wallet)
        false, // Allow owner off-curve? (usually false)
        outputTokenProgramId // Use the correct token program ID
    );

    let outputAccountInfo;
    try {
        outputAccountInfo = await solanaConnection.getAccountInfo(outputTokenAccount);
    } catch (err) {
        console.log("Buy Token account not found in output, creating...");
    }
    // console.log("outputAccountInfo:", outputAccountInfo)

    if (!outputAccountInfo) {
        instructions.push(
            createAssociatedTokenAccountIdempotentInstruction(
                keypair.publicKey, // Payer
                outputTokenAccount, // New token account
                keypair.publicKey, // Owner
                outputMint, // Token mint
                outputTokenProgramId // Use the correct token program ID
            )
        );
    }

    const ix = await swapBaseOutput(
        keypair,
        poolAddress,
        new PublicKey(ammConfig),
        inputMint,
        inputTokenProgramId, // Use the correct input token program ID
        outputMint,
        outputTokenProgramId, // Use the correct output token program ID
        swapAmount,
        outputTokenAccount // Make sure this is included in swapBaseInput
    );

    instructions.push(ix);
    const closeWsolIx = createCloseAccountInstruction(
        inputTokenAccount,    // account to close (WSOL ATA)
        keypair.publicKey,           // destination for returned SOL
        keypair.publicKey,           // authority (owner of ATA)
        [], // multiSigners
        inputTokenProgramId // Use the correct token program ID
    );
    instructions.push(closeWsolIx)

    const tx = new Transaction()
        .add(...instructions)
    // Get recent blockhash
    const { blockhash } = await solanaConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = keypair.publicKey;

    // ✅ Simulate first
    const sim = await solanaConnection.simulateTransaction(tx);
    console.log("buy transaction simulation =>", sim)
    if (sim.value.err) {
        console.error("❌ Simulation failed:", sim.value.err);
        return false; // <-- return false if simulation fails
    }
    // Sign and send transaction
    const txid = await sendAndConfirmTransaction(solanaConnection, tx, [keypair]);
    if (txid) {
        return {
            transaction: txid,
            amount: amount,
            poolId: poolAddress.toBase58()
        };
    } else return false
}

export const raydium_cpmm_sell = async (
    keypair: Keypair,
    poolAddress: PublicKey,
    baseTokenMint: string,
    quoteTokenMint: string,
    ammConfig: string,
    amount: number,
    percentage: number = 100
): Promise<raydiumCpmmSwap | null> => {
    const inputMint = new PublicKey(baseTokenMint) //sol
    const outputMint = new PublicKey(quoteTokenMint);

    // Determine token program IDs for both tokens
    const inputTokenProgramId = await getTokenProgramIdFromMint(inputMint);
    const outputTokenProgramId = await getTokenProgramIdFromMint(outputMint);

    const instructions: TransactionInstruction[] = [];
    let swapAmount: number;

    let inputTokenAccount
    if (inputMint.toBase58() == NATIVE_MINT.toBase58()) {
        swapAmount = amount * percentage / 100;
        inputTokenAccount = getAssociatedTokenAddressSync(
            inputMint, // Token mint address
            keypair.publicKey, // Owner (your wallet)
        );

        let inputAccountInfo;
        try {
            inputAccountInfo = await solanaConnection.getAccountInfo(inputTokenAccount);
        } catch (err) {
            console.log("Sell Wsol account not found in input, creating...");
        }
    } else {
        inputTokenAccount = getAssociatedTokenAddressSync(
            inputMint, // Token mint address
            keypair.publicKey, // Owner (your wallet)
            false, // Allow owner off-curve? (usually false)
            inputTokenProgramId // Use the correct token program ID
        );

        let inputAccountInfo;
        try {
            inputAccountInfo = await solanaConnection.getTokenAccountBalance(inputTokenAccount);
        } catch (err) {
            console.log("Sell Token account not found in input, creating...");
        }
        const tokenAmount = inputAccountInfo?.value?.amount;
        swapAmount = Number(tokenAmount) * percentage / 100 || 0;
    }

    instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
            keypair.publicKey, // Payer
            inputTokenAccount, // New token account
            keypair.publicKey, // Owner
            inputMint, // Token mint
            inputTokenProgramId // Use the correct token program ID
        )
    )

    const outputTokenAccount = await getAssociatedTokenAddress(
        outputMint, // Token mint address
        keypair.publicKey, // Owner (your wallet)
        false, // Allow owner off-curve? (usually false)
        outputTokenProgramId // Use the correct token program ID
    );

    let outputAccountInfo;
    try {
        outputAccountInfo = await solanaConnection.getAccountInfo(outputTokenAccount);
    } catch (err) {
        console.log("Sell Token account not found in output , creating...");
    }

    const ix = await swapBaseInput(
        keypair,
        poolAddress,
        new PublicKey(ammConfig),
        inputMint,
        inputTokenProgramId, // Use the correct input token program ID
        outputMint,
        outputTokenProgramId, // Use the correct output token program ID
        swapAmount,
        outputTokenAccount // Make sure this is included in swapBaseInput
    );
    instructions.push(ix);

    const closeWsolIx = createCloseAccountInstruction(
        inputTokenAccount,           // account to close (WSOL ATA)
        keypair.publicKey,           // destination for returned SOL
        keypair.publicKey,           // authority (owner of ATA)
        [], // multiSigners
        inputTokenProgramId // Use the correct token program ID
    );
    instructions.push(closeWsolIx)

    //close token account
    const closeTokenIx = createCloseAccountInstruction(
        outputTokenAccount,
        keypair.publicKey,
        keypair.publicKey,
        [], // multiSigners
        outputTokenProgramId // Use the correct token program ID
    )

    if ( percentage == 100 ) {
        instructions.push(closeTokenIx)
    }
    const tx = new Transaction()
        .add(...instructions)
    // Get recent blockhash
    const { blockhash } = await solanaConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = keypair.publicKey;

    // console.log("sell transaction simulate =====", await solanaConnection.simulateTransaction(tx));
    // Sign and send transaction
    const txid = await sendAndConfirmTransaction(solanaConnection, tx, [keypair]);
    if (txid) {
        return {
            transaction: txid,
            amount: amount,
            poolId: poolAddress.toBase58()
        };
    } else return null
}

export async function getTokenBalance(walletAddress: string, tokenMintAddress: string) {
    try {
        const wallet = new PublicKey(walletAddress);
        const mint = new PublicKey(tokenMintAddress);

        // 🔹 Detect whether this token is SPL or Token-2022
        const tokenProgramId = await getTokenProgramIdFromMint(mint);

        // 🔹 Get ATA for this token under the right program
        const ata = await getAssociatedTokenAddress(
            mint,
            wallet,
            false,
            tokenProgramId
        );

        // 🔹 Fetch account info under correct program
        const accountInfo = await getAccount(solanaConnection, ata, undefined, tokenProgramId);

        // 🔹 Get mint info to resolve decimals
        const mintInfo = await getMint(solanaConnection, mint, undefined, tokenProgramId);

        const balance = Number(accountInfo.amount)

        console.log(`Wallet Token Balance (${tokenMintAddress}): ${balance}`);
        return balance;
    } catch (err) {
        console.error("getTokenBalance error:", err);
        return 0;
    }
}

export const getBuyTx = async (
    keypair: Keypair,
    poolAddress: PublicKey,
    baseTokenMint: string,
    quoteTokenMint: string,
    ammConfig: string,
    amount: number,
): Promise<VersionedTransaction[]> => {
    const inputMint = new PublicKey(baseTokenMint);
    const outputMint = new PublicKey(quoteTokenMint);

    const inputTokenProgramId = await getTokenProgramIdFromMint(inputMint);
    const outputTokenProgramId = await getTokenProgramIdFromMint(outputMint);

    const instructions: TransactionInstruction[] = [];

    const setComputeUnitLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 200_000,
    });

    const setComputeUnitPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 100_000,
    });

    instructions.push(setComputeUnitLimitIx, setComputeUnitPriceIx);

    let swapAmount: number;
    let inputTokenAccount;

    if (inputMint.toBase58() == NATIVE_MINT.toBase58()) {
        inputTokenAccount = getAssociatedTokenAddressSync(inputMint, keypair.publicKey);
        swapAmount = amount;

        try {
            await solanaConnection.getAccountInfo(inputTokenAccount);
        } catch {
            console.log("Buy WSOL account not found in input, creating...");
        }
    } else {
        inputTokenAccount = getAssociatedTokenAddressSync(
            inputMint,
            keypair.publicKey,
            false,
            inputTokenProgramId
        );

        try {
            const inputAccountInfo = await solanaConnection.getTokenAccountBalance(inputTokenAccount);
            swapAmount = Number(inputAccountInfo?.value?.amount) || 0;
        } catch {
            console.log("Buy Token account not found in input, creating...");
            swapAmount = 0;
        }
    }

    instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
            keypair.publicKey,
            inputTokenAccount,
            keypair.publicKey,
            inputMint,
            inputTokenProgramId // Use the correct token program ID
        ),
        SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: inputTokenAccount,
            lamports: WSOL_AMOUNT * LAMPORTS_PER_SOL,
        }),
        createSyncNativeInstruction(inputTokenAccount, inputTokenProgramId),
    );

    const outputTokenAccount = await getAssociatedTokenAddress(
        outputMint,
        keypair.publicKey,
        false,
        outputTokenProgramId
    );

    instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
            keypair.publicKey,
            outputTokenAccount,
            keypair.publicKey,
            outputMint,
            outputTokenProgramId
        )
    );

    const ix = await swapBaseOutput(
        keypair,
        poolAddress,
        new PublicKey(ammConfig),
        inputMint,
        inputTokenProgramId,
        outputMint,
        outputTokenProgramId,
        swapAmount,
        outputTokenAccount
    );

    instructions.push(ix);

    const closeWsolIx = createCloseAccountInstruction(
        inputTokenAccount,
        keypair.publicKey,
        keypair.publicKey,
        [], // multiSigners
        inputTokenProgramId // Use the correct token program ID
    );
    instructions.push(closeWsolIx);

    // 🔹 Build Versioned Transaction
    const { blockhash } = await solanaConnection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
        payerKey: keypair.publicKey,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    const versionedTx = new VersionedTransaction(messageV0);
    versionedTx.sign([keypair])
    const buyTx: VersionedTransaction[] = []
    buyTx.push(versionedTx)
    return buyTx;
};