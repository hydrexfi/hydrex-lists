---
name: hydropump-audit
description: Audits st0x and Coinbase equity tokens in src/tokens/8453.ts for Hydropump eligibility (accurate onchain pricing vs the real stock, >= $5K hard-asset liquidity) and sets isHydropumpPair / hydropumpClassification on qualifying tokens. Use when the user asks to audit, refresh, or add Hydropump pairs, or to check equity token pricing/liquidity.
disable-model-invocation: true
---

# Hydropump Audit

Runs `scripts/auditHydropump.ts` to decide which equity tokens qualify as Hydropump pairs, then updates `src/tokens/8453.ts`. Tokens that don't qualify are left unchanged. Tokens already flagged `isHydropumpPair: true` are never modified or un-flagged.

## Criteria (all must pass)

1. **Equity type**: `isEquity: true` and the `symbol` starts with lowercase `wt` (st0x) or ends with lowercase `c` (Coinbase).
2. **Accurate pricing**: the USD price in the deepest qualifying hard-asset pool is within **5%** of the market stock price (TradingView, Yahoo Finance fallback). The script compares against the regular-session price and the latest pre/post-market price, and uses whichever is closer.
3. **Liquidity**: at least one **single** pool on **any dex** pairs the token with a hard asset and has **>= $5,000** liquidity. Liquidity is not summed across pools.

Pools are discovered via DexScreener and GeckoTerminal. Pools that are standalone contracts (Uniswap v2/v3, Aerodrome, Algebra, etc.) are then re-valued over Base RPC from their actual token balances and spot price (`slot0`/`globalState`/`getReserves`), with the equity side valued at the stock price. Output marks these `(onchain)`. Uniswap v4 pools live inside a shared PoolManager contract, so they keep indexer figures, marked `(indexer)`. When both indexers list a v4 pool, the lower figure is used.

GeckoTerminal is sometimes stale (e.g. reporting $0 for a pool holding ~$4K). Lines like `indexer reported $X, onchain balances are $Y` flag this; trust the onchain figure.

Hard assets: USDC, USDbC, USDT, DAI, USDS, WETH, native ETH, cbETH, wstETH, cbBTC, WBTC (see `HARD_ASSETS` in the script).

The script also checks every candidate over Base RPC (`symbol`, `decimals`, `totalSupply` via multicall). A token fails if the contract doesn't respond, its decimals don't match the list, or its supply is 0.

## Classification

| Symbol pattern | `hydropumpClassification` |
|---|---|
| `wt*` | `st0x` |
| `*c` | `coinbase_stock` |

Ticker is derived by stripping the prefix/suffix (`wtAAPL` / `AAPLc` → `AAPL`). Add entries to `TICKER_OVERRIDES` in the script when that doesn't produce the real ticker.

## Workflow

```
- [ ] 1. Dry run with a report
- [ ] 2. Review results with the user
- [ ] 3. Apply the reviewed report
- [ ] 4. Verify the diff
```

**1. Dry run** (takes several minutes because of the per-host throttling; run it in the background or with a long timeout, and with full network access):

```bash
npm run audit-hydropump -- --dry-run --report /tmp/hydropump-audit.json
```

**2. Review**: summarize the PASS tokens (onchain vs market price, deviation, pool and liquidity) and group the FAIL reasons. Call out:
- Any lines under `Already flagged but currently failing` (requires `--recheck`). These are left unchanged; the user decides whether to remove the flags.
- `warning: DexScreener unavailable` / `GeckoTerminal unavailable` lines. If an indexer was down, a token near the cutoff could fail only because of missing data, so recommend a re-run before treating that FAIL as final.
- `onchain symbol ... != list` warnings (data-quality issues in the list).

**3. Apply** the reviewed results without re-fetching:

```bash
npm run audit-hydropump -- --apply-report /tmp/hydropump-audit.json
```

`--apply-report` only writes tokens that are still unflagged and whose classification still matches. Alternatively, run without `--dry-run` to audit and write in one step.

**4. Verify**: run `git diff src/tokens/8453.ts`. Each updated token should gain exactly these two lines before its closing `},`:

```ts
    isHydropumpPair: true,
    hydropumpClassification: "coinbase_stock",
```

## Options

| Flag | Effect |
|---|---|
| `--dry-run` | Audit only; no file changes |
| `--symbols wtAMAT,AMDc` | Limit to specific symbols |
| `--recheck` | Also audit already-flagged tokens (reported, never modified) |
| `--report <path>` | Write the full JSON results |
| `--apply-report <path>` | Apply qualifying tokens from a previous report |

`BASE_RPC_URL` env var overrides the default public Base RPC (`https://mainnet.base.org`).

## Rate limits and retries

Built into the script; adjust the constants at the top if a provider changes its limits:
- Per-host minimum spacing between requests (`HOST_MIN_INTERVAL_MS`): GeckoTerminal 6s, DexScreener 300ms, Base RPC 1s between multicalls. Each multicall chunk is sent as a single `eth_call`. viem doesn't raise rate-limit errors for individual calls inside a multicall when failures are allowed, so the script rethrows any HTTP 429 or transport failure to trigger a retry.
- Exponential backoff with jitter on 429/5xx/timeouts/network errors, honoring `Retry-After`, up to 6 attempts, capped at 60s per wait. Rate-limit (429) backoff starts at twice the normal delay.
- If a host stays unreachable after its retries (for example a DNS/TLS failure), it is skipped for the rest of the run and the other indexer is used.

## Thresholds

`MAX_PRICE_DEVIATION` (0.05) and `MIN_LIQUIDITY_USD` (5000) are constants at the top of `scripts/auditHydropump.ts`. Change them there if the criteria change.
