export type LiquidityType = "uniV4" | "integral" | "classic-volatile" | "classic-stable" | "morpho" | "integral-manual" | "euler";
export type StrategyType = "Narrow" | "Correlated" | "Long-Short" | "Single Sided" | "Classic" | "Lending" | "Manual";
export type Strategist = "Ichi" | "Gamma" | "Hydrex" | "Morpho" | "Euler";

export type StrategyTag =
  | "stable"
  | "correlated"
  | "bluechip"
  | "memecoin"
  | "ecosystem"
  | "safe"
  | "standard"
  | "exotic"
  | "zora-creator";

export type TokenLiquidity = "exotic" | "low" | "medium" | "high";

export const ETH_NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface Token {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  type?: "stablecoin" | "bluechip" | "zora-creator" | "zora-post";
  liquidity?: TokenLiquidity;
}

export interface TokenList {
  name: string;
  logoURI: string;
  keywords: string[];
  version: {
    major: number;
    minor: number;
    patch: number;
  };
  tokens: Token[];
}

export interface Badge {
  name: string;
  nftId: string;
  image: string; // Main image for the badge
  rewardImage: string;
  description: string;
  fullDescription?: string;
  type:
    | "Tier" // Tier = The main badge flow, no limit, users split a pool of Hydropoints
    | "Activity" // Activity = Limited supply airdrop, participants get a specific allocation
    | "Partner"; // Partner = Rewards based on a metric, usually with a ratio.
  category: "Tier" | "Based" | "Social" | "Memes" | "AI" | "NFT" | "Gaming" | "DeFi";
  minHydropoints: number;
  metric?: string; // Just for showing the metric in the UI
  partnerName?: string; // Just for showing the partner name in the UI
  poolSize?: number; // Shows total planned pool size in UI
  maxSupply?: number; // Impacts Max Supply configuration on smart contract
  externalLink?: string; // Link to the badge on the website
}

export interface Strategy {
  chainId: number;
  title: string;
  type: StrategyType;
  liquidityType: LiquidityType;
  strategist: Strategist;
  address: string;
  riskLevel: number;
  riskDescription: string;
  depositToken?: string;
  token0Address?: string;
  token1Address?: string;
  v4PoolId?: string;
  tags?: StrategyTag[];
  website?: string;
  strategyInfoOverride?: string;
  displayTags?: {
    title: string;
    description?: string;
    image?: string;
    href?: string;
  }[];
}

export const MANUAL_CONCENTRATED_RISK_STRING =
  "This strategy's risk is determined by the user's manual liquidity positioning. Wider strategies incur less impermanent loss, but generally lower yields.";

export const LENDING_RISK_STRING =
  "This strategy is low risk, due to its structure as a lending pool with a single asset causing no impermanent loss.";

export const LOW_RISK_STRING =
  "This strategy is low risk. The assets are highly correlated in price. Please note input proportions vs output proportions may vary.";

export const CLASSIC_VOLATILE_RISK_STRING =
  "This strategy is moderately-low risk, due to its structure as a classic sided liquidity pool with uncorrelated assets. Impermanent loss is possible.";

export const MODERATE_RISK_STRING =
  "This strategy is moderate risk, due to its strategy optimization and the price deviations between the non-correlated assets. Impermanent loss can occur based on price deviations.";

export const MODERATE_LOW_RISK_STRING =
  "This strategy is moderately-low risk, due to its narrow strategy and the price deviations between the non-correlated assets. Impermanent loss is possible.";

export const MODERATE_HIGH_RISK_STRING =
  "This strategy is moderately-high risk, due to its strategy optimization and the potentially significant price deviations between the non-correlated assets. Expect some impermanent loss.";
