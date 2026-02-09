import { createPublicClient, http, getAddress, erc20Abi } from "viem";
import { base } from "viem/chains";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { Token } from "../src/types";

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
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

async function fetchFromDexScreener(pairAddress: string): Promise<{ address: string; name: string; symbol: string; decimals: number }> {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/base/${pairAddress}`);
  
  if (!response.ok) {
    throw new Error(`DexScreener API error: ${response.status} ${response.statusText}`);
  }

  const data: DexScreenerResponse = await response.json();
  
  if (!data.pairs || data.pairs.length === 0) {
    throw new Error("No pair data found from DexScreener");
  }

  const pair = data.pairs[0];
  const baseToken = pair.baseToken;

  // We still need to fetch decimals from the blockchain
  const client = createPublicClient({
    chain: base,
    transport: http(),
  });

  const tokenAddress = getAddress(baseToken.address);
  const decimals = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "decimals",
  });

  return {
    address: tokenAddress,
    name: baseToken.name,
    symbol: baseToken.symbol,
    decimals: Number(decimals),
  };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Please provide a token address or DexScreener URL");
    process.exit(1);
  }

  let checksummedAddress: `0x${string}`;
  let tokenName: string;
  let tokenSymbol: string;
  let tokenDecimals: number;

  // Check if input is a DexScreener URL
  // Match any valid hex string (flexible for different pair/pool ID formats)
  const dexScreenerMatch = input.match(/dexscreener\.com\/base\/(0x[a-fA-F0-9]+)/);
  
  if (dexScreenerMatch) {
    // Extract pair address from URL and fetch from DexScreener API
    const pairAddress = dexScreenerMatch[1];
    console.log(`Fetching token data from DexScreener for pair: ${pairAddress}`);
    
    try {
      const tokenData = await fetchFromDexScreener(pairAddress);
      checksummedAddress = tokenData.address as `0x${string}`;
      tokenName = tokenData.name;
      tokenSymbol = tokenData.symbol;
      tokenDecimals = tokenData.decimals;
      console.log(`Found token: ${tokenSymbol} (${tokenName})`);
    } catch (e) {
      console.error("Error fetching from DexScreener:", e instanceof Error ? e.message : e);
      process.exit(1);
    }
  } else {
    // Treat as direct token address
    try {
      checksummedAddress = getAddress(input);
    } catch (e) {
      console.error("Invalid address or URL format");
      process.exit(1);
    }

    // Fetch token data from blockchain
    const client = createPublicClient({
      chain: base,
      transport: http(),
    });

    const [name, symbol, decimals] = await Promise.all([
      client.readContract({ address: checksummedAddress, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: checksummedAddress, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: checksummedAddress, abi: erc20Abi, functionName: "decimals" }),
    ]);

    tokenName = name as string;
    tokenSymbol = symbol as string;
    tokenDecimals = Number(decimals);
  }

  try {

    const filePath = resolve(__dirname, "../src/tokens/8453.ts");
    const fileContent = readFileSync(filePath, "utf-8");

    // Use require to get the current tokens for sorting logic
    const { tokens } = require("../src/tokens/8453.ts");

    if (tokens.find((t: Token) => t.address.toLowerCase() === checksummedAddress.toLowerCase())) {
      console.error("Token already exists");
      process.exit(1);
    }

    const pinnedAddresses = [
      "0x00000e7efa313F4E11Bfff432471eD9423AC6B30", // HYDX
      "0x4200000000000000000000000000000000000006", // WETH
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", // cbBTC
    ].map(a => a.toLowerCase());

    // Find insertion point
    const unpinned = tokens.filter((t: Token) => !pinnedAddresses.includes(t.address.toLowerCase()));
    const nextToken = unpinned.find((t: Token) => t.symbol.toLowerCase().localeCompare(tokenSymbol.toLowerCase()) > 0);

    const newTokenStr = `  {
    chainId: 8453,
    address: "${checksummedAddress}",
    name: "${tokenName}",
    symbol: "${tokenSymbol}",
    decimals: ${tokenDecimals},
    logoURI: "https://raw.githubusercontent.com/hydrexfi/hydrex-lists/main/assets/tokens/${tokenSymbol.toUpperCase()}.png",
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
    console.log(`✅ ${tokenSymbol} added to 8453.ts`);

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
