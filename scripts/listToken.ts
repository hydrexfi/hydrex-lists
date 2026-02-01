import { createPublicClient, http, getAddress, erc20Abi } from "viem";
import { base } from "viem/chains";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { Token } from "../src/types";

async function main() {
  const address = process.argv[2];
  if (!address) {
    console.error("Please provide a token address");
    process.exit(1);
  }

  let checksummedAddress: `0x${string}`;
  try {
    checksummedAddress = getAddress(address);
  } catch (e) {
    console.error("Invalid address");
    process.exit(1);
  }

  const client = createPublicClient({
    chain: base,
    transport: http(),
  });

  try {
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({ address: checksummedAddress, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: checksummedAddress, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: checksummedAddress, abi: erc20Abi, functionName: "decimals" }),
    ]);

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
    const nextToken = unpinned.find((t: Token) => t.symbol.toLowerCase().localeCompare(symbol.toLowerCase()) > 0);

    const newTokenStr = `  {
    chainId: 8453,
    address: "${checksummedAddress}",
    name: "${name}",
    symbol: "${symbol}",
    decimals: ${decimals},
    logoURI: "https://raw.githubusercontent.com/hydrexfi/hydrex-lists/main/assets/tokens/${symbol.toUpperCase()}.png",
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
      
      newFileContent = fileContent.slice(0, openBraceIndex) + newTokenStr + fileContent.slice(openBraceIndex);
    } else {
      // Insert before the last '];'
      const lastBracketIndex = fileContent.lastIndexOf("];");
      newFileContent = fileContent.slice(0, lastBracketIndex) + newTokenStr + fileContent.slice(lastBracketIndex);
    }

    writeFileSync(filePath, newFileContent);
    console.log(`✅ ${symbol} added to 8453.ts`);

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
