/// <reference types="node" />
/**
 * Hydropump Eligibility Audit
 *
 * Usage:
 *   npm run audit-hydropump                          # audit + update src/tokens/8453.ts
 *   npm run audit-hydropump -- --dry-run             # audit only, no file changes
 *   npm run audit-hydropump -- --symbols wtAMAT,AMDc # audit a subset
 *   npm run audit-hydropump -- --recheck             # also report on tokens already flagged (never modified)
 *   npm run audit-hydropump -- --report audit.json   # write full JSON report
 *   npm run audit-hydropump -- --apply-report audit.json  # apply a reviewed dry-run report without re-auditing
 *
 * Env:
 *   BASE_RPC_URL  Optional Base RPC endpoint (defaults to the public https://mainnet.base.org)
 *
 * Criteria (all must pass):
 *   1. st0x (symbol starts with "wt") or Coinbase (symbol ends with "c") equity with isEquity: true
 *   2. Onchain price of the deepest hard-asset pool is within MAX_PRICE_DEVIATION of the market stock price
 *   3. At least one pool on any dex pairs the token with a hard asset and has >= MIN_LIQUIDITY_USD liquidity
 *
 * Pools are discovered via DexScreener + GeckoTerminal. Pools that are standalone contracts are then re-valued
 * from their onchain balances and spot price over Base RPC; Uniswap v4 pools keep indexer figures.
 *
 * Qualifying tokens get `isHydropumpPair: true` and `hydropumpClassification` set.
 * Tokens that do not qualify are left unchanged.
 */

import { createPublicClient, http, erc20Abi, getAddress, parseAbi } from "viem";
import { base } from "viem/chains";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { Token } from "../src/types";

const MAX_PRICE_DEVIATION = 0.05;
const MIN_LIQUIDITY_USD = 5_000;

const MAX_RETRIES = 6;
const RETRY_DELAY_BASE_MS = 2_000;
const MAX_RETRY_DELAY_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

// Minimum spacing between requests per host, kept under each provider's documented free-tier limit
const HOST_MIN_INTERVAL_MS: Record<string, number> = {
  "api.geckoterminal.com": 6_000, // public API returns 429s well below its advertised 30 req/min
  "api.dexscreener.com": 300, // 300 req/min
  "scanner.tradingview.com": 1_000,
  "query1.finance.yahoo.com": 750,
  rpc: 1_000, // public Base RPC is aggressively rate limited
};

const RPC_MULTICALL_CHUNK = 60;
const GECKOTERMINAL_MAX_PAGES = 3;

const TOKENS_FILE = resolve(__dirname, "../src/tokens/8453.ts");

type HydropumpClassification = NonNullable<Token["hydropumpClassification"]>;

// Lowercased Base addresses treated as "hard assets" for the liquidity requirement
const HARD_ASSETS: Record<string, { symbol: string; decimals: number; stable?: boolean }> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6, stable: true },
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": { symbol: "USDbC", decimals: 6, stable: true },
  "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": { symbol: "USDT", decimals: 6, stable: true },
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": { symbol: "DAI", decimals: 18, stable: true },
  "0x820c137fa70c8691f0e44dc420a5e53c168921dc": { symbol: "USDS", decimals: 18, stable: true },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "0x0000000000000000000000000000000000000000": { symbol: "ETH", decimals: 18 },
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": { symbol: "ETH", decimals: 18 },
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": { symbol: "cbETH", decimals: 18 },
  "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452": { symbol: "wstETH", decimals: 18 },
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": { symbol: "cbBTC", decimals: 8 },
  "0x0555e30da8f98308edb960aa94c0db47230d2b9c": { symbol: "WBTC", decimals: 8 },
};

// Use when a token's stock ticker can't be derived by stripping the "wt" prefix / "c" suffix
const TICKER_OVERRIDES: Record<string, string> = {};

const PREFERRED_EXCHANGES = ["NASDAQ", "NYSE", "AMEX", "CBOE", "NYSE ARCA"];

interface Pool {
  source: "DexScreener" | "GeckoTerminal";
  dex: string;
  address: string;
  name: string;
  pairedWith: string;
  pairedSymbol?: string;
  priceUsd: number | null;
  liquidityUsd: number;
  verifiedOnchain?: boolean;
  indexerLiquidityUsd?: number;
}

interface MarketPrice {
  ticker: string;
  source: string;
  price: number;
  extendedPrice: number | null;
}

interface AuditResult {
  symbol: string;
  address: string;
  classification: HydropumpClassification;
  ticker: string;
  alreadyFlagged: boolean;
  qualifies: boolean;
  reasons: string[];
  marketPrice?: MarketPrice;
  onchainPrice?: number;
  deviation?: number;
  bestHardAssetPool?: Pool;
  hardAssetPools: Pool[];
  poolCount: number;
  dataWarnings: string[];
}

// ---------------------------------------------------------------------------
// Rate limiting + retries
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const lastRequestAt: Record<string, number> = {};
const hostQueues: Record<string, Promise<void>> = {};

async function throttle(host: string): Promise<void> {
  const interval = HOST_MIN_INTERVAL_MS[host] ?? 500;
  const previous = hostQueues[host] ?? Promise.resolve();
  let release!: () => void;
  hostQueues[host] = new Promise((r) => (release = r));
  await previous;
  const wait = (lastRequestAt[host] ?? 0) + interval - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt[host] = Date.now();
  release();
}

class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterMs?: number
  ) {
    super(message);
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
  }
  const message = (error instanceof Error ? `${error.message} ${(error as any).cause ?? ""}` : String(error)).toLowerCase();
  return [
    "429",
    "rate limit",
    "too many requests",
    "exceeded",
    "throttled",
    "timeout",
    "timed out",
    "aborted",
    "fetch failed",
    "econnreset",
    "econnrefused",
    "etimedout",
    "socket hang up",
    "network",
    "503",
    "502",
    "504",
  ].some((needle) => message.includes(needle));
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES - 1) break;
      const rateLimited = error instanceof HttpError ? error.status === 429 : /429|rate limit|too many requests/i.test(String(error));
      const base = rateLimited ? RETRY_DELAY_BASE_MS * 2 : RETRY_DELAY_BASE_MS;
      const backoff = Math.min(MAX_RETRY_DELAY_MS, base * 2 ** attempt);
      const headerDelay = error instanceof HttpError ? error.retryAfterMs ?? 0 : 0;
      const delay = Math.min(MAX_RETRY_DELAY_MS, Math.max(backoff, headerDelay)) + Math.floor(Math.random() * 500);
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`  ${label} failed (${reason.slice(0, 120)}), retrying in ${(delay / 1000).toFixed(1)}s (${attempt + 1}/${MAX_RETRIES - 1})`);
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const HOST_FAILURE_LIMIT = 2;
const hostFailures: Record<string, number> = {};

async function fetchJson<T>(url: string, label: string, init: RequestInit = {}): Promise<T | null> {
  const host = new URL(url).host;
  if ((hostFailures[host] ?? 0) >= HOST_FAILURE_LIMIT) {
    throw new Error(`${host} disabled after ${HOST_FAILURE_LIMIT} exhausted retries`);
  }
  try {
    const data = await withRetry(label, async () => {
      await throttle(host);
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new HttpError(`${label}: HTTP ${response.status}`, response.status, parseRetryAfter(response.headers.get("retry-after")));
      }
      return (await response.json()) as T;
    });
    hostFailures[host] = 0;
    return data;
  } catch (error) {
    if (isRetryable(error)) {
      // Connection-level failures (DNS, TLS, refused) mean the host is unreachable, not just busy
      const unreachable = !(error instanceof HttpError);
      hostFailures[host] = unreachable ? HOST_FAILURE_LIMIT : (hostFailures[host] ?? 0) + 1;
      if (hostFailures[host] >= HOST_FAILURE_LIMIT) console.warn(`  ${host} is unreachable; skipping it for the rest of the run`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

function classify(token: Token): HydropumpClassification | null {
  if (!token.isEquity) return null;
  if (token.symbol.startsWith("wt")) return "st0x";
  if (token.symbol.endsWith("c")) return "coinbase_stock";
  return null;
}

function deriveTicker(token: Token, classification: HydropumpClassification): string {
  if (TICKER_OVERRIDES[token.symbol]) return TICKER_OVERRIDES[token.symbol];
  return classification === "st0x" ? token.symbol.slice(2) : token.symbol.slice(0, -1);
}

// ---------------------------------------------------------------------------
// Market (stock) prices
// ---------------------------------------------------------------------------

interface TradingViewResponse {
  data: Array<{ s: string; d: [string, number | null, string, boolean | null, number | null, number | null, string | null] }>;
}

async function fetchTradingViewPrices(tickers: string[]): Promise<Map<string, MarketPrice>> {
  const result = new Map<string, MarketPrice>();
  const body = {
    filter: [{ left: "name", operation: "in_range", right: tickers }],
    columns: ["name", "close", "exchange", "is_primary", "premarket_close", "postmarket_close", "currency"],
    range: [0, tickers.length * 4],
  };
  const data = await fetchJson<TradingViewResponse>("https://scanner.tradingview.com/america/scan", "TradingView scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const rank = (exchange: string, isPrimary: boolean | null) => {
    const idx = PREFERRED_EXCHANGES.indexOf(exchange);
    return (isPrimary ? 0 : 100) + (idx === -1 ? 50 : idx);
  };
  const best = new Map<string, { score: number; price: MarketPrice }>();

  for (const row of data?.data ?? []) {
    const [name, close, exchange, isPrimary, pre, post, currency] = row.d;
    if (!close || (currency && currency !== "USD")) continue;
    const score = rank(exchange, isPrimary);
    const current = best.get(name);
    if (!current || score < current.score) {
      best.set(name, {
        score,
        price: { ticker: row.s, source: "TradingView", price: close, extendedPrice: post ?? pre ?? null },
      });
    }
  }
  best.forEach(({ price }, name) => result.set(name, price));
  return result;
}

interface YahooChartResponse {
  chart: { result: Array<{ meta: { regularMarketPrice?: number; currency?: string; symbol: string } }> | null };
}

async function fetchYahooPrice(ticker: string): Promise<MarketPrice | null> {
  const data = await fetchJson<YahooChartResponse>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
    `Yahoo ${ticker}`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  const meta = data?.chart.result?.[0]?.meta;
  if (!meta?.regularMarketPrice || (meta.currency && meta.currency !== "USD")) return null;
  return { ticker: meta.symbol, source: "Yahoo Finance", price: meta.regularMarketPrice, extendedPrice: null };
}

// ---------------------------------------------------------------------------
// Onchain pools
// ---------------------------------------------------------------------------

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceNative: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
}

async function fetchDexScreenerPools(tokenAddress: string): Promise<Pool[]> {
  const pairs = await fetchJson<DexScreenerPair[]>(
    `https://api.dexscreener.com/token-pairs/v1/base/${tokenAddress}`,
    `DexScreener ${tokenAddress.slice(0, 10)}`
  );
  const target = tokenAddress.toLowerCase();
  return (pairs ?? [])
    .filter((p) => p.chainId === "base")
    .map((p) => {
      const isBase = p.baseToken.address.toLowerCase() === target;
      const other = isBase ? p.quoteToken : p.baseToken;
      const basePrice = p.priceUsd ? parseFloat(p.priceUsd) : NaN;
      const native = parseFloat(p.priceNative);
      let priceUsd: number | null = isBase ? basePrice : native > 0 ? basePrice / native : NaN;
      if (!Number.isFinite(priceUsd)) priceUsd = null;
      return {
        source: "DexScreener" as const,
        dex: p.dexId,
        address: p.pairAddress.toLowerCase(),
        name: `${p.baseToken.symbol}/${p.quoteToken.symbol}`,
        pairedWith: other.address.toLowerCase(),
        pairedSymbol: other.symbol,
        priceUsd,
        liquidityUsd: p.liquidity?.usd ?? 0,
      };
    });
}

interface GeckoTerminalPoolsResponse {
  data: Array<{
    attributes: {
      address: string;
      name: string;
      base_token_price_usd: string | null;
      quote_token_price_usd: string | null;
      reserve_in_usd: string | null;
    };
    relationships: {
      base_token: { data: { id: string } };
      quote_token: { data: { id: string } };
      dex: { data: { id: string } };
    };
  }>;
}

async function fetchGeckoTerminalPools(tokenAddress: string): Promise<Pool[]> {
  const target = tokenAddress.toLowerCase();
  const pools: Pool[] = [];
  for (let page = 1; page <= GECKOTERMINAL_MAX_PAGES; page++) {
    const data = await fetchJson<GeckoTerminalPoolsResponse>(
      `https://api.geckoterminal.com/api/v2/networks/base/tokens/${tokenAddress}/pools?page=${page}`,
      `GeckoTerminal ${tokenAddress.slice(0, 10)} p${page}`,
      { headers: { Accept: "application/json;version=20230203" } }
    );
    const rows = data?.data ?? [];
    for (const row of rows) {
      const baseAddr = row.relationships.base_token.data.id.replace(/^base_/, "").toLowerCase();
      const quoteAddr = row.relationships.quote_token.data.id.replace(/^base_/, "").toLowerCase();
      const isBase = baseAddr === target;
      const raw = isBase ? row.attributes.base_token_price_usd : row.attributes.quote_token_price_usd;
      const priceUsd = raw ? parseFloat(raw) : NaN;
      pools.push({
        source: "GeckoTerminal",
        dex: row.relationships.dex.data.id,
        address: row.attributes.address.toLowerCase(),
        name: row.attributes.name,
        pairedWith: isBase ? quoteAddr : baseAddr,
        priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
        liquidityUsd: parseFloat(row.attributes.reserve_in_usd ?? "0") || 0,
      });
    }
    if (rows.length < 20) break;
  }
  return pools;
}

/**
 * Merges pools from both indexers; when both report a pool, the lower liquidity figure is kept.
 * Pool contracts are re-valued from onchain balances afterwards, so this only decides Uniswap v4 figures.
 */
function mergePools(lists: Pool[][]): Pool[] {
  const byAddress = new Map<string, Pool>();
  for (const pool of lists.flat()) {
    const existing = byAddress.get(pool.address);
    if (!existing || pool.liquidityUsd < existing.liquidityUsd) {
      byAddress.set(pool.address, { ...pool, pairedSymbol: pool.pairedSymbol ?? existing?.pairedSymbol });
    }
  }
  return Array.from(byAddress.values());
}

// ---------------------------------------------------------------------------
// Onchain contract verification (Base RPC)
// ---------------------------------------------------------------------------

const rpcClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL, { retryCount: 0, timeout: REQUEST_TIMEOUT_MS }),
});

/**
 * Multicall with allowFailure, sent as a single eth_call per chunk. viem reports per-request HTTP errors
 * (e.g. 429s) as individual call failures under allowFailure, so those are rethrown to trigger a retry.
 */
async function rpcMulticall(contracts: readonly any[], label: string): Promise<Array<{ status: "success" | "failure"; result?: any; error?: unknown }>> {
  const out: Array<{ status: "success" | "failure"; result?: any; error?: unknown }> = [];
  for (let i = 0; i < contracts.length; i += RPC_MULTICALL_CHUNK) {
    const chunk = contracts.slice(i, i + RPC_MULTICALL_CHUNK);
    const responses = await withRetry(`${label} (Base RPC)`, async () => {
      await throttle("rpc");
      const res = await rpcClient.multicall({ contracts: chunk as any[], allowFailure: true, batchSize: 1_000_000 });
      const transportError = res.find((r) => r.status === "failure" && /HTTP request failed|429|rate limit|timed out/i.test(String(r.error)));
      if (transportError) throw new Error(`RPC transport error: ${String(transportError.error).split("\n")[0]} (429)`);
      return res;
    });
    out.push(...(responses as any[]));
  }
  return out;
}

interface ContractCheck {
  ok: boolean;
  problem?: string;
}

async function verifyContracts(tokens: Token[]): Promise<Map<string, ContractCheck>> {
  const result = new Map<string, ContractCheck>();
  const perToken = 3;
  const tokensPerChunk = Math.max(1, Math.floor(RPC_MULTICALL_CHUNK / perToken));

  for (let i = 0; i < tokens.length; i += tokensPerChunk) {
    const chunk = tokens.slice(i, i + tokensPerChunk);
    const contracts = chunk.flatMap((t) => {
      const address = getAddress(t.address);
      return [
        { address, abi: erc20Abi, functionName: "symbol" },
        { address, abi: erc20Abi, functionName: "decimals" },
        { address, abi: erc20Abi, functionName: "totalSupply" },
      ] as const;
    });

    const responses = await rpcMulticall(contracts, `contract check batch ${i / tokensPerChunk + 1}`);

    chunk.forEach((token, j) => {
      const [symbol, decimals, supply] = responses.slice(j * perToken, j * perToken + perToken);
      if (symbol.status !== "success" || decimals.status !== "success" || supply.status !== "success") {
        result.set(token.address.toLowerCase(), { ok: false, problem: "contract did not respond to ERC20 calls" });
      } else if (Number(decimals.result) !== token.decimals) {
        result.set(token.address.toLowerCase(), { ok: false, problem: `onchain decimals ${decimals.result} != list ${token.decimals}` });
      } else if ((supply.result as bigint) === BigInt(0)) {
        result.set(token.address.toLowerCase(), { ok: false, problem: "totalSupply is 0" });
      } else {
        const problem = symbol.result !== token.symbol ? `onchain symbol "${symbol.result}" != list "${token.symbol}"` : undefined;
        result.set(token.address.toLowerCase(), { ok: true, problem });
      }
    });
  }
  return result;
}

interface GeckoTerminalSimplePriceResponse {
  data: { attributes: { token_prices: Record<string, string> } };
}

/** USD prices for hard assets, keyed by lowercased address. Assets without a price are valued from indexer data only. */
async function fetchHardAssetPrices(): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  for (const [address, asset] of Object.entries(HARD_ASSETS)) if (asset.stable) prices[address] = 1;

  const erc20s = Object.keys(HARD_ASSETS).filter((a) => !HARD_ASSETS[a].stable && !/^0x(0{40}|e{40})$/.test(a));
  try {
    const data = await fetchJson<GeckoTerminalSimplePriceResponse>(
      `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${erc20s.join(",")}`,
      "GeckoTerminal hard-asset prices",
      { headers: { Accept: "application/json;version=20230203" } }
    );
    for (const [address, price] of Object.entries(data?.data.attributes.token_prices ?? {})) {
      const value = parseFloat(price);
      if (Number.isFinite(value) && value > 0) prices[address.toLowerCase()] = value;
    }
  } catch (error) {
    console.warn(`  Hard-asset prices unavailable (${error instanceof Error ? error.message : error}); only stablecoin pools will be verified onchain`);
  }
  return prices;
}

const poolStateAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function slot0() view returns (uint160)",
  "function globalState() view returns (uint160)",
  "function getReserves() view returns (uint256, uint256)",
]);

/**
 * Re-values hard-asset pools that are standalone contracts (Uniswap v2/v3, Aerodrome, Algebra, etc.) from their
 * onchain balances and spot price. The equity side is valued at the market stock price so a mispriced pool can't
 * inflate its own liquidity. Uniswap v4 pools (32-byte ids inside the PoolManager singleton) keep indexer data.
 */
async function verifyPoolsOnchain(token: Token, pools: Pool[], hardPrices: Record<string, number>, marketPrice: number | undefined): Promise<string[]> {
  const warnings: string[] = [];
  const candidates = pools.filter((p) => /^0x[0-9a-f]{40}$/.test(p.address) && hardPrices[p.pairedWith] !== undefined);
  if (candidates.length === 0) return warnings;

  const tokenAddress = getAddress(token.address);
  const perPool = 7;
  const contracts = candidates.flatMap((p) => {
    const pool = getAddress(p.address);
    return [
      { address: pool, abi: poolStateAbi, functionName: "token0" },
      { address: pool, abi: poolStateAbi, functionName: "token1" },
      { address: pool, abi: poolStateAbi, functionName: "slot0" },
      { address: pool, abi: poolStateAbi, functionName: "globalState" },
      { address: pool, abi: poolStateAbi, functionName: "getReserves" },
      { address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [pool] },
      { address: getAddress(p.pairedWith), abi: erc20Abi, functionName: "balanceOf", args: [pool] },
    ] as const;
  });

  let responses: Awaited<ReturnType<typeof rpcMulticall>>;
  try {
    responses = await rpcMulticall(contracts, `${token.symbol} pool reads`);
  } catch (error) {
    warnings.push(`Onchain pool verification failed, using indexer values: ${error instanceof Error ? error.message : error}`);
    return warnings;
  }

  candidates.forEach((pool, i) => {
    const [t0, t1, slot0, globalState, reserves, tokenBal, hardBal] = responses.slice(i * perPool, (i + 1) * perPool);
    if (t0.status !== "success" || t1.status !== "success" || tokenBal.status !== "success" || hardBal.status !== "success") return;

    const token0 = String(t0.result).toLowerCase();
    const token1 = String(t1.result).toLowerCase();
    const target = token.address.toLowerCase();
    const pair = new Set([token0, token1]);
    if (!pair.has(target) || !pair.has(pool.pairedWith)) return;

    const hard = HARD_ASSETS[pool.pairedWith];
    const hardUsd = hardPrices[pool.pairedWith];
    const tokenIsToken0 = token0 === target;
    const decimalShift = 10 ** (token.decimals - hard.decimals);

    let spotInHard: number | null = null;
    const sqrtPrice = slot0.status === "success" ? slot0.result : globalState.status === "success" ? globalState.result : null;
    if (sqrtPrice && BigInt(sqrtPrice) > BigInt(0)) {
      const price1Per0 = (Number(sqrtPrice) / 2 ** 96) ** 2;
      spotInHard = (tokenIsToken0 ? price1Per0 : 1 / price1Per0) * decimalShift;
    } else if (reserves.status === "success") {
      const [r0, r1] = (reserves.result as readonly bigint[]).map(Number);
      const [tokenReserve, hardReserve] = tokenIsToken0 ? [r0, r1] : [r1, r0];
      if (tokenReserve > 0 && hardReserve > 0) spotInHard = (hardReserve / tokenReserve) * decimalShift;
    }

    const tokenAmount = Number(tokenBal.result as bigint) / 10 ** token.decimals;
    const hardAmount = Number(hardBal.result as bigint) / 10 ** hard.decimals;
    const spotUsd = spotInHard !== null && Number.isFinite(spotInHard) ? spotInHard * hardUsd : null;
    const tokenUsd = marketPrice ?? spotUsd ?? 0;

    pool.indexerLiquidityUsd = pool.liquidityUsd;
    pool.liquidityUsd = hardAmount * hardUsd + tokenAmount * tokenUsd;
    pool.priceUsd = spotUsd;
    pool.verifiedOnchain = true;

    const indexer = pool.indexerLiquidityUsd;
    if (Math.abs(pool.liquidityUsd - indexer) > Math.max(1_000, 0.25 * Math.max(pool.liquidityUsd, indexer))) {
      warnings.push(`${pool.name} (${pool.dex}): indexer reported $${indexer.toFixed(0)}, onchain balances are $${pool.liquidityUsd.toFixed(0)}`);
    }
  });
  return warnings;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

function deviationFrom(onchain: number, market: MarketPrice): number {
  const regular = Math.abs(onchain - market.price) / market.price;
  if (!market.extendedPrice) return regular;
  const extended = Math.abs(onchain - market.extendedPrice) / market.extendedPrice;
  return Math.min(regular, extended);
}

async function auditToken(
  token: Token,
  classification: HydropumpClassification,
  ticker: string,
  marketPrice: MarketPrice | undefined,
  contractCheck: ContractCheck | undefined,
  hardPrices: Record<string, number>
): Promise<AuditResult> {
  const result: AuditResult = {
    symbol: token.symbol,
    address: token.address,
    classification,
    ticker,
    alreadyFlagged: token.isHydropumpPair === true,
    qualifies: false,
    reasons: [],
    marketPrice,
    hardAssetPools: [],
    poolCount: 0,
    dataWarnings: [],
  };

  if (contractCheck && !contractCheck.ok) result.reasons.push(`Contract check failed: ${contractCheck.problem}`);
  if (contractCheck?.ok && contractCheck.problem) result.dataWarnings.push(contractCheck.problem);

  const sourceResults = await Promise.allSettled([fetchDexScreenerPools(token.address), fetchGeckoTerminalPools(token.address)]);
  const lists: Pool[][] = [];
  sourceResults.forEach((r, i) => {
    const source = i === 0 ? "DexScreener" : "GeckoTerminal";
    if (r.status === "fulfilled") lists.push(r.value);
    else result.dataWarnings.push(`${source} unavailable: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
  });

  if (lists.length === 0) {
    result.reasons.push("No pool data available from any indexer");
    return result;
  }

  const pools = mergePools(lists);
  result.poolCount = pools.length;
  result.hardAssetPools = pools.filter((p) => HARD_ASSETS[p.pairedWith]).map((p) => ({ ...p, pairedSymbol: HARD_ASSETS[p.pairedWith].symbol }));
  result.dataWarnings.push(...(await verifyPoolsOnchain(token, result.hardAssetPools, hardPrices, marketPrice?.price)));
  result.hardAssetPools.sort((a, b) => b.liquidityUsd - a.liquidityUsd);

  const liquidHardPools = result.hardAssetPools.filter((p) => p.liquidityUsd >= MIN_LIQUIDITY_USD && p.priceUsd !== null);
  const best = liquidHardPools[0];

  if (!best) {
    const deepest = result.hardAssetPools[0];
    result.reasons.push(
      deepest
        ? `Insufficient hard-asset liquidity: deepest pool ${deepest.name} (${deepest.dex}) has $${deepest.liquidityUsd.toFixed(0)} ${deepest.verifiedOnchain ? "onchain" : "per indexer"} < $${MIN_LIQUIDITY_USD}`
        : "No pool paired with a hard asset (USDC/ETH/BTC etc.)"
    );
  } else {
    result.bestHardAssetPool = best;
    result.onchainPrice = best.priceUsd!;
  }

  if (!marketPrice) {
    result.reasons.push(`No market price found for ticker ${ticker}`);
  } else if (result.onchainPrice !== undefined) {
    result.deviation = deviationFrom(result.onchainPrice, marketPrice);
    if (result.deviation > MAX_PRICE_DEVIATION) {
      result.reasons.push(
        `Price deviation ${(result.deviation * 100).toFixed(2)}% > ${MAX_PRICE_DEVIATION * 100}% (onchain $${result.onchainPrice.toFixed(4)} vs ${marketPrice.ticker} $${marketPrice.price.toFixed(4)})`
      );
    }
  }

  result.qualifies = result.reasons.length === 0;
  return result;
}

// ---------------------------------------------------------------------------
// File update
// ---------------------------------------------------------------------------

function applyUpdates(qualified: Pick<AuditResult, "symbol" | "address" | "classification">[], filePath = TOKENS_FILE): number {
  let content = readFileSync(filePath, "utf-8");
  let updated = 0;

  for (const r of qualified) {
    const marker = `address: "${r.address}"`;
    const addressIdx = content.indexOf(marker);
    if (addressIdx === -1) {
      console.warn(`  Could not locate ${r.symbol} (${r.address}) in tokens file, skipping`);
      continue;
    }
    const start = content.lastIndexOf("{", addressIdx);
    const end = content.indexOf("\n  }", addressIdx);
    if (start === -1 || end === -1) {
      console.warn(`  Could not parse token object for ${r.symbol}, skipping`);
      continue;
    }

    const body = content
      .slice(start, end)
      .split("\n")
      .filter((line) => !/^\s*(isHydropumpPair|hydropumpClassification):/.test(line))
      .join("\n");
    const newBody = `${body}\n    isHydropumpPair: true,\n    hydropumpClassification: "${r.classification}",`;

    content = content.slice(0, start) + newBody + content.slice(end);
    updated++;
  }

  writeFileSync(filePath, content);
  return updated;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Options {
  dryRun: boolean;
  recheck: boolean;
  symbols?: Set<string>;
  reportPath?: string;
  applyReportPath?: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false, recheck: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--recheck") options.recheck = true;
    else if (arg === "--symbols") {
      options.symbols = new Set((argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    } else if (arg === "--report") options.reportPath = argv[++i];
    else if (arg === "--apply-report") options.applyReportPath = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: npm run audit-hydropump -- [--dry-run] [--recheck] [--symbols A,B] [--report path.json] [--apply-report path.json]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function fmtUsd(n: number | undefined): string {
  return n === undefined ? "-" : `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 })}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { tokens } = require("../src/tokens/8453.ts") as { tokens: Token[] };

  if (options.applyReportPath) {
    const report = JSON.parse(readFileSync(resolve(options.applyReportPath), "utf-8")) as { results: AuditResult[] };
    const toApply = report.results.filter((r) => {
      const token = tokens.find((t) => t.address.toLowerCase() === r.address.toLowerCase());
      return r.qualifies && token && token.isHydropumpPair !== true && classify(token) === r.classification;
    });
    console.log(`Applying ${toApply.length} qualifying token(s) from ${options.applyReportPath}: ${toApply.map((r) => r.symbol).join(", ")}`);
    if (toApply.length) console.log(`Updated ${applyUpdates(toApply)} token(s) in src/tokens/8453.ts`);
    return;
  }

  const candidates = tokens
    .map((token) => ({ token, classification: classify(token) }))
    .filter((c): c is { token: Token; classification: HydropumpClassification } => c.classification !== null)
    .filter((c) => !options.symbols || options.symbols.has(c.token.symbol))
    .filter((c) => options.recheck || c.token.isHydropumpPair !== true);

  if (options.symbols) {
    const found = new Set(candidates.map((c) => c.token.symbol));
    const missing = Array.from(options.symbols).filter((s) => !found.has(s));
    if (missing.length) console.warn(`Not eligible or already flagged (use --recheck): ${missing.join(", ")}\n`);
  }

  if (candidates.length === 0) {
    console.log("No candidate tokens to audit.");
    return;
  }

  console.log(`Auditing ${candidates.length} equity token(s) for Hydropump eligibility`);
  console.log(`  Max price deviation: ${MAX_PRICE_DEVIATION * 100}% | Min hard-asset liquidity: $${MIN_LIQUIDITY_USD.toLocaleString()}\n`);

  const withTickers = candidates.map((c) => ({ ...c, ticker: deriveTicker(c.token, c.classification) }));

  const tickers = Array.from(new Set(withTickers.map((c) => c.ticker)));

  console.log("Fetching market prices (TradingView)...");
  let marketPrices = new Map<string, MarketPrice>();
  try {
    marketPrices = await fetchTradingViewPrices(tickers);
  } catch (error) {
    console.warn(`  TradingView unavailable (${error instanceof Error ? error.message : error}), falling back to Yahoo Finance`);
  }
  for (const ticker of tickers) {
    if (marketPrices.has(ticker)) continue;
    try {
      const price = await fetchYahooPrice(ticker);
      if (price) marketPrices.set(ticker, price);
    } catch (error) {
      console.warn(`  Yahoo Finance failed for ${ticker}: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log("Verifying token contracts via Base RPC...");
  let contractChecks = new Map<string, ContractCheck>();
  try {
    contractChecks = await verifyContracts(withTickers.map((c) => c.token));
  } catch (error) {
    console.warn(`  Base RPC verification skipped: ${error instanceof Error ? error.message : error}`);
  }

  console.log("Fetching hard-asset USD prices...");
  const hardPrices = await fetchHardAssetPrices();

  console.log("Fetching pools (DexScreener + GeckoTerminal) and verifying balances onchain...\n");
  const results: AuditResult[] = [];
  for (let i = 0; i < withTickers.length; i++) {
    const { token, classification, ticker } = withTickers[i];
    process.stdout.write(`[${i + 1}/${withTickers.length}] ${token.symbol.padEnd(9)} `);
    const r = await auditToken(token, classification, ticker, marketPrices.get(ticker), contractChecks.get(token.address.toLowerCase()), hardPrices);
    results.push(r);
    const status = r.qualifies ? "PASS" : "FAIL";
    const detail = r.qualifies
      ? `onchain ${fmtUsd(r.onchainPrice)} vs ${r.marketPrice!.ticker} ${fmtUsd(r.marketPrice!.price)} (${(r.deviation! * 100).toFixed(2)}%), ${r.bestHardAssetPool!.name} on ${r.bestHardAssetPool!.dex} ${fmtUsd(r.bestHardAssetPool!.liquidityUsd)} ${r.bestHardAssetPool!.verifiedOnchain ? "(onchain)" : "(indexer)"}`
      : r.reasons.join("; ");
    console.log(`${status}  ${detail}`);
    for (const w of r.dataWarnings) console.log(`             warning: ${w}`);
  }

  const toUpdate = results.filter((r) => r.qualifies && !r.alreadyFlagged);
  const passed = results.filter((r) => r.qualifies);
  const failedFlagged = results.filter((r) => !r.qualifies && r.alreadyFlagged);

  console.log("\n" + "=".repeat(70));
  console.log(`Audited: ${results.length} | Qualified: ${passed.length} | Newly qualifying: ${toUpdate.length}`);
  if (toUpdate.length) console.log(`  New: ${toUpdate.map((r) => `${r.symbol} (${r.classification})`).join(", ")}`);
  if (failedFlagged.length) {
    console.log(`  Already flagged but currently failing (left unchanged, review manually): ${failedFlagged.map((r) => r.symbol).join(", ")}`);
  }
  console.log("=".repeat(70));

  if (options.reportPath) {
    writeFileSync(resolve(options.reportPath), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
    console.log(`Report written to ${options.reportPath}`);
  }

  if (options.dryRun) {
    console.log("Dry run: no changes written.");
  } else if (toUpdate.length) {
    const count = applyUpdates(toUpdate);
    console.log(`Updated ${count} token(s) in src/tokens/8453.ts`);
  } else {
    console.log("No changes needed.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Audit failed:", error);
    process.exit(1);
  });
}

export { applyUpdates, classify, deriveTicker };
