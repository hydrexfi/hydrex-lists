import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { tokens } from './tokens/8453';
import { Token } from './types';

/*
* Run `npm run validate-tokens:N` where N is 1-6 to validate a specific segment of tokens
* Example: `npm run validate-tokens:1` will validate the first 50 tokens
*/

const ERC20_ABI = [
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Configuration
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
const DELAY_BETWEEN_TOKENS = parseInt(process.env.DELAY_MS || '2000'); // 2 second delay between tokens
const CONTRACT_CALL_TIMEOUT = 15000; // 15 second timeout for contract calls
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 2000; // Base delay

// Initialize viem client with retry configuration
const client = createPublicClient({
  chain: base,
  transport: http(RPC_URL, {
    retryCount: 0,
    timeout: CONTRACT_CALL_TIMEOUT,
  }),
});

interface ValidationResult {
  token: Token;
  isValid: boolean;
  errors: string[];
  onChainData?: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

interface ValidationSummary {
  totalTokens: number;
  validTokens: number;
  invalidTokens: number;
  errorTokens: number;
  results: ValidationResult[];
}

// Retry a function with exponential backoff for rate limiting
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelay: number = RETRY_DELAY_BASE
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a rate limit error
      const isRateLimit = lastError.message.includes('rate limit') || 
                         lastError.message.includes('429') ||
                         lastError.message.includes('too many requests');
      
      if (!isRateLimit || attempt === maxRetries) {
        throw lastError;
      }
      
      // Exponential backoff: 2s, 4s, 8s
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`  ⏳ Rate limited, retrying in ${delay/1000}s... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Validate token's metadata onchain
async function validateToken(token: Token): Promise<ValidationResult> {
  const result: ValidationResult = {
    token,
    isValid: false,
    errors: [],
  };

  try {
    // Validate address format
    if (!token.address || !token.address.match(/^0x[a-fA-F0-9]{40}$/)) {
      result.errors.push(`Invalid address format: ${token.address}`);
      return result;
    }

    console.log(`Validating ${token.symbol} (${token.address})...`);

    // Fetch onchain data sequentially with retry
    let onChainName: string | null = null;
    let onChainSymbol: string | null = null;
    let onChainDecimals: number | null = null;

    // Fetch name with retry
    try {
      onChainName = await retryWithBackoff(() =>
        client.readContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'name',
        })
      ) as string;
    } catch (err) {
      console.log(`  Failed to fetch name: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Delay between calls
    await new Promise(resolve => setTimeout(resolve, 200));

    // Fetch symbol with retry
    try {
      onChainSymbol = await retryWithBackoff(() =>
        client.readContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'symbol',
        })
      ) as string;
    } catch (err) {
      console.log(`  Failed to fetch symbol: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Delay between calls
    await new Promise(resolve => setTimeout(resolve, 200));

    // Fetch decimals with retry
    try {
      onChainDecimals = await retryWithBackoff(() =>
        client.readContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'decimals',
        })
      ) as number;
    } catch (err) {
      console.log(`  Failed to fetch decimals: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Store onchain data for comparison
    if (onChainName !== null && onChainSymbol !== null && onChainDecimals !== null) {
      result.onChainData = {
        name: onChainName as string,
        symbol: onChainSymbol as string,
        decimals: Number(onChainDecimals),
      };
      console.log(`  On-chain: ${onChainName} | ${onChainSymbol} | ${onChainDecimals} decimals`);
    }

    // Validate each field
    if (onChainName === null) {
      result.errors.push('Failed to fetch token name from contract');
    } else if (onChainName !== token.name) {
      result.errors.push(`Name mismatch: expected "${token.name}", got "${onChainName}"`);
    }

    if (onChainSymbol === null) {
      result.errors.push('Failed to fetch token symbol from contract');
    } else if (onChainSymbol !== token.symbol) {
      result.errors.push(`Symbol mismatch: expected "${token.symbol}", got "${onChainSymbol}"`);
    }

    if (onChainDecimals === null) {
      result.errors.push('Failed to fetch token decimals from contract');
    } else if (Number(onChainDecimals) !== token.decimals) {
      result.errors.push(`Decimals mismatch: expected ${token.decimals}, got ${Number(onChainDecimals)}`);
    }

    // Valid if no errors
    result.isValid = result.errors.length === 0;

    if (result.isValid) {
      console.log(`  ✅ Valid`);
    } else {
      console.log(`  ❌ Invalid: ${result.errors.join(', ')}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Contract call failed: ${errorMessage}`);
    result.errors.push(`Contract call failed: ${errorMessage}`);
  }

  return result;
}

// Validate tokens sequentially to avoid rate limiting
async function validateTokensBatch(tokens: Token[]): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  
  console.log(`Starting validation of ${tokens.length} tokens...`);
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    console.log(`\n[${i + 1}/${tokens.length}]`);
    
    try {
      const result = await validateToken(token);
      results.push(result);
    } catch (error) {
      results.push({
        token,
        isValid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
      });
    }
    
    // Add RPC rate limit delay between tokens
    if (i < tokens.length - 1) {
      console.log(`  ⏳ Waiting ${DELAY_BETWEEN_TOKENS/1000}s before next token...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TOKENS));
    }
  }
  
  return results;
}

// Get tokens in 50 token segments
function getTokenSegment(segmentNumber: number): Token[] {
  const SEGMENT_SIZE = 50;
  const startIndex = (segmentNumber - 1) * SEGMENT_SIZE;
  const maxSegments = Math.ceil(tokens.length / SEGMENT_SIZE);
  
  if (segmentNumber < 1 || segmentNumber > maxSegments) {
    throw new Error(`Segment ${segmentNumber} is out of range. Available segments: 1-${maxSegments}`);
  }
  
  return tokens.slice(startIndex, startIndex + SEGMENT_SIZE);
}

// Generate summary report
function generateSummary(results: ValidationResult[]): ValidationSummary {
  const validTokens = results.filter(r => r.isValid).length;
  const invalidTokens = results.filter(r => !r.isValid && r.errors.length > 0).length;
  const errorTokens = results.filter(r => r.errors.some(e => e.includes('Contract call failed'))).length;
  
  return {
    totalTokens: results.length,
    validTokens,
    invalidTokens,
    errorTokens,
    results,
  };
}

// Print validation results to terminal
function printResults(summary: ValidationSummary) {
  console.log('\n' + '='.repeat(60));
  console.log('TOKEN VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total tokens: ${summary.totalTokens}`);
  console.log(`Valid tokens: ${summary.validTokens} (${((summary.validTokens / summary.totalTokens) * 100).toFixed(2)}%)`);
  console.log(`Invalid tokens: ${summary.invalidTokens} (${((summary.invalidTokens / summary.totalTokens) * 100).toFixed(2)}%)`);
  console.log(`Error tokens: ${summary.errorTokens} (${((summary.errorTokens / summary.totalTokens) * 100).toFixed(2)}%)`);
  
  // Show invalid tokens
  const invalidResults = summary.results.filter(r => !r.isValid);
  if (invalidResults.length > 0) {
    console.log('\n' + '-'.repeat(40));
    console.log('INVALID TOKENS:');
    console.log('-'.repeat(40));
    
    invalidResults.forEach(result => {
      console.log(`\n❌ ${result.token.symbol} (${result.token.address})`);
      console.log(`   Name: ${result.token.name}`);
      
      if (result.onChainData) {
        console.log(`   On-chain: ${result.onChainData.name} | ${result.onChainData.symbol} | ${result.onChainData.decimals} decimals`);
      }
      
      result.errors.forEach(error => {
        console.log(`   ⚠️  ${error}`);
      });
    });
  }
}

// Validate tokens by segment
async function main() {
  const args = process.argv.slice(2);
  const segmentArg = args.find(arg => arg.startsWith('--segment='));
  const segmentNumber = segmentArg ? parseInt(segmentArg.split('=')[1]) : undefined;
  
  if (!segmentNumber) {
    console.error('Error: Segment number is required. Use --segment=N where N is 1-6');
    process.exit(1);
  }

  let tokensToValidate: Token[];
  let validationScope: string;
  
  try {
    tokensToValidate = getTokenSegment(segmentNumber);
    validationScope = `Segment ${segmentNumber} (tokens ${(segmentNumber - 1) * 50 + 1}-${Math.min(segmentNumber * 50, tokens.length)})`;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  
  console.log(`Starting validation: ${validationScope}`);
  console.log(`Total tokens: ${tokensToValidate.length} | Delay: ${DELAY_BETWEEN_TOKENS/1000}s`);
  
  try {
    const results = await validateTokensBatch(tokensToValidate);
    const summary = generateSummary(results);
    
    printResults(summary);
    
    // Exit with error code if there are invalid tokens
    process.exit(summary.invalidTokens > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('Validation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export {
  validateToken,
  getTokenSegment,
  type ValidationResult,
  type ValidationSummary,
};
