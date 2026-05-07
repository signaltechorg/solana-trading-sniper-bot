import { getAssociatedTokenAddressSync, NATIVE_MINT } from "@solana/spl-token";
import { getAuthAddress, getOrcleAccountAddress, getPoolAddress, getPoolVaultAddress } from "./pda";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import idl from "./idl/raydiumcpmm.json";
import { raydiumCpSwap } from "./idl/raydiumcpmm";
import { BN } from "bn.js";
import { solanaConnection } from "../constants";

const privateKey = Keypair.generate();
const wallet = new NodeWallet(privateKey);
const provider = new AnchorProvider(solanaConnection, wallet, {});
setProvider(provider);

export const program = new Program(idl as raydiumCpSwap);
const configAddress = new PublicKey("2fGXL8uhqxJ4tpgtosHZXT4zcQap6j62z3bMDxdkMvy5");


// Pool state data structure based on IDL
interface PoolStateData {
  ammConfig: PublicKey;
  poolCreator: PublicKey;
  token0Vault: PublicKey;
  token1Vault: PublicKey;
  lpMint: PublicKey;
  token0Mint: PublicKey;
  token1Mint: PublicKey;
  token0Program: PublicKey;
  token1Program: PublicKey;
  observationKey: PublicKey;
  authBump: number;
  status: number;
  lpMintDecimals: number;
  mint0Decimals: number;
  mint1Decimals: number;
  lpSupply: bigint;
  protocolFeesToken0: bigint;
  protocolFeesToken1: bigint;
  fundFeesToken0: bigint;
  fundFeesToken1: bigint;
  openTime: bigint;
  recentEpoch: bigint;
}

// Price calculation result
interface TokenPrice {
  token0Mint: string;
  token1Mint: string;
  token0Reserve: number;
  token1Reserve: number;
  price: number;
  priceInverted: number;
  poolAddress: string;
  status: number;
}

// Parse pool state data from account info
const parsePoolState = (data: Buffer): PoolStateData => {
  let offset = 8; // Skip discriminator

  const ammConfig = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const poolCreator = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const token0Vault = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const token1Vault = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const lpMint = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const token0Mint = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const token1Mint = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const token0Program = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const token1Program = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const observationKey = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const authBump = data.readUInt8(offset);
  offset += 1;

  const status = data.readUInt8(offset);
  offset += 1;

  const lpMintDecimals = data.readUInt8(offset);
  offset += 1;

  const mint0Decimals = data.readUInt8(offset);
  offset += 1;

  const mint1Decimals = data.readUInt8(offset);
  offset += 1;

  // // Skip padding (3 bytes)
  // offset += 3;

  const lpSupply = data.readBigUInt64LE(offset);
  offset += 8;

  const protocolFeesToken0 = data.readBigUInt64LE(offset);
  offset += 8;

  const protocolFeesToken1 = data.readBigUInt64LE(offset);
  offset += 8;

  const fundFeesToken0 = data.readBigUInt64LE(offset);
  offset += 8;

  const fundFeesToken1 = data.readBigUInt64LE(offset);
  offset += 8;

  const openTime = data.readBigUInt64LE(offset);
  offset += 8;

  const recentEpoch = data.readBigUInt64LE(offset);

  return {
    ammConfig,
    poolCreator,
    token0Vault,
    token1Vault,
    lpMint,
    token0Mint,
    token1Mint,
    token0Program,
    token1Program,
    observationKey,
    authBump,
    status,
    lpMintDecimals,
    mint0Decimals,
    mint1Decimals,
    lpSupply,
    protocolFeesToken0,
    protocolFeesToken1,
    fundFeesToken0,
    fundFeesToken1,
    openTime,
    recentEpoch
  };
};

export const getTokenAmount = async (ata: PublicKey): Promise<string> => {
  try {
    const balance = await solanaConnection.getTokenAccountBalance(ata);
    return balance.value.uiAmount?.toString() || '0';
  } catch (err) {
    console.log("getTokenAmount error ==> ", err)
    return '0';
  }
}

// Get token price from pool state
export const getTokenPriceFromPool = async (poolAddress: PublicKey): Promise<TokenPrice | null> => {
  // console.log("🚀 ~ getTokenPriceFromPool ~ poolAddress:", poolAddress)
  try {
    // Get pool state account
    const poolStateAccount = await solanaConnection.getAccountInfo(poolAddress);
    if (!poolStateAccount) {
      throw new Error("Pool state not found");
    }

    // Parse pool state data
    const poolState = parsePoolState(poolStateAccount.data);

    // Parse token account data to get balances
    const token0Balance = await getTokenAmount(poolState.token0Vault);
    const token1Balance = await getTokenAmount(poolState.token1Vault);

    // Convert to numbers with proper decimals
    const token0Reserve = Number(token0Balance) / Math.pow(10, poolState.mint0Decimals);
    const token1Reserve = Number(token1Balance) / Math.pow(10, poolState.mint1Decimals);

    // Calculate price (token1 per token0)
    const price = token1Reserve / token0Reserve;
    const priceInverted = token0Reserve / token1Reserve;

    return {
      token0Mint: poolState.token0Mint.toString(),
      token1Mint: poolState.token1Mint.toString(),
      token0Reserve,
      token1Reserve,
      price,
      priceInverted,
      poolAddress: poolAddress.toString(),
      status: poolState.status
    };
  } catch (error) {
    console.error("Error getting token price from pool");
    return null;
  }
};

// Get token price by mint addresses
export const getTokenPrice = async (token0Mint: PublicKey, token1Mint: PublicKey): Promise<TokenPrice | null> => {
  try {
    // Get pool address
    const [poolAddress] = await getPoolAddress(
      configAddress,
      token0Mint,
      token1Mint,
      new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C")
    );

    return await getTokenPriceFromPool(poolAddress as PublicKey);
  } catch (error) {
    console.error("Error getting token price");
    return null;
  }
};

// Get token price in SOL (useful for most tokens)
export const getTokenPriceInSol = async (poolId: PublicKey): Promise<number> => {
  try {
    // const priceData = await getTokenPrice(NATIVE_MINT, tokenMint);
    const priceData = await getTokenPriceFromPool(poolId as PublicKey);
    if (!priceData) {
      // Try reverse order
      // const reversePriceData = await getTokenPrice(tokenMint, NATIVE_MINT);
      const reversePriceData = await getTokenPriceFromPool(poolId as PublicKey);
      if (!reversePriceData) return 0;
      return reversePriceData.price;
    }
    return priceData.priceInverted;
  } catch (error) {
    console.error("Error getting token price in SOL");
    return 0;
  }
};

// Get token price in USD (requires SOL/USD price)
export const getTokenPriceInUSD = async (poolId: PublicKey, solUsdPrice: number = 0): Promise<number | null> => {
  try {
    const tokenPriceInSol = await getTokenPriceInSol(poolId);
    if (!tokenPriceInSol || solUsdPrice === 0) return null;
    return tokenPriceInSol * solUsdPrice;
  } catch (error) {
    console.error("Error getting token price in USD");
    return null;
  }
};

// Get detailed price information
export const getDetailedTokenPrice = async (token0Mint: PublicKey, token1Mint: PublicKey) => {
  try {
    const priceData = await getTokenPrice(token0Mint, token1Mint);
    if (!priceData) return null;

    // Calculate additional metrics
    const totalLiquidity = priceData.token0Reserve * priceData.price + priceData.token1Reserve;
    const volume24h = 0; // Would need to track historical data
    const priceChange24h = 0; // Would need to track historical data

    return {
      ...priceData,
      totalLiquidity,
      volume24h,
      priceChange24h,
      priceChangePercent24h: 0,
      marketCap: priceData.token0Reserve * priceData.price,
      fullyDilutedMarketCap: priceData.token0Reserve * priceData.price,
      circulatingSupply: priceData.token0Reserve,
      totalSupply: priceData.token0Reserve,
      maxSupply: null,
      ath: null,
      athChangePercent: null,
      atl: null,
      atlChangePercent: null,
      sparklineIn7d: null
    };
  } catch (error) {
    console.error("Error getting detailed token price");
    return null;
  }
};

// Get multiple token prices at once
export const getMultipleTokenPrices = async (tokenPairs: Array<{ token0: PublicKey, token1: PublicKey }>) => {
  try {
    const pricePromises = tokenPairs.map(pair =>
      getTokenPrice(pair.token0, pair.token1)
    );

    const prices = await Promise.all(pricePromises);
    return prices.filter(price => price !== null);
  } catch (error) {
    console.error("Error getting multiple token prices");
    return [];
  }
};

// Get price impact for a swap
export const getPriceImpact = async (
  token0Mint: PublicKey,
  token1Mint: PublicKey,
  amountIn: number
): Promise<number | null> => {
  try {
    const priceData = await getTokenPrice(token0Mint, token1Mint);
    if (!priceData) return null;

    // Calculate price impact using constant product formula
    const k = priceData.token0Reserve * priceData.token1Reserve;
    const newToken0Reserve = priceData.token0Reserve + amountIn;
    const newToken1Reserve = k / newToken0Reserve;
    const amountOut = priceData.token1Reserve - newToken1Reserve;

    const priceBefore = priceData.price;
    const priceAfter = newToken1Reserve / newToken0Reserve;
    const priceImpact = ((priceBefore - priceAfter) / priceBefore) * 100;

    return Math.abs(priceImpact);
  } catch (error) {
    console.error("Error calculating price impact");
    return null;
  }
};

// Get optimal swap amount (for best price)
export const getOptimalSwapAmount = async (
  token0Mint: PublicKey,
  token1Mint: PublicKey,
  maxAmountIn: number
): Promise<{ amountIn: number, amountOut: number, priceImpact: number } | null> => {
  try {
    const priceData = await getTokenPrice(token0Mint, token1Mint);
    if (!priceData) return null;

    // For small amounts, price impact is minimal
    // For larger amounts, we might want to split the swap
    const k = priceData.token0Reserve * priceData.token1Reserve;
    const newToken0Reserve = priceData.token0Reserve + maxAmountIn;
    const newToken1Reserve = k / newToken0Reserve;
    const amountOut = priceData.token1Reserve - newToken1Reserve;

    const priceImpact = await getPriceImpact(token0Mint, token1Mint, maxAmountIn);

    return {
      amountIn: maxAmountIn,
      amountOut: amountOut || 0,
      priceImpact: priceImpact || 0
    };
  } catch (error) {
    console.error("Error calculating optimal swap amount");
    return null;
  }
};

// Get pool info with detailed data
export const getPoolInfo = async (poolAddress: PublicKey) => {
  try {
    const poolStateAccount = await solanaConnection.getAccountInfo(poolAddress);
    if (!poolStateAccount) {
      throw new Error("Pool state not found");
    }

    const poolState = parsePoolState(poolStateAccount.data);
    const priceData = await getTokenPriceFromPool(poolAddress);

    return {
      poolAddress: poolAddress.toString(),
      poolState,
      priceData,
      isActive: (poolState.status & 4) === 0, // Check if swaps are enabled
      isDepositEnabled: (poolState.status & 1) === 0,
      isWithdrawEnabled: (poolState.status & 2) === 0,
      open_time: poolState.openTime
    };
  } catch (error) {
    console.error("Error getting pool info");
    return null;
  }
};

export const swapBaseOutput = async (
  owner: Keypair,
  poolAddress: PublicKey,
  ammConfig: PublicKey,
  inputToken: PublicKey,
  inputTokenProgram: PublicKey,
  outputToken: PublicKey,
  outputTokenProgram: PublicKey,
  amount_in: number,
  outputTokenAccount: PublicKey
) => {
  // Get pool state to read actual vault addresses
  const poolStateAccount = await solanaConnection.getAccountInfo(poolAddress);
  if (!poolStateAccount) {
    throw new Error("Pool state not found");
  }
  const poolState = parsePoolState(poolStateAccount.data);

  // Determine which vault corresponds to input and output tokens
  let inputVault: PublicKey;
  let outputVault: PublicKey;
  
  if (poolState.token0Mint.equals(inputToken)) {
    inputVault = poolState.token0Vault;
    outputVault = poolState.token1Vault;
  } else if (poolState.token1Mint.equals(inputToken)) {
    inputVault = poolState.token1Vault;
    outputVault = poolState.token0Vault;
  } else {
    // Fallback to derived addresses if tokens don't match pool state
    const [derivedInputVault] = await getPoolVaultAddress(
      poolAddress,
      inputToken,
      program.programId
    );
    const [derivedOutputVault] = await getPoolVaultAddress(
      poolAddress,
      outputToken,
      program.programId
    );
    inputVault = derivedInputVault as PublicKey;
    outputVault = derivedOutputVault as PublicKey;
  }

  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputToken,
    owner.publicKey,
    false,
    inputTokenProgram
  );
  const [observationAddress] = await getOrcleAccountAddress(
    poolAddress,
    program.programId
  );
  const [authority] = await getAuthAddress(program.programId);

  const ix = await program.methods
    .swapBaseOutput(new BN(1_000_000_000_000), new BN(amount_in))
    .accountsPartial({
      payer: owner.publicKey,
      authority: authority as PublicKey,
      ammConfig: ammConfig,
      poolState: poolAddress as PublicKey,
      inputTokenAccount,
      outputTokenAccount,
      inputVault: inputVault as PublicKey,
      outputVault: outputVault as PublicKey,
      inputTokenProgram: inputTokenProgram,
      outputTokenProgram: outputTokenProgram,
      inputTokenMint: inputToken,
      outputTokenMint: outputToken,
      observationState: observationAddress as PublicKey,
    })
    .instruction()

  return ix;
}

export const swapBaseInput = async (
  owner: Keypair,
  poolAddress: PublicKey,
  ammConfig: PublicKey,
  inputToken: PublicKey,
  inputTokenProgram: PublicKey,
  outputToken: PublicKey,
  outputTokenProgram: PublicKey,
  amount_in: number,
  outputTokenAccount: PublicKey
) => {
  // Get pool state to read actual vault addresses
  const poolStateAccount = await solanaConnection.getAccountInfo(poolAddress);
  if (!poolStateAccount) {
    throw new Error("Pool state not found");
  }
  const poolState = parsePoolState(poolStateAccount.data);

  // Determine which vault corresponds to input and output tokens
  // Note: In swapBaseInput, inputToken is what we're selling (outputToken in the swap direction)
  // and outputToken is what we're buying (inputToken in the swap direction)
  let inputVault: PublicKey;
  let outputVault: PublicKey;
  
  if (poolState.token0Mint.equals(outputToken)) {
    // We're buying token0, so outputVault is token0Vault
    outputVault = poolState.token0Vault;
    inputVault = poolState.token1Vault;
  } else if (poolState.token1Mint.equals(outputToken)) {
    // We're buying token1, so outputVault is token1Vault
    outputVault = poolState.token1Vault;
    inputVault = poolState.token0Vault;
  } else {
    // Fallback to derived addresses if tokens don't match pool state
    const [derivedInputVault] = await getPoolVaultAddress(
      poolAddress,
      inputToken,
      program.programId
    );
    const [derivedOutputVault] = await getPoolVaultAddress(
      poolAddress,
      outputToken,
      program.programId
    );
    inputVault = derivedInputVault as PublicKey;
    outputVault = derivedOutputVault as PublicKey;
  }

  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputToken,
    owner.publicKey,
    false,
    inputTokenProgram
  );
  const [observationAddress] = await getOrcleAccountAddress(
    poolAddress,
    program.programId
  );
  const [authority] = await getAuthAddress(program.programId);

  const ix = await program.methods
    .swapBaseInput(new BN(amount_in), new BN(0))
    .accountsPartial({
      payer: owner.publicKey,
      authority: authority as PublicKey,
      ammConfig: ammConfig,
      poolState: poolAddress as PublicKey,
      inputTokenAccount: outputTokenAccount,
      outputTokenAccount: inputTokenAccount,
      inputVault: outputVault  as PublicKey,
      outputVault: inputVault as PublicKey,
      inputTokenProgram: outputTokenProgram,
      outputTokenProgram: inputTokenProgram,
      inputTokenMint: outputToken,
      outputTokenMint: inputToken,
      observationState: observationAddress as PublicKey,
    })
    .instruction()

  return ix;
}
