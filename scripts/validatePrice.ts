/**
 * Price Validation Script using DexScreener API with GeckoTerminal fallback
 * 
 * Usage: npm run validate-price <token0Address> <token1Address>
 * 
 * How it works:
 * 1. Fetches all trading pairs for each token from DexScreener
 * 2. If DexScreener fails, falls back to GeckoTerminal API
 * 3. Filters pairs by the specified chain
 * 4. Selects the most liquid pair for accurate pricing
 * 5. Calculates USD price for each token (handling both base and quote positions)
 * 6. Displays conversion rate between the two tokens
 */

const DEXSCREENER_API_BASE = 'https://api.dexscreener.com';
const GECKOTERMINAL_API_BASE = 'https://api.geckoterminal.com/api/v2';
const DEFAULT_CHAIN_ID = 'base';

interface DexScreenerTokenPair {
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
    usd?: number;
    base?: number;
    quote?: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerTokenPair[] | null;
}

interface GeckoTerminalTokenData {
  id: string;
  type: string;
  attributes: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    total_supply: string;
    price_usd: string;
    fdv_usd: string;
    total_reserve_in_usd: string;
    volume_usd: {
      h24: string;
    };
    market_cap_usd: string | null;
  };
}

interface GeckoTerminalResponse {
  data: GeckoTerminalTokenData;
}

async function fetchTokenPriceFromGeckoTerminal(
  tokenAddress: string
): Promise<{ priceUsd: number; symbol: string; name: string; source: string } | null> {
  const url = `${GECKOTERMINAL_API_BASE}/networks/${DEFAULT_CHAIN_ID}/tokens/${tokenAddress}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json;version=20230203',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.error(`GeckoTerminal: Token ${tokenAddress} not found on Base`);
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: GeckoTerminalResponse = await response.json();

    if (!data.data || !data.data.attributes.price_usd) {
      console.error(`GeckoTerminal: No price data available for token ${tokenAddress}`);
      return null;
    }

    const priceUsd = parseFloat(data.data.attributes.price_usd);
    
    if (isNaN(priceUsd) || priceUsd === 0) {
      console.error(`GeckoTerminal: Invalid price for token ${tokenAddress}`);
      return null;
    }

    return {
      priceUsd,
      symbol: data.data.attributes.symbol,
      name: data.data.attributes.name,
      source: 'GeckoTerminal',
    };
  } catch (error) {
    console.error(`GeckoTerminal: Error fetching price for ${tokenAddress}:`, error);
    return null;
  }
}

async function fetchTokenPrice(
  chainId: string,
  tokenAddress: string
): Promise<{ priceUsd: number; symbol: string; name: string; source: string } | null> {
  // Use the chain-specific endpoint instead
  const url = `${DEXSCREENER_API_BASE}/latest/dex/tokens/${tokenAddress}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: DexScreenerResponse = await response.json();

    if (!data.pairs || data.pairs.length === 0) {
      console.error(`DexScreener: No trading pairs found for token ${tokenAddress}`);
      console.log(`Trying GeckoTerminal as fallback...`);
      return await fetchTokenPriceFromGeckoTerminal(tokenAddress);
    }

    // Filter pairs by chainId and find the one with highest liquidity
    const chainPairs = data.pairs.filter((pair) => pair.chainId === chainId);

    if (chainPairs.length === 0) {
      console.error(`DexScreener: No trading pairs found for token ${tokenAddress} on chain ${chainId}`);
      console.log(`Available chains for this token:`, [...new Set(data.pairs.map(p => p.chainId))].join(', '));
      console.log(`Trying GeckoTerminal as fallback...`);
      return await fetchTokenPriceFromGeckoTerminal(tokenAddress);
    }

    // Sort by liquidity (USD) and get the most liquid pair
    const bestPair = chainPairs.sort((a, b) => {
      const aLiquidity = a.liquidity?.usd || 0;
      const bLiquidity = b.liquidity?.usd || 0;
      return bLiquidity - aLiquidity;
    })[0];

    if (!bestPair.priceUsd) {
      console.error(`DexScreener: No USD price available for token ${tokenAddress}`);
      console.log(`Trying GeckoTerminal as fallback...`);
      return await fetchTokenPriceFromGeckoTerminal(tokenAddress);
    }

    // Determine which token in the pair is our target token and calculate its USD price
    const isBaseToken =
      bestPair.baseToken.address.toLowerCase() === tokenAddress.toLowerCase();
    const tokenInfo = isBaseToken ? bestPair.baseToken : bestPair.quoteToken;
    
    // The priceUsd in the API represents the price of the base token in USD
    // If our token is the quote token, we need to calculate its price differently
    let tokenPriceUsd: number;
    if (isBaseToken) {
      // If our token is the base token, use priceUsd directly
      tokenPriceUsd = parseFloat(bestPair.priceUsd);
    } else {
      // If our token is the quote token, we need to invert the priceNative
      // priceNative = base/quote, so quote price = 1/priceNative * base price
      const priceNative = parseFloat(bestPair.priceNative);
      if (priceNative === 0) {
        console.error(`Invalid priceNative for token ${tokenAddress}`);
        return null;
      }
      tokenPriceUsd = parseFloat(bestPair.priceUsd) / priceNative;
    }

    return {
      priceUsd: tokenPriceUsd,
      symbol: tokenInfo.symbol,
      name: tokenInfo.name,
      source: 'DexScreener',
    };
  } catch (error) {
    console.error(`DexScreener: Error fetching price for ${tokenAddress}:`, error);
    
    // Fallback to GeckoTerminal
    console.log(`Trying GeckoTerminal as fallback...`);
    return await fetchTokenPriceFromGeckoTerminal(tokenAddress);
  }
}

async function validatePriceConversion(
  token0Address: string,
  token1Address: string,
  chainId: string = DEFAULT_CHAIN_ID
): Promise<void> {
  // Check if addresses are identical
  if (token0Address.toLowerCase() === token1Address.toLowerCase()) {
    console.error('❌ Error: Token addresses are identical');
    console.error(`Both token0 and token1 have the same address: ${token0Address}`);
    console.error('Please provide two different token addresses for price comparison.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('PRICE VALIDATION');
  console.log('='.repeat(60));

  // Fetch prices for both tokens (suppress console output during fetch)
  const [token0Data, token1Data] = await Promise.all([
    fetchTokenPrice(chainId, token0Address),
    fetchTokenPrice(chainId, token1Address),
  ]);

  if (!token0Data) {
    console.error(`❌ Failed to fetch price for token0: ${token0Address}`);
    process.exit(1);
  }

  if (!token1Data) {
    console.error(`❌ Failed to fetch price for token1: ${token1Address}`);
    process.exit(1);
  }

  // Display token information
  console.log(`Token0 (${token0Data.symbol}): $${token0Data.priceUsd.toFixed(6)} USD [${token0Data.source}]`);
  console.log(`  Name: ${token0Data.name}`);
  console.log(`  Address: ${token0Address}`);
  console.log('');
  console.log(`Token1 (${token1Data.symbol}): $${token1Data.priceUsd.toFixed(6)} USD [${token1Data.source}]`);
  console.log(`  Name: ${token1Data.name}`);
  console.log(`  Address: ${token1Address}`);
  console.log('');

  // Calculate conversion rate: how much token1 equals 1 token0
  const conversionRate = token0Data.priceUsd / token1Data.priceUsd;

  console.log('='.repeat(60));
  console.log('CONVERSION RATE');
  console.log('='.repeat(60));
  console.log(
    `1 ${token0Data.symbol} = ${conversionRate.toFixed(8)} ${token1Data.symbol}`
  );
  console.log(
    `1 ${token1Data.symbol} = ${(1 / conversionRate).toFixed(8)} ${token0Data.symbol}`
  );
  console.log('='.repeat(60));
}

// Parse command line arguments
if (require.main === module) {
  const args = process.argv.slice(2);
  const [token0Address, token1Address, chainId = DEFAULT_CHAIN_ID] = args;

  validatePriceConversion(token0Address, token1Address, chainId).catch((error) => {
    console.error('Price validation failed:', error);
    process.exit(1);
  });
}

export { validatePriceConversion, fetchTokenPrice };
