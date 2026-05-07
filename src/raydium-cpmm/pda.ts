import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { PublicKey } from "@solana/web3.js";

const AMM_CONFIG_SEED = Buffer.from(
  utf8.encode("amm_config")
);
const POOL_SEED = Buffer.from(utf8.encode("pool"));
const POOL_VAULT_SEED = Buffer.from(
  utf8.encode("pool_vault")
);
const POOL_AUTH_SEED = Buffer.from(
  utf8.encode("vault_and_lp_mint_auth_seed")
);
const POOL_LPMINT_SEED = Buffer.from(
  utf8.encode("pool_lp_mint")
);
const TICK_ARRAY_SEED = Buffer.from(
  utf8.encode("tick_array")
);

const OPERATION_SEED = Buffer.from(
  utf8.encode("operation")
);

const ORACLE_SEED = Buffer.from(
  utf8.encode("observation")
);

function u16ToBytes(num: number) {
  const arr = new ArrayBuffer(2);
  const view = new DataView(arr);
  view.setUint16(0, num, false);
  return new Uint8Array(arr);
}

function i16ToBytes(num: number) {
  const arr = new ArrayBuffer(2);
  const view = new DataView(arr);
  view.setInt16(0, num, false);
  return new Uint8Array(arr);
}

function u32ToBytes(num: number) {
  const arr = new ArrayBuffer(4);
  const view = new DataView(arr);
  view.setUint32(0, num, false);
  return new Uint8Array(arr);
}

function i32ToBytes(num: number) {
  const arr = new ArrayBuffer(4);
  const view = new DataView(arr);
  view.setInt32(0, num, false);
  return new Uint8Array(arr);
}

async function getAmmConfigAddress(index: number, programId: PublicKey) {
  const [address, bump] = await PublicKey.findProgramAddress(
    [AMM_CONFIG_SEED, u16ToBytes(index)],
    programId
  );
  return [address, bump];
}

async function getAuthAddress(programId: PublicKey) {
  const [address, bump] = await PublicKey.findProgramAddress(
    [POOL_AUTH_SEED],
    programId
  );
  return [address, bump];
}

async function getPoolAddress(ammConfig: PublicKey, tokenMint0: PublicKey, tokenMint1: PublicKey, programId: PublicKey) {
  const [address, bump] = await PublicKey.findProgramAddress(
    [
      POOL_SEED,
      ammConfig.toBuffer(),
      tokenMint0.toBuffer(),
      tokenMint1.toBuffer(),
    ],
    programId
  );
  return [address, bump];
}

async function getPoolVaultAddress(pool: PublicKey, vaultTokenMint: PublicKey, programId: PublicKey) {
  const [address, bump] = await PublicKey.findProgramAddress(
    [POOL_VAULT_SEED, pool.toBuffer(), vaultTokenMint.toBuffer()],
    programId
  );
  return [address, bump];
}

async function getPoolLpMintAddress(pool: PublicKey, programId: PublicKey) {
  const [address, bump] = await PublicKey.findProgramAddress(
    [POOL_LPMINT_SEED, pool.toBuffer()],
    programId
  );
  return [address, bump];
}

async function getOrcleAccountAddress(pool: PublicKey, programId: PublicKey) {
  const [address, bump] = await PublicKey.findProgramAddress(
    [ORACLE_SEED, pool.toBuffer()],
    programId
  );
  return [address, bump];
}

export {
  AMM_CONFIG_SEED,
  POOL_SEED,
  POOL_VAULT_SEED,
  POOL_AUTH_SEED,
  POOL_LPMINT_SEED,
  TICK_ARRAY_SEED,
  OPERATION_SEED,
  ORACLE_SEED,
  u16ToBytes,
  i16ToBytes,
  u32ToBytes,
  i32ToBytes,
  getAmmConfigAddress,
  getAuthAddress,
  getPoolAddress,
  getPoolVaultAddress,
  getPoolLpMintAddress,
  getOrcleAccountAddress
};