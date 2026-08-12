import { createPublicClient, http, getAddress, erc20Abi } from "viem";
import { base } from "viem/chains";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Token } from "../src/types";
import sharp from "sharp";

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd?: string;
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: Array<{ label: string; url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

interface GeckoTerminalPool {
  id: string;
  type: string;
  attributes: {
    base_token_price_usd: string;
    address: string;
    name: string;
    pool_created_at: string;
    token_price_usd: string;
    reserve_in_usd: string;
  };
  relationships: {
    base_token: {
      data: {
        id: string;
        type: string;
      };
    };
    quote_token: {
      data: {
        id: string;
        type: string;
      };
    };
  };
}

interface GeckoTerminalToken {
  id: string;
  type: string;
  attributes: {
    address: string;
    name: string;
    symbol: string;
    image_url: string;
    coingecko_coin_id: string | null;
    decimals: string;
    total_supply: string;
  };
}

interface GeckoTerminalResponse {
  data: GeckoTerminalPool;
  included: GeckoTerminalToken[];
}

interface ResolvedToken {
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
}

const MAX_RETRIES = 8;
const RETRY_DELAY_BASE_MS = 3000;
const BATCH_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("503") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("over rate limit") ||
    message.includes("rate exceeded") ||
    message.includes("throttled") ||
    message.includes("request limit") ||
    message.includes("exceeded the") // common RPC phrasing: "exceeded the compute units"
  );
}

function getRetryAfterMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const asSeconds = Number(retryAfter);
    if (!Number.isNaN(asSeconds)) {
      return asSeconds * 1000;
    }
    const asDate = Date.parse(retryAfter);
    if (!Number.isNaN(asDate)) {
      return Math.max(0, asDate - Date.now());
    }
  }
  return RETRY_DELAY_BASE_MS * Math.pow(2, attempt);
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  options: { retryNonRateLimit?: boolean } = {}
): Promise<T> {
  const { retryNonRateLimit = false } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const rateLimited = isRateLimitError(error);
      const shouldRetry = rateLimited || retryNonRateLimit;

      if (!shouldRetry || attempt === MAX_RETRIES - 1) {
        break;
      }

      const baseDelay = rateLimited ? RETRY_DELAY_BASE_MS * 2 : RETRY_DELAY_BASE_MS;
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(
        `  ${rateLimited ? "Rate limited" : "Transient error"} on ${label}, retrying in ${Math.round(delay / 1000)}s... (${attempt + 1}/${MAX_RETRIES})`
      );
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchWithRetry(url: string, label: string): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);

      if (response.status === 429 || response.status === 503) {
        lastError = new Error(`Rate limit (${response.status}) from ${label}`);
        if (attempt === MAX_RETRIES - 1) {
          break;
        }

        const headerDelay = getRetryAfterMs(response, attempt);
        const exponentialDelay = RETRY_DELAY_BASE_MS * 2 * Math.pow(2, attempt);
        const delay = Math.max(headerDelay, exponentialDelay);
        console.warn(
          `  Rate limited on ${label}, retrying in ${Math.round(delay / 1000)}s... (${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        throw new Error(`${label} error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === MAX_RETRIES - 1) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      const delay = RETRY_DELAY_BASE_MS * 2 * Math.pow(2, attempt);
      console.warn(
        `  Rate limited on ${label}, retrying in ${Math.round(delay / 1000)}s... (${attempt + 1}/${MAX_RETRIES})`
      );
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function downloadTokenLogo(logoUrl: string, symbol: string): Promise<void> {
  // Modify URL parameters to get higher quality image
  const url = new URL(logoUrl);
  url.searchParams.set('width', '256');
  url.searchParams.set('height', '256');
  url.searchParams.set('quality', '100');
  
  const response = await fetchWithRetry(url.toString(), `logo download for ${symbol}`);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Create a circular mask using SVG
  const size = 256;
  const radius = 128;
  const circleMask = Buffer.from(
    `<svg width="${size}" height="${size}">
      <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
    </svg>`
  );

  // Process the image to make it circular with transparent corners
  const logoPath = resolve(__dirname, `../assets/tokens/${symbol.toUpperCase()}.png`);
  
  await sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .composite([{
      input: circleMask,
      blend: 'dest-in'
    }])
    .png()
    .toFile(logoPath);
  
  console.log(`Downloaded and processed logo to ${symbol.toUpperCase()}.png (circular with 128px radius)`);
}

async function fetchFromDexScreener(pairAddress: string): Promise<ResolvedToken> {
  const response = await fetchWithRetry(
    `https://api.dexscreener.com/latest/dex/pairs/base/${pairAddress}`,
    "DexScreener"
  );

  const data: DexScreenerResponse = await response.json();
  
  if (!data.pairs || data.pairs.length === 0) {
    throw new Error("No pair data found from DexScreener");
  }

  const pair = data.pairs[0];
  const baseToken = pair.baseToken;

  // We still need to fetch decimals from the blockchain
  const client = createPublicClient({
    chain: base,
    transport: http(undefined, { retryCount: 0 }),
  });

  const tokenAddress = getAddress(baseToken.address);
  const decimals = await withRetry("RPC decimals (DexScreener)", () =>
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    })
  );

  // Try to get logo URL from the pair info first
  let logoUrl: string | undefined = pair.info?.imageUrl;
  
  // If not found in pair info, check token profile API
  if (!logoUrl) {
    try {
      const profileResponse = await fetchWithRetry(
        `https://api.dexscreener.com/token-profiles/latest/v1`,
        "DexScreener token profiles"
      );
      const profiles = await profileResponse.json();
      const profile = profiles.find((p: any) => 
        p.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase() && 
        p.chainId === 'base'
      );
      if (profile?.icon) {
        logoUrl = profile.icon;
      }
    } catch (e) {
      // Silently fail if profile API doesn't work
      console.warn("Could not fetch from token profiles API");
    }
  }

  return {
    address: tokenAddress,
    name: baseToken.name,
    symbol: baseToken.symbol,
    decimals: Number(decimals),
    logoUrl,
  };
}

async function fetchFromGeckoTerminal(poolAddress: string): Promise<ResolvedToken> {
  const response = await fetchWithRetry(
    `https://api.geckoterminal.com/api/v2/networks/base/pools/${poolAddress}?include=base_token`,
    "GeckoTerminal"
  );

  const data: GeckoTerminalResponse = await response.json();
  
  if (!data.data) {
    throw new Error("No pool data found from GeckoTerminal");
  }

  // Find the base token from the included tokens
  const baseTokenId = data.data.relationships.base_token.data.id;
  const baseToken = data.included.find(token => token.id === baseTokenId);
  
  if (!baseToken) {
    throw new Error("Base token not found in GeckoTerminal response");
  }

  const tokenAddress = getAddress(baseToken.attributes.address);
  
  // GeckoTerminal provides decimals in the API response
  const decimals = parseInt(baseToken.attributes.decimals);

  return {
    address: tokenAddress,
    name: baseToken.attributes.name,
    symbol: baseToken.attributes.symbol,
    decimals: decimals,
    logoUrl: baseToken.attributes.image_url || undefined,
  };
}

async function resolveTokenInput(input: string): Promise<ResolvedToken> {
  // Check if input is a DexScreener URL
  // Match any valid hex string (flexible for different pair/pool ID formats)
  const dexScreenerMatch = input.match(/dexscreener\.com\/base\/(0x[a-fA-F0-9]+)/);
  
  // Check if input is a GeckoTerminal URL
  const geckoTerminalMatch = input.match(/geckoterminal\.com\/base\/pools\/(0x[a-fA-F0-9]+)/);
  
  if (dexScreenerMatch) {
    const pairAddress = dexScreenerMatch[1];
    console.log(`Fetching token data from DexScreener for pair: ${pairAddress}`);
    const tokenData = await fetchFromDexScreener(pairAddress);
    console.log(`Found token: ${tokenData.symbol} (${tokenData.name})`);
    return tokenData;
  }

  if (geckoTerminalMatch) {
    const poolAddress = geckoTerminalMatch[1];
    console.log(`Fetching token data from GeckoTerminal for pool: ${poolAddress}`);
    const tokenData = await fetchFromGeckoTerminal(poolAddress);
    console.log(`Found token: ${tokenData.symbol} (${tokenData.name})`);
    return tokenData;
  }

  // Treat as direct token address
  let checksummedAddress: `0x${string}`;
  try {
    checksummedAddress = getAddress(input);
  } catch (e) {
    throw new Error("Invalid address or URL format");
  }

  const client = createPublicClient({
    chain: base,
    transport: http(undefined, { retryCount: 0 }),
  });

  const [name, symbol, decimals] = await withRetry("RPC token metadata", () =>
    Promise.all([
      client.readContract({ address: checksummedAddress, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: checksummedAddress, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: checksummedAddress, abi: erc20Abi, functionName: "decimals" }),
    ])
  );

  return {
    address: checksummedAddress,
    name: name as string,
    symbol: symbol as string,
    decimals: Number(decimals),
  };
}

async function addToken(token: ResolvedToken): Promise<void> {
  const filePath = resolve(__dirname, "../src/tokens/8453.ts");
  const fileContent = readFileSync(filePath, "utf-8");

  // Clear require cache so batch adds always see the latest file contents
  const tokensModulePath = require.resolve("../src/tokens/8453.ts");
  delete require.cache[tokensModulePath];
  const { tokens } = require("../src/tokens/8453.ts");

  if (tokens.find((t: Token) => t.address.toLowerCase() === token.address.toLowerCase())) {
    throw new Error("Token already exists");
  }

  const pinnedAddresses = [
    "0x00000e7efa313F4E11Bfff432471eD9423AC6B30", // HYDX
    "0x4200000000000000000000000000000000000006", // WETH
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", // cbBTC
  ].map(a => a.toLowerCase());

  // Find insertion point
  const unpinned = tokens.filter((t: Token) => !pinnedAddresses.includes(t.address.toLowerCase()));
  const nextToken = unpinned.find((t: Token) => t.symbol.toLowerCase().localeCompare(token.symbol.toLowerCase()) > 0);

  const newTokenStr = `  {
    chainId: 8453,
    address: "${token.address}",
    name: "${token.name}",
    symbol: "${token.symbol}",
    decimals: ${token.decimals},
    logoURI: "https://raw.githubusercontent.com/hydrexfi/hydrex-lists/main/assets/tokens/${token.symbol.toUpperCase()}.png",
    autoSlippage: 5,
  },
`;

  let newFileContent: string;
  if (nextToken) {
    // Find the index of the next token's address in the file to insert before it
    const searchStr = `address: "${nextToken.address}"`;
    const index = fileContent.indexOf(searchStr);
    
    // Find the start of the object containing that address (the opening '{')
    const openBraceIndex = fileContent.lastIndexOf("{", index);
    
    // Find the start of the line (including indentation) by going back to the previous newline
    const lineStartIndex = fileContent.lastIndexOf("\n", openBraceIndex - 1) + 1;
    
    newFileContent = fileContent.slice(0, lineStartIndex) + newTokenStr + fileContent.slice(lineStartIndex);
  } else {
    // Insert before the last '];'
    const lastBracketIndex = fileContent.lastIndexOf("];");
    newFileContent = fileContent.slice(0, lastBracketIndex) + newTokenStr + fileContent.slice(lastBracketIndex);
  }

  writeFileSync(filePath, newFileContent);
  console.log(`${token.symbol} added to 8453.ts`);

  // Download logo if available
  if (token.logoUrl) {
    try {
      await downloadTokenLogo(token.logoUrl, token.symbol);
    } catch (error) {
      console.warn(`Could not download logo: ${error instanceof Error ? error.message : error}`);
      console.warn(`Please manually add the logo to assets/tokens/${token.symbol.toUpperCase()}.png`);
    }
  } else {
    console.warn(`No logo URL found for ${token.symbol}`);
    console.warn(`Please manually add the logo to assets/tokens/${token.symbol.toUpperCase()}.png`);
  }
}

function parseInputs(argv: string[]): string[] {
  if (argv.length === 0) {
    return [];
  }

  // Support: npm run add-token -- --file path/to/list.txt
  if (argv[0] === "--file" || argv[0] === "-f") {
    const filePath = argv[1];
    if (!filePath) {
      throw new Error("Please provide a file path after --file");
    }
    const resolved = resolve(filePath);
    if (!existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }
    return readFileSync(resolved, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  }

  // Support comma-separated or space-separated inputs
  return argv.flatMap((arg) => arg.split(",").map((part) => part.trim()).filter(Boolean));
}

function printUsage(): void {
  console.error(`Usage:
  npm run add-token -- <address|url> [address|url...]
  npm run add-token -- <address1>,<address2>,...
  npm run add-token -- --file path/to/tokens.txt

Each input can be a token address, DexScreener URL, or GeckoTerminal URL.
File format: one address/URL per line (# comments allowed).`);
}

async function main() {
  let inputs: string[];
  try {
    inputs = parseInputs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    printUsage();
    process.exit(1);
  }

  if (inputs.length === 0) {
    printUsage();
    process.exit(1);
  }

  const isBatch = inputs.length > 1;
  if (isBatch) {
    console.log(`Adding ${inputs.length} tokens...\n`);
  }

  const successes: string[] = [];
  const failures: Array<{ input: string; error: string }> = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (isBatch) {
      console.log(`[${i + 1}/${inputs.length}] ${input}`);
    }

    try {
      // Outer retry covers any rate-limit escape from nested calls
      const token = await withRetry(`resolve ${input}`, () => resolveTokenInput(input));
      await addToken(token);
      successes.push(token.symbol);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Already-present tokens are not retried; keep going in batch mode
      console.error(`Error: ${message}`);
      failures.push({ input, error: message });
      if (!isBatch) {
        process.exit(1);
      }
    }

    if (isBatch && i < inputs.length - 1) {
      console.log(`Waiting ${BATCH_DELAY_MS / 1000}s before next token...\n`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  if (isBatch) {
    console.log(`\nDone. Added ${successes.length}/${inputs.length} tokens.`);
    if (failures.length > 0) {
      console.error("Failed:");
      for (const failure of failures) {
        console.error(`  ${failure.input}: ${failure.error}`);
      }
      process.exit(1);
    }
  }
}

main();
