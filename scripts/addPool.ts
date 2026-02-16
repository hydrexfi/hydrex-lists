import { createPublicClient, http, getAddress } from "viem";
import { base } from "viem/chains";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { Strategy, LiquidityType } from "../src/types";

const POOL_ABI = [
  {
    inputs: [],
    name: 'token0',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token1',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ICHI_VAULT_ABI = [
  {
    inputs: [],
    name: 'token0',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token1',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'allowToken0',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

interface TokenInfo {
  address: string;
  symbol: string;
}

const ERC20_ABI = [
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function getTokenInfo(client: any, address: string): Promise<TokenInfo> {
  const checksummedAddress = getAddress(address);
  const symbol = await client.readContract({
    address: checksummedAddress,
    abi: ERC20_ABI,
    functionName: 'symbol',
  });

  return {
    address: checksummedAddress,
    symbol: symbol as string,
  };
}

function generateTitle(token0Symbol: string, token1Symbol: string): string {
  return `${token0Symbol}/${token1Symbol}`;
}

function getStrategyType(liquidityType: LiquidityType): "Manual" | "Single Sided" | "Classic" {
  if (liquidityType === "integral-manual") {
    return "Manual";
  } else if (liquidityType === "integral") {
    return "Single Sided";
  } else if (liquidityType === "classic-volatile") {
    return "Classic";
  }
  throw new Error(`Unsupported liquidityType: ${liquidityType}`);
}

function getRiskDescription(liquidityType: LiquidityType): string {
  if (liquidityType === "integral-manual") {
    return "MANUAL_CONCENTRATED_RISK_STRING";
  } else if (liquidityType === "integral") {
    return "MODERATE_LOW_RISK_STRING";
  } else if (liquidityType === "classic-volatile") {
    return "CLASSIC_VOLATILE_RISK_STRING";
  }
  throw new Error(`Unsupported liquidityType: ${liquidityType}`);
}

function getStrategist(liquidityType: LiquidityType): "Hydrex" | "Ichi" {
  if (liquidityType === "integral-manual" || liquidityType === "classic-volatile") {
    return "Hydrex";
  } else if (liquidityType === "integral") {
    return "Ichi";
  }
  throw new Error(`Unsupported liquidityType: ${liquidityType}`);
}

async function main() {
  const poolAddress = process.argv[2];
  const liquidityType = process.argv[3] as LiquidityType;

  if (!poolAddress || !liquidityType) {
    console.error("Usage: npm run add-pool <poolAddress> <liquidityType>");
    console.error("liquidityType must be one of: integral-manual, integral, classic-volatile");
    process.exit(1);
  }

  if (!["integral-manual", "integral", "classic-volatile"].includes(liquidityType)) {
    console.error("liquidityType must be one of: integral-manual, integral, classic-volatile");
    process.exit(1);
  }

  let checksummedAddress: `0x${string}`;
  try {
    checksummedAddress = getAddress(poolAddress);
  } catch (e) {
    console.error("Invalid pool address");
    process.exit(1);
  }

  // Use environment variable or fallback to public RPC
  const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
  
  // Create client
  const client = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  console.log(`Fetching pool data for ${checksummedAddress}...`);

  try {
    // Fetch token addresses from pool
    let token0Address: string;
    let token1Address: string;
    let depositToken: string | undefined;

    if (liquidityType === "integral") {
      // For Ichi vaults, we need to determine depositToken based on allowToken0
      const [token0, token1, allowToken0] = await Promise.all([
        client.readContract({
          address: checksummedAddress,
          abi: ICHI_VAULT_ABI,
          functionName: 'token0',
        }),
        client.readContract({
          address: checksummedAddress,
          abi: ICHI_VAULT_ABI,
          functionName: 'token1',
        }),
        client.readContract({
          address: checksummedAddress,
          abi: ICHI_VAULT_ABI,
          functionName: 'allowToken0',
        }),
      ]);
      token0Address = token0 as string;
      token1Address = token1 as string;
      // depositToken is token0 if allowToken0 is true, otherwise token1
      depositToken = (allowToken0 as boolean) ? token0Address : token1Address;
    } else {
      // For manual and classic pools
      const [token0, token1] = await Promise.all([
        client.readContract({
          address: checksummedAddress,
          abi: POOL_ABI,
          functionName: 'token0',
        }),
        client.readContract({
          address: checksummedAddress,
          abi: POOL_ABI,
          functionName: 'token1',
        }),
      ]);
      token0Address = token0 as string;
      token1Address = token1 as string;
    }

    // Fetch token info
    console.log("Fetching token information...");
    const [token0Info, token1Info] = await Promise.all([
      getTokenInfo(client, token0Address),
      getTokenInfo(client, token1Address),
    ]);

    console.log(`Token0: ${token0Info.symbol} (${token0Info.address})`);
    console.log(`Token1: ${token1Info.symbol} (${token1Info.address})`);
    if (depositToken) {
      console.log(`Deposit Token: ${depositToken}`);
    }

    // Generate strategy data
    const title = generateTitle(token0Info.symbol, token1Info.symbol);
    const type = getStrategyType(liquidityType);
    const strategist = getStrategist(liquidityType);
    const riskDescription = getRiskDescription(liquidityType);

    console.log(`\nGenerated strategy:`);
    console.log(`Title: ${title}`);
    console.log(`Type: ${type}`);
    console.log(`Strategist: ${strategist}`);

    // Read the strategies file
    const filePath = resolve(__dirname, "../src/strategies/8453.ts");
    const fileContent = readFileSync(filePath, "utf-8");

    // Load strategies to check for duplicates
    const { strategies } = require("../src/strategies/8453.ts");

    if (strategies.find((s: Strategy) => s.address.toLowerCase() === checksummedAddress.toLowerCase())) {
      console.error("Strategy with this address already exists");
      process.exit(1);
    }

    // Create new strategy string with placeholder values for manual entry
    let newStrategyStr = `  {
    chainId: 8453,
    title: "${title}",
    type: "${type}",
    liquidityType: "${liquidityType}",
    strategist: "${strategist}",
    riskLevel: 1, // TODO: Set appropriate risk level
    riskDescription: ${riskDescription},
    address: "${checksummedAddress}",
    token0Address: "${token0Info.address}",
    token1Address: "${token1Info.address}",`;
    
    if (depositToken) {
      newStrategyStr += `\n    depositToken: "${depositToken}",`;
    }
    
    newStrategyStr += `
    tags: [], // TODO: Add appropriate tags
    website: "", // TODO: Add website if applicable
  },`;

    let newFileContent: string;

    // Find insertion point based on liquidityType
    if (liquidityType === "integral-manual") {
      // Insert at the bottom of manual strategies list (before "// ORIGINAL STRATEGIES" comment)
      const originalStrategiesCommentIndex = fileContent.indexOf("// ORIGINAL STRATEGIES");
      
      if (originalStrategiesCommentIndex === -1) {
        console.error("Could not find '// ORIGINAL STRATEGIES' comment");
        process.exit(1);
      }
      
      // Find the last manual strategy by looking backwards from the comment
      // We need to find the last "}," before the blank line and comment
      let searchIndex = originalStrategiesCommentIndex;
      // Skip back past the comment line and blank line
      searchIndex = fileContent.lastIndexOf("\n", searchIndex - 1); // Before comment
      searchIndex = fileContent.lastIndexOf("\n", searchIndex - 1); // Before blank line
      
      // Now find the position right after this newline (start of blank line)
      const insertIndex = searchIndex + 1;
      
      // Insert new strategy at the start of the blank line, which will push the blank line down
      newFileContent = fileContent.slice(0, insertIndex) + newStrategyStr + "\n" + fileContent.slice(insertIndex);
    } else if (liquidityType === "integral" || liquidityType === "classic-volatile") {
      // Insert beneath the wstETH/cbBTC ichi strategy
      // Find the wstETH/cbBTC strategy with liquidityType: "integral"
      const wstETHcbBTCStrategy = strategies.find((s: Strategy) => 
        s.title === "wstETH/cbBTC" && s.liquidityType === "integral"
      );

      if (!wstETHcbBTCStrategy) {
        console.error("Could not find wstETH/cbBTC ichi strategy");
        process.exit(1);
      }

      const searchStr = `address: "${wstETHcbBTCStrategy.address}"`;
      const addressIndex = fileContent.indexOf(searchStr);
      
      // Find the closing brace of this strategy
      const closingBraceIndex = fileContent.indexOf("},", addressIndex);
      const insertIndex = fileContent.indexOf("\n", closingBraceIndex) + 1;
      
      newFileContent = fileContent.slice(0, insertIndex) + newStrategyStr + fileContent.slice(insertIndex);
    } else {
      console.error("Unsupported liquidityType");
      process.exit(1);
    }

    // Write the updated file
    writeFileSync(filePath, newFileContent);
    console.log(`\n✓ Strategy added to src/strategies/8453.ts`);
    console.log(`\n${"=".repeat(60)}`);
    console.log(`ACTION REQUIRED: Please manually update the following fields:`);
    console.log(`${"=".repeat(60)}`);
    console.log(`\n1. riskLevel: Set appropriate risk level (1-10)`);
    console.log(`   - 1: Very low risk (stable pairs)`);
    console.log(`   - 2-4: Low to moderate risk (correlated assets)`);
    console.log(`   - 5-7: Moderate to high risk (uncorrelated assets)`);
    console.log(`   - 8-10: High risk (exotic/volatile pairs)`);
    console.log(`\n2. tags: Add appropriate tags from the following options:`);
    console.log(`   - "stable", "correlated", "bluechip", "memecoin"`);
    console.log(`   - "ecosystem", "safe", "standard", "exotic", "zora-creator"`);
    console.log(`\n3. website: Add website URL if applicable (optional)`);
    console.log(`   - Remove the line if no website is available`);
    console.log(`\nStrategy details:`);
    console.log(`  Address: ${checksummedAddress}`);
    console.log(`  Title: ${title}`);
    console.log(`  Type: ${type}`);
    console.log(`  Liquidity Type: ${liquidityType}`);
    console.log(`${"=".repeat(60)}\n`);

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
