/**
 * Pull token0 and token1 from a pool contract.
 *
 * Usage: npm run pull-tokens <poolAddress>
 */

import { createPublicClient, getAddress, http } from "viem";
import { base } from "viem/chains";

const POOL_ABI = [
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ERC20_ABI = [
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const RPC_URL = process.env.RPC_URL || "https://mainnet.base.org";

async function readSymbol(client: any, address: `0x${string}`): Promise<string | undefined> {
  try {
    const symbol = await client.readContract({
      address,
      abi: ERC20_ABI,
      functionName: "symbol",
    });
    return symbol as string;
  } catch {
    return undefined;
  }
}

async function main() {
  const poolAddress = process.argv[2];

  if (!poolAddress) {
    console.error("Usage: npm run pull-tokens <poolAddress>");
    process.exit(1);
  }

  let checksummedPool: `0x${string}`;
  try {
    checksummedPool = getAddress(poolAddress);
  } catch {
    console.error("Invalid pool address");
    process.exit(1);
  }

  const client = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  console.log(`Fetching token0 and token1 for ${checksummedPool}...`);

  const [token0, token1] = await Promise.all([
    client.readContract({
      address: checksummedPool,
      abi: POOL_ABI,
      functionName: "token0",
    }),
    client.readContract({
      address: checksummedPool,
      abi: POOL_ABI,
      functionName: "token1",
    }),
  ]);

  const token0Address = getAddress(token0);
  const token1Address = getAddress(token1);

  const [token0Symbol, token1Symbol] = await Promise.all([
    readSymbol(client, token0Address),
    readSymbol(client, token1Address),
  ]);

  const token0Label = token0Symbol ? ` (${token0Symbol})` : "";
  const token1Label = token1Symbol ? ` (${token1Symbol})` : "";

  console.log(`\ntoken0: ${token0Address}${token0Label}`);
  console.log(`token1: ${token1Address}${token1Label}`);
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
