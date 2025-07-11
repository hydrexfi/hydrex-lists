import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { tokens as baseTokens } from "./tokens/8453";
import { tokens as baseSepoliaTokens } from "./tokens/84532";
import { strategies as baseStrategies } from "./strategies/8453";
import { strategies as baseSepoliaStrategies } from "./strategies/84532";
import { Badges } from "./badges";
import { Token, TokenList, Strategy, Badge } from "./types";

const outputDir = resolve(__dirname, "../tokens");
const strategiesOutputDir = resolve(__dirname, "../strategies");
const badgesOutputDir = resolve(__dirname, "../badges");

function ensureDirectoryExists(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function writeJsonFile(
  filename: string,
  jsonData: any,
  outputDirectory: string = outputDir
) {
  if (!jsonData) {
    console.error(`❌ No data found for ${filename}`);
    return;
  }

  const outputPath = resolve(outputDirectory, `${filename}.json`);
  writeFileSync(outputPath, JSON.stringify(jsonData, null, 2), "utf-8");
  console.log(`✅ JSON file created: ${outputPath}`);
}

function checkForDuplicateTokens(tokens: Token[]) {
  const tokenKeys = new Set<string>();
  const duplicates: string[] = [];

  tokens.forEach((token) => {
    const key = `${token.chainId}-${token.address}`;
    if (tokenKeys.has(key)) {
      duplicates.push(key);
    } else {
      tokenKeys.add(key);
    }
  });

  if (duplicates.length > 0) {
    throw new Error(`Duplicate tokens found: ${duplicates.join(", ")}`);
  }
}

function checkForDuplicateStrategies(strategies: Strategy[]) {
  const strategyKeys = new Set<string>();
  const duplicates: string[] = [];

  strategies.forEach((strategy) => {
    const key = `${strategy.chainId}-${strategy.address}`;
    if (strategyKeys.has(key)) {
      duplicates.push(key);
    } else {
      strategyKeys.add(key);
    }
  });

  if (duplicates.length > 0) {
    throw new Error(`Duplicate strategies found: ${duplicates.join(", ")}`);
  }
}

function checkForDuplicateBadges(badges: Badge[]) {
  const nftIds = badges.map((badge) => badge.nftId);
  const duplicates: string[] = [];

  nftIds.forEach((id, index) => {
    if (nftIds.indexOf(id) !== index && !duplicates.includes(id)) {
      duplicates.push(id);
    }
  });

  if (duplicates.length > 0) {
    throw new Error(`Duplicate badge nftIds found: ${duplicates.join(", ")}`);
  }
}

const tokenList: TokenList = {
  name: "Hydrex Token List",
  logoURI:
    "https://raw.githubusercontent.com/alma-labs/hydrex-lists/main/assets/tokens/HYDREX.png",
  keywords: ["base", "meme"],
  version: {
    major: 1,
    minor: 0,
    patch: 0,
  },
  tokens: [...baseTokens, ...baseSepoliaTokens],
};

const allStrategies = [...baseStrategies, ...baseSepoliaStrategies];

ensureDirectoryExists(outputDir);
ensureDirectoryExists(strategiesOutputDir);
ensureDirectoryExists(badgesOutputDir);

try {
  checkForDuplicateTokens(baseTokens);
  checkForDuplicateTokens(baseSepoliaTokens);
  checkForDuplicateStrategies(baseStrategies);
  checkForDuplicateStrategies(baseSepoliaStrategies);
  checkForDuplicateBadges(Badges);

  // Write token files
  writeJsonFile("main", tokenList);
  writeJsonFile("8453", baseTokens);
  writeJsonFile("84532", baseSepoliaTokens);

  // Write strategy files
  writeJsonFile("main", allStrategies, strategiesOutputDir);
  writeJsonFile("8453", baseStrategies, strategiesOutputDir);
  writeJsonFile("84532", baseSepoliaStrategies, strategiesOutputDir);

  // Write badges
  writeJsonFile("main", Badges, badgesOutputDir);
} catch (error: any) {
  console.error(`❌ Error processing tokens/strategies: ${error.message}`);
  process.exit(1);
}
