# Architecture

## Overview

The Raydium CPMM Sniper Bot uses a **decoupled event pipeline** so detection, queuing, and execution can scale independently.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SOLANA TRADING SNIPER BOT                        │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │   Listener   │────▶│    Redis     │────▶│   Consumer   │────▶│  Processor   │
  │  (onLogs WS) │     │    Queue     │     │   (BRPOP)    │     │ (buy/sell)   │
  └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
        │                      │                    │                    │
        │                      │                    │                    ▼
        │                      │                    │            ┌──────────────┐
        │                      ▼                    │            │ Risk Checks  │
        │               ┌──────────────┐            │            │ • liquidity  │
        │               │   Dedupe     │            │            │ • tax/fees   │
        │               │  (SET NX)    │            │            │ • authority  │
        │               └──────────────┘            │            └──────────────┘
        │                                           │                    │
        ▼                                           ▼                    ▼
  Raydium CPMM                              Non-blocking            Jito bundles
  Program Logs                               execution              TP / SL / Trail
```

## Modules

| Module | Path | Responsibility |
|--------|------|----------------|
| **Entry** | `src/index.ts` | Boot Redis, start listener + consumer, graceful shutdown |
| **Listener** | `src/listener/cpmm-listener.ts` | Subscribe to Raydium CPMM `initialize` logs |
| **Queue** | `src/queue/pool-queue.ts` | LPUSH pool events, BRPOP consumer, signature dedupe |
| **Redis** | `src/redis/` | `ioredis-xyz` client, key namespaces |
| **Processor** | `src/processor/pool-processor.ts` | Delegate to trade logic after dequeue |
| **Trade logic** | `src/utils/utils.ts` | Parse tx, risk checks, buy, TP/SL/trailing sells |
| **DEX** | `src/raydium-cpmm/` | CPMM swap instructions, pool info, PDA helpers |
| **Jito** | `src/utils/jito.ts` | Bundle submission with tip |
| **Config** | `src/constants/` | Env loading, RPC connection, wallet |
| **Validate** | `src/validate.ts` | Dry-run pipeline check (no live trades) |

## Event Flow

1. **Detect** — WebSocket `onLogs` fires when Raydium CPMM pool `initialize` instruction appears.
2. **Enqueue** — Listener pushes a `PoolCreationEvent` to Redis (`LPUSH`), with dedupe via `SET NX` on signature.
3. **Consume** — Background consumer `BRPOP`s events and hands them to the processor (non-blocking listener).
4. **Process** — `parseTransaction` fetches tx, validates liquidity/tax/authority, buys via CPMM, monitors PnL.
5. **Exit** — Multi-tier take-profit, trailing stop, or hard stop-loss triggers sells (optionally via Jito).

## Redis Keys

| Key | Type | Purpose |
|-----|------|---------|
| `sniper:pool-events` | List | Pending pool creation events |
| `sniper:processed:{sig}` | String (TTL) | Dedupe processed signatures (24h default) |
| `sniper:stats:detected` | Counter | Total pools detected (optional telemetry) |

## Configuration Layers

```
.env
 ├── RPC_ENDPOINT / RPC_WEBSOCKET_ENDPOINT   # Solana connectivity
 ├── PRIVATE_KEY                             # Signing wallet
 ├── REDIS_URL                               # Queue backend
 ├── BUY_AMOUNT / WSOL_AMOUNT / DELAY        # Trade sizing & polling
 ├── MIN_LIQUIDITY_SOL                       # Entry filter
 ├── TP_LEVELS_* / TP_SIZE_*                 # Take-profit ladder
 ├── TRAIL_DISTANCE_PCT / HARD_STOP_LOSS_PCT # Exit strategy
 └── JITO_FEE                                  # Bundle tip
```

## Design Principles

- **Non-blocking listener** — Detection never waits on buy/sell RPC calls.
- **At-least-once delivery** — Redis queue survives brief process restarts; dedupe prevents double-buys.
- **Fail-safe defaults** — Missing env vars exit early with clear errors.
- **Graceful shutdown** — SIGINT/SIGTERM drains listener and closes Redis.

## Support

Questions or custom setups: **[SnipMaxi on Telegram](https://t.me/snipmaxi)**
