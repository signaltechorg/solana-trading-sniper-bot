import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { retrieveEnvVariable } from "../utils/utils";
import { raydiumCpSwap } from "../raydium-cpmm/idl/raydiumcpmm";
import Raydiumcpmm from "../raydium-cpmm/idl/raydiumcpmm.json";
import { Connection, Keypair } from "@solana/web3.js";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import log from "@winstonts/winston2"
import dotenv from 'dotenv';

dotenv.config();

export const PRIVATE_KEY = process.env.PRIVATE_KEY || ""
export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT')
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT')

export const BUY_AMOUNT = Number(retrieveEnvVariable('BUY_AMOUNT'));

export const DELAY = Number(retrieveEnvVariable('DELAY'));

export const MIN_LIQUIDITY_SOL = Number(retrieveEnvVariable('MIN_LIQUIDITY_SOL'));

export const TP_LEVELS_PCT1 = process.env.TP_LEVELS_PCT1
export const TP_LEVELS_PCT2= process.env.TP_LEVELS_PCT2
export const TP_LEVELS_PCT3 = process.env.TP_LEVELS_PCT3

export const TP_SIZE_PCT1 = process.env.TP_SIZE_PCT1
export const TP_SIZE_PCT2 = process.env.TP_SIZE_PCT2
export const TP_SIZE_PCT3 = process.env.TP_SIZE_PCT3
export const TRAIL_DISTANCE_PCT = Number(retrieveEnvVariable('TRAIL_DISTANCE_PCT'));
export const HARD_STOP_LOSS_PCT = Number(retrieveEnvVariable('HARD_STOP_LOSS_PCT'));
export const WSOL_AMOUNT = Number(process.env.WSOL_AMOUNT) || 0

export const MAX_SELL_TAX_PCT = Number(retrieveEnvVariable('MAX_SELL_TAX_PCT'));
export const MAX_DEV_WALLET_SUPPLY_PCT = Number(retrieveEnvVariable('MAX_DEV_WALLET_SUPPLY_PCT'));

export const REQUIRE_REVOKED_UPGRADE_AUTHORITY = retrieveEnvVariable('REQUIRE_REVOKED_UPGRADE_AUTHORITY');

export const solanaConnection = new Connection(RPC_ENDPOINT, {
    wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
    commitment: 'confirmed'
});

export const provider = new AnchorProvider(solanaConnection, new NodeWallet(Keypair.generate()));

export const RaydiumCpmmProgram = new Program<raydiumCpSwap>(Raydiumcpmm as raydiumCpSwap, provider);

export const RAYDIUM_CPMM_PROGRAM_ID = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"

export const buyerKp = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
log.info("🚀 ~ buyerKp:", buyerKp.publicKey.toBase58())

export const Psol_Address = "pSoL47GE52V2bgUUyQvs9LSdWQZsokarp2yNsWQaLYy";

export const limitCount = 50

export const JITO_FEE = Number(retrieveEnvVariable('JITO_FEE'));