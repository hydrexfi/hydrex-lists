import { Token } from "../types";

// MAKE SURE TO EXPORT AT BOTTOM OF FILE

export const WETH: Token = {
  chainId: 84532,
  address: "0x4200000000000000000000000000000000000006",
  name: "Wrapped Ether",
  symbol: "WETH",
  decimals: 18,
  logoURI:
    "https://raw.githubusercontent.com/alma-labs/hydrex-lists/main/assets/tokens/WETH.png",
};

export const USDC: Token = {
  chainId: 84532,
  address: "0x26336351DB798dd9BEA02ec1a4B2C81fDa0BD894",
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
  logoURI:
    "https://raw.githubusercontent.com/alma-labs/hydrex-lists/main/assets/tokens/USDC.png",
};

export const USDC_ALT: Token = {
  chainId: 84532,
  address: "0xAbAc6f23fdf1313FC2E9C9244f666157CcD32990",
  name: "Coinbase USD",
  symbol: "USDC",
  decimals: 6,
  logoURI:
    "https://raw.githubusercontent.com/alma-labs/hydrex-lists/main/assets/tokens/USDC.png",
};

export const USDC_ICHI: Token = {
  chainId: 84532,
  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  name: "Ichi USD",
  symbol: "USDC",
  decimals: 6,
  logoURI:
    "https://raw.githubusercontent.com/alma-labs/hydrex-lists/main/assets/tokens/USDC.png",
};

export const cbBTC: Token = {
  chainId: 84532,
  address: "0x2b7a959451C7b2C3029966a6526aab939fe9E863",
  name: "Coinbase BTC",
  symbol: "cbBTC",
  decimals: 18,
  logoURI:
    "https://raw.githubusercontent.com/alma-labs/hydrex-lists/main/assets/tokens/CBBTC.png",
};

export const LINK: Token = {
  chainId: 84532,
  address: "0xE4aB69C077896252FAFBD49EFD26B5D171A32410",
  name: "Chainlink",
  symbol: "LINK",
  decimals: 18,
  logoURI:
    "https://raw.githubusercontent.com/alma-labs/hydrex-lists/main/assets/tokens/LINK.png",
};

export const EURC: Token = {
  chainId: 84532,
  address: "0x808456652fdb597867f38412077A9182bf77359F",
  name: "Euro Coin",
  symbol: "EURC",
  decimals: 6,
  logoURI:
    "https://raw.githubusercontent.com/alma-labs/hydrex-lists/main/assets/tokens/EURC.png",
};

export const tokens: Token[] = [
  WETH,
  USDC,
  USDC_ALT,
  cbBTC,
  LINK,
  EURC,
  USDC_ICHI,
];
