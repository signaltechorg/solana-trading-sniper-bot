# Solana Sniper Bot for Raydium

TypeScript bot that listens for new Raydium CPMM pool initialization events on Solana and can execute buy/sell logic with risk checks.

## Features

- Subscribes to Raydium CPMM program logs in real time.
- Detects new pool initialization transactions.
- Applies checks before trading (liquidity threshold, token tax, authority checks).
- Supports take-profit, trailing logic, and hard stop-loss logic.
- Includes Jito bundle tip support.

## Requirements

- Node.js 18+
- Yarn or npm
- Solana mainnet RPC endpoint + websocket endpoint
- Funded wallet private key (base58)

## Install

```bash
yarn install
```

or

```bash
npm install
```

## Environment Setup

Create a `.env` file in project root.

Example:

```env
RPC_ENDPOINT=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
RPC_WEBSOCKET_ENDPOINT=wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY
PRIVATE_KEY=YOUR_BASE58_SECRET_KEY

BUY_AMOUNT=0.00001
WSOL_AMOUNT=0.00001
DELAY=2000
MIN_LIQUIDITY_SOL=100

MAX_DEV_WALLET_SUPPLY_PCT=20
MAX_SELL_TAX_PCT=10
REQUIRE_REVOKED_UPGRADE_AUTHORITY=true

TP_LEVELS_PCT1=25
TP_LEVELS_PCT2=50
TP_LEVELS_PCT3=100

TP_SIZE_PCT1=0.3
TP_SIZE_PCT2=0.4
TP_SIZE_PCT3=0.3

TRAIL_DISTANCE_PCT=10
HARD_STOP_LOSS_PCT=-25

JITO_FEE=0.0001
```

## Env Variable Reference

- `RPC_ENDPOINT`: HTTP Solana RPC URL.
- `RPC_WEBSOCKET_ENDPOINT`: WS Solana RPC URL for log subscriptions.
- `PRIVATE_KEY`: Base58 private key used for transaction signing.
- `BUY_AMOUNT`: Buy sizing input used in trade logic.
- `WSOL_AMOUNT`: SOL amount wrapped to WSOL for swap transfer.
- `DELAY`: Milliseconds between sell-condition checks.
- `MIN_LIQUIDITY_SOL`: Minimum detected liquidity required before trading.
- `MAX_DEV_WALLET_SUPPLY_PCT`: Max allowed creator wallet supply percent.
- `MAX_SELL_TAX_PCT`: Max allowed transfer fee/tax percent for Token-2022 checks.
- `REQUIRE_REVOKED_UPGRADE_AUTHORITY`: Enables authority revocation check logic.
- `TP_LEVELS_PCT1..3`: Profit percentage thresholds for multi-step TP.
- `TP_SIZE_PCT1..3`: Portion to sell at each TP threshold.
- `TRAIL_DISTANCE_PCT`: Trailing distance logic threshold.
- `HARD_STOP_LOSS_PCT`: Loss threshold where full exit is triggered.
- `JITO_FEE`: Tip amount used in Jito bundle transaction flow.

## Run

Start sniper listener:

```bash
yarn start
```

Build:

```bash
yarn build
```

Run test helper:

```bash
yarn test
```

## Project Structure

- `src/index.ts`: Main runtime entrypoint (listener startup).
- `src/utils/utils.ts`: Transaction parsing, checks, strategy execution.
- `src/utils/jito.ts`: Jito bundle + tip submission flow.
- `src/constants/constants.ts`: Env loading and runtime constants.
- `src/raydium-cpmm/`: Raydium CPMM interaction helpers.

## Notes

- Never commit your real `.env` or wallet key.
- Keep `node_modules/` out of git.
- Use a dedicated low-balance wallet for bot operation.
- Test with small size settings first.

## Troubleshooting

- If startup exits immediately, verify all required env keys are set.
- If no events are detected, verify RPC websocket endpoint supports logs.
- If buys fail, check wallet SOL balance and token account creation fees.
- If sells do not trigger, review TP/SL numbers and ensure they are numeric.

