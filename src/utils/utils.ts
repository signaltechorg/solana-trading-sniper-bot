import fs from 'fs';
import dotenv from 'dotenv';
import { LAMPORTS_PER_SOL, ParsedInstruction, ParsedTransactionWithMeta, PartiallyDecodedInstruction, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress, getMint, getTransferFeeConfig, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getPoolInfo, getTokenPriceInSol } from '../raydium-cpmm';
import { getBuyTx, getTokenBalance, getTokenProgramIdFromMint, raydium_cpmm_buy, raydium_cpmm_sell } from '../raydium-cpmm/swap';
import { Metaplex } from '@metaplex-foundation/js';
import {
    BUY_AMOUNT,
    buyerKp,
    DELAY,
    HARD_STOP_LOSS_PCT,
    limitCount,
    MAX_DEV_WALLET_SUPPLY_PCT,
    MAX_SELL_TAX_PCT,
    MIN_LIQUIDITY_SOL,
    Psol_Address,
    RAYDIUM_CPMM_PROGRAM_ID,
    REQUIRE_REVOKED_UPGRADE_AUTHORITY,
    solanaConnection,
    TP_LEVELS_PCT1,
    TP_LEVELS_PCT2,
    TP_LEVELS_PCT3,
    TP_SIZE_PCT1,
    TP_SIZE_PCT2,
    TRAIL_DISTANCE_PCT,
    WSOL_AMOUNT
} from '../constants';
import axios from 'axios';
import { jitoWithAxios } from './jito';

dotenv.config();

// Function to read JSON file
export function readJson(filename: string = "../data.json"): string[] {
    if (!fs.existsSync(filename)) {
        // If the file does not exist, create an empty array
        fs.writeFileSync(filename, '[]', 'utf-8');
    }
    const data = fs.readFileSync(filename, 'utf-8');
    return JSON.parse(data) as string[];
}

// Function to write JSON file
export function writeJson(data: string[], filename: string = "../data.json",): void {
    fs.writeFileSync(filename, JSON.stringify(data, null, 4), 'utf-8');
}


export const retrieveEnvVariable = (variableName: string) => {
    const variable = process.env[variableName] || '';
    if (!variable) {
        console.log(`${variableName} is not set`);
        process.exit(1);
    }
    return variable;
};

// get sol price of onchain
export async function getSolPrice() {
    try {
        const response = await axios.get('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');

        const price = response.data.data.So11111111111111111111111111111111111111112.price;
        console.log("🚀 ~ getSolPrice ~ price:", price)
        return price;
    } catch (error) {
        console.error("Error fetching SOL price:", error);
        return 0;
    }
}

export const sleep = async (ms: number) => {
    await new Promise((resolve) => setTimeout(resolve, ms))
}
let isSniper = true

export const parseTransaction = async (tx: string) => {
    if (!isSniper) {
        console.log("not handled past event")
        return
    }
    try {
        const transaction: ParsedTransactionWithMeta | null = await solanaConnection.getParsedTransaction(tx, {
            maxSupportedTransactionVersion: 0,
        });

        if (!transaction) {
            console.error('Transaction not found');
            return;
        }

        const innerInstructions = transaction.meta?.innerInstructions;

        let baseToken: string = "";
        let quoteToken: string = "";
        let lpTokenMint: string | null = null;
        let lpTokenAmount: string | null = null;
        let baseTokenAmount: string = "0";
        let quoteTokenAmount: string = "0";
        let poolId: string = "";
        let ammConfig = ""
        let creator = ""
        let checkRevokeAuthority = false
        let mintInfo
        let checkDevWallet = true
        let isSplToken = true

        for (const ix of transaction.transaction.message.instructions) {
            if ('programId' in ix && ix.programId.toBase58() === RAYDIUM_CPMM_PROGRAM_ID) {
                if ('accounts' in ix) {
                    const decodedIx = ix as PartiallyDecodedInstruction;
                    ammConfig = decodedIx.accounts[1]?.toBase58();
                    baseToken = decodedIx.accounts[5]?.toBase58();
                    quoteToken = decodedIx.accounts[4]?.toBase58();
                    poolId = decodedIx.accounts[3]?.toBase58(); // You can change index if needed
                    lpTokenMint = decodedIx.accounts[6]?.toBase58();
                    creator = decodedIx.accounts[0]?.toBase58();
                    if (baseToken == Psol_Address || quoteToken == Psol_Address) {
                        console.log("psol migrate failed")
                        return
                    }
                    if (baseToken == NATIVE_MINT.toBase58()) {
                        baseToken = quoteToken
                        quoteToken = NATIVE_MINT.toBase58()
                    }
                }
            }
        }

        if (innerInstructions) {
            for (const ixContainer of innerInstructions) {
                for (const ix of ixContainer.instructions) {
                    if ('programId' in ix && ix.programId.toBase58() === RAYDIUM_CPMM_PROGRAM_ID) {

                        if ('accounts' in ix) {
                            const decodedIx = ix as PartiallyDecodedInstruction;
                            ammConfig = decodedIx.accounts[1]?.toBase58();
                            baseToken = decodedIx.accounts[5]?.toBase58();
                            quoteToken = decodedIx.accounts[4]?.toBase58();
                            poolId = decodedIx.accounts[3]?.toBase58(); // You can change index if needed
                            lpTokenMint = decodedIx.accounts[6]?.toBase58();
                            creator = decodedIx.accounts[0]?.toBase58();
                            if (baseToken == Psol_Address || quoteToken == Psol_Address) {
                                console.log("psol migrate failed")
                                return
                            }
                            if (baseToken == NATIVE_MINT.toBase58()) {
                                baseToken = quoteToken
                                quoteToken = NATIVE_MINT.toBase58()
                            }
                        }
                    }
                    if ('parsed' in ix) {
                        const parsedIx = ix as ParsedInstruction;

                        if (parsedIx.parsed?.type === "transferChecked") {
                            const mint = parsedIx.parsed.info.mint;
                            if (mint == baseToken) {
                                baseTokenAmount = parsedIx.parsed.info.tokenAmount?.uiAmount;
                            }

                            if (mint === quoteToken) {
                                quoteTokenAmount = parsedIx.parsed.info.tokenAmount?.uiAmount;
                            }
                        }

                        if (parsedIx.parsed?.type === "mintTo") {
                            const mint = parsedIx.parsed.info.mint;
                            if (mint == lpTokenMint)
                                lpTokenAmount = parsedIx.parsed.info.amount;
                        }
                    }
                }

            }
        }


        console.log("Base Token: ", baseToken);
        console.log("Quote Token: ", quoteToken);
        console.log("LP Token Mint: ", lpTokenMint);
        console.log("Creator: ", creator);
        console.log("LP Token Amount: ", lpTokenAmount);
        console.log("Base Token Amount: ", baseTokenAmount);
        console.log("Quote Token Amount: ", quoteTokenAmount);
        console.log("poolId: ", poolId);


        let addLiquidity = quoteTokenAmount

        let tokenProgramId = await getTokenProgramIdFromMint(new PublicKey(baseToken))

        if (tokenProgramId == TOKEN_2022_PROGRAM_ID) {
            isSplToken = false
            mintInfo = await getMint(solanaConnection, new PublicKey(baseToken), undefined, TOKEN_2022_PROGRAM_ID)
            console.log(" ======== check token2022 program ========= ")
            let feeConfig: any = await getFeeConfig(new PublicKey(baseToken))
            if (feeConfig) {
                let sellTaxPct = Number(feeConfig?.newerTransferFee?.transferFeeBasisPoints) / 100 || 0
                if (sellTaxPct > MAX_SELL_TAX_PCT) {
                    console.log(" ======= Max sell tax pct is incorrect ========= ")
                    return;
                }
            }

            checkRevokeAuthority = await revokedUpgradeAuthority(new PublicKey(baseToken), TOKEN_2022_PROGRAM_ID)
            if (!checkRevokeAuthority) {
                console.log(" ======== check revoke authority 2022 incorrect ======= ")
                return
            }
        }

        if (Number(addLiquidity) >= MIN_LIQUIDITY_SOL) {
            /**
             *  THis is added to wait until pool trading open time
             */
            const poolState = await getPoolInfo(new PublicKey(poolId))
            const openTime = poolState?.open_time
            console.log("🚀 ~ parseTransaction ~ openTime:", openTime)
            if (!openTime) {
                console.log("openTime is null\ntransaction failed")
                return
            }
            if (Number(openTime) * 1000 > Date.now()) {
                const openTimeInterval = Number(openTime.toString()) * 1000 - Date.now();
                console.log("Should wait for ", Math.ceil(openTimeInterval / 100) / 10, "sec until pool trading gets enabled")
                await sleep(openTimeInterval + 1500)
            }

            // if (isSplToken) {
            //     console.log("dev wallet check in spl token")
            //     checkDevWallet = await checkDevbuy(
            //         new PublicKey(creator),
            //         new PublicKey(baseToken),
            //         Number(baseTokenAmount),
            //         TOKEN_PROGRAM_ID
            //     )
            // }
            // else {
            //     console.log("dev wallet check in token 2022")
            //     checkDevWallet = await checkDevbuy(
            //         new PublicKey(creator),
            //         new PublicKey(baseToken),
            //         Number(baseTokenAmount),
            //         TOKEN_2022_PROGRAM_ID
            //     )

            // }

            if (!checkDevWallet) {
                console.log(" ==== dev wallet amount incorrect ==== ")
                return;
            }

            if (isSplToken)
                checkRevokeAuthority = await revokedUpgradeAuthority(new PublicKey(baseToken), TOKEN_PROGRAM_ID)
            else
                checkRevokeAuthority = await revokedUpgradeAuthority(new PublicKey(baseToken), TOKEN_2022_PROGRAM_ID)
            if (!checkRevokeAuthority) {
                console.log(" ======== check revoke authority incorrect ======= ")
                return
            }

            const timestamp2 = Date.now();
            console.log('Detecting Consumed => ', timestamp2, 'ms')

            const originTokenPrice = await getTokenPriceInSol(new PublicKey(poolId))
            console.log("originTokenPrice =>", originTokenPrice)

            const buyTxq = await raydium_cpmm_buy(buyerKp, new PublicKey(poolId), quoteToken, baseToken, ammConfig, BUY_AMOUNT * LAMPORTS_PER_SOL);
            console.log("🚀 ~ parseTransaction ~ buyTxq:", buyTxq)
            let buyAmount = (WSOL_AMOUNT - 0.001) / originTokenPrice!
            // console.log("🚀 ~ parseTransaction ~ buyAmount:", buyAmount)
            // const buyTx = await getBuyTx(buyerKp, new PublicKey(poolId), quoteToken, baseToken, ammConfig, buyAmount);
            // const buyResult = await jitoWithAxios(buyTx, buyerKp);

            // console.log("buy transaction ==>", buyResult?.transaction)
            // const sellResult = await raydium_cpmm_sell(buyerKp, new PublicKey(poolId), quoteToken, baseToken, ammConfig, BUY_AMOUNT * LAMPORTS_PER_SOL);
            // console.log("sell transaction ==>", sellResult?.transaction)
            let isPct0 = false
            let isPct1 = false
            let isPct = false
            let trailPct = false
            if (buyTxq) {
                // console.log("buy transaction =>:", buyTxq)
                isSniper = false
                let limitNum = 0
                while (!isPct && limitNum < limitCount) {
                    limitNum++;
                    const currentTokenPrice = await getTokenPriceInSol(new PublicKey(poolId))
                    console.log("calculate currentTokenPrice =>", currentTokenPrice)

                    const pnl = currentTokenPrice! / originTokenPrice!
                    const profit_pct = (pnl - 1) * 100
                    console.log(" ...Check profit_pct =>", profit_pct)

                    if (profit_pct >= TRAIL_DISTANCE_PCT) {
                        trailPct = true
                    }
                    if (trailPct && profit_pct < TRAIL_DISTANCE_PCT) {
                        console.log(" reached limit percent again in price ")
                        let sellAmount = await getTokenBalance(buyerKp.publicKey.toBase58(), baseToken)
                        const sellResult = await raydium_cpmm_sell(buyerKp, new PublicKey(poolId), quoteToken, baseToken, ammConfig, sellAmount);
                        if (sellResult) {
                            console.log(`sell => https://solscan.io/tx/${sellResult.transaction}`)
                            isPct = true
                            isSniper = true
                        }
                    }


                    if (profit_pct <= Number(TP_LEVELS_PCT2) && profit_pct >= Number(TP_LEVELS_PCT1) && !isPct0) {
                        console.log(`reached ${TP_LEVELS_PCT1} % in price`)
                        const sellResult = await raydium_cpmm_sell(buyerKp, new PublicKey(poolId), quoteToken, baseToken, ammConfig, BUY_AMOUNT * LAMPORTS_PER_SOL, Number(TP_SIZE_PCT1) * 100);
                        if (sellResult) {
                            console.log(`sell => https://solscan.io/tx/${sellResult.transaction}`)
                            isPct0 = true
                        }
                    }
                    if (profit_pct <= Number(TP_LEVELS_PCT3) && profit_pct >= Number(TP_LEVELS_PCT2) && !isPct1) {
                        console.log(`reached ${TP_LEVELS_PCT2} % in price`)
                        const sellResult = await raydium_cpmm_sell(buyerKp, new PublicKey(poolId), quoteToken, baseToken, ammConfig, BUY_AMOUNT * LAMPORTS_PER_SOL, Number(TP_SIZE_PCT2) * 100);
                        if (sellResult) {
                            console.log(`sell => https://solscan.io/tx/${sellResult.transaction}`)
                            isPct1 = true
                        }
                    }
                    if (profit_pct >= Number(TP_LEVELS_PCT3) && !isPct) {
                        console.log(`reached ${TP_LEVELS_PCT3} % in price`)
                        let sellAmount = await getTokenBalance(buyerKp.publicKey.toBase58(), baseToken)
                        const sellResult = await raydium_cpmm_sell(buyerKp, new PublicKey(poolId), quoteToken, baseToken, ammConfig, sellAmount);
                        if (sellResult) {
                            console.log(`sell => https://solscan.io/tx/${sellResult.transaction}`)
                            isPct = true
                            isSniper = true
                        }
                    }


                    if (Number(profit_pct) < Number(HARD_STOP_LOSS_PCT)) {
                        console.log("reached HARD_STOP_LOSS_PCT % in price, all sell")
                        let sellAmount = await getTokenBalance(buyerKp.publicKey.toBase58(), baseToken)
                        const sellResult = await raydium_cpmm_sell(buyerKp, new PublicKey(poolId), quoteToken, baseToken, ammConfig, sellAmount);
                        if (sellResult) {
                            console.log(`HARD_STOP_LOSS_PCT sell => https://solscan.io/tx/${sellResult.transaction}`)
                            isPct = true
                            isSniper = true
                        }
                    }
                    await sleep(DELAY)
                }
                if (limitNum == limitCount) {
                    console.log("start limitNum sell")
                    let sellAmount = await getTokenBalance(buyerKp.publicKey.toBase58(), baseToken)
                    isSniper = true
                    const sellResult = await raydium_cpmm_sell(buyerKp, new PublicKey(poolId), quoteToken, baseToken, ammConfig, sellAmount);
                    if (sellResult) {
                        console.log(`Limit sell => https://solscan.io/tx/${sellResult.transaction}`)
                    }
                }
            }
        } else {
            console.log("low liquiditiy value ==>", quoteTokenAmount)
        }
    } catch (error) {
        console.error("parse transaction error ==>:", error);
    }
}

const checkDevbuy = async (
    creator: PublicKey,
    token: PublicKey,
    totalAmount: number,
    programId: PublicKey
) => {
    try {
        // Get the mint info to know decimals and total supply
        const mintInfo = await getMint(solanaConnection, token, undefined, programId);
        const decimals = mintInfo.decimals;

        // Get the creator's associated token account
        const ata = await getAssociatedTokenAddress(token, creator, false, programId);
        const accountInfo = await getAccount(solanaConnection, ata, undefined, programId);
        const creatorRawAmount = Number(accountInfo.amount);

        // Convert raw amounts to human-readable form
        const creatorAmount = creatorRawAmount / Math.pow(10, decimals);
        const percent = (creatorAmount / totalAmount) * 100;

        // Check if it's exactly %
        if (percent < MAX_DEV_WALLET_SUPPLY_PCT) {
            console.log("Creator owns exactly % of the total supply.");
            return true;
        } else {
            console.log(`❌ Creator owns ${percent.toFixed(2)}%, not %.`);
            return false;
        }
    } catch (error) {
        console.error("Error checking dev buy percentage:", error);
        return false;
    }
};

export async function getTokenMetaData(mintAddress: PublicKey): Promise<any> {

    const metaplex = new Metaplex(solanaConnection);
    try {
        const nft = await metaplex.nfts().findByMint({ mintAddress });
        return nft
    } catch (error) {
        console.error('❌ Error fetching token symbol:', error);
        return null;
    }

}

export async function getFeeConfig(mint: PublicKey) {
    try {
        const mintInfo = await getMint(solanaConnection, mint, undefined, TOKEN_2022_PROGRAM_ID)
        const feeConfig = getTransferFeeConfig(mintInfo)
        console.log("fee config", feeConfig)
        return feeConfig;
    } catch (err) {
        console.log("get feeConfig error ==>", err)
        return
    }
}

const revokedUpgradeAuthority = async (mint: PublicKey, programId: PublicKey) => {
    let mintInfo: any = await getMint(solanaConnection, mint, undefined, programId)
    let mintAuthorityAddress = mintInfo?.mintAuthorityAddress
    let freezeAuthorityAddress = mintInfo?.freezeAuthorityAddress
    if (REQUIRE_REVOKED_UPGRADE_AUTHORITY) {
        if (mintAuthorityAddress == null && freezeAuthorityAddress == null) {
            return true
        } else {
            return false
        }
    } else {
        if (mintAuthorityAddress == null && freezeAuthorityAddress == null)
            return false
        else
            return true
    }
}