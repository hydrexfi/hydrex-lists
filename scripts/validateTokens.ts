import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { tokens } from '../src/tokens/8453';
import { Token } from '../src/types';

/*
* Run `npm run validate-tokens` to validate all tokens at once using multicalls
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
const RPC_URL = process.env.RPC_URL;
const CONTRACT_CALL_TIMEOUT = 30000; // 30 second timeout for multicalls
const BATCH_SIZE = 20; // Reduced batch size to avoid rate limits (20 tokens = 60 calls per multicall)
const BATCH_DELAY = 3000; // 3 second delay between batches
const MAX_RETRIES = 5; // Increased retries for rate limit handling
const RETRY_DELAY_BASE = 5000; // Increased base delay for retries

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

// Helper function to normalize symbols by removing $ prefix for comparison
function normalizeSymbolForComparison(symbol: string): string {
  return symbol.startsWith('$') ? symbol.slice(1) : symbol;
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
                         lastError.message.includes('too many requests') ||
                         lastError.message.includes('over rate limit') ||
                         lastError.message.includes('rate exceeded') ||
                         lastError.message.includes('throttled');
      
      if (!isRateLimit || attempt === maxRetries) {
        throw lastError;
      }
      
      // Exponential backoff: 5s, 10s, 20s, 40s, 80s
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`  ⏳ Rate limited, retrying in ${delay/1000}s... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Fallback to individual calls if multicall fails
async function validateTokenIndividually(token: Token): Promise<ValidationResult> {
  const validationResult: ValidationResult = {
    token,
    isValid: false,
    errors: [],
  };

  // Validate address format
  if (!token.address || !token.address.match(/^0x[a-fA-F0-9]{40}$/)) {
    validationResult.errors.push(`Invalid address format: ${token.address}`);
    return validationResult;
  }

  console.log(`  Fallback: Validating ${token.symbol} individually...`);

  let onChainName: string | null = null;
  let onChainSymbol: string | null = null;
  let onChainDecimals: number | null = null;

  // Fetch each property individually with delays
  try {
    onChainName = await retryWithBackoff(() =>
      client.readContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'name',
      })
    ) as string;
    await new Promise(resolve => setTimeout(resolve, 500)); // 0.5s delay
  } catch (err) {
    console.log(`    Failed to fetch name: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    onChainSymbol = await retryWithBackoff(() =>
      client.readContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'symbol',
      })
    ) as string;
    await new Promise(resolve => setTimeout(resolve, 500)); // 0.5s delay
  } catch (err) {
    console.log(`    Failed to fetch symbol: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    onChainDecimals = await retryWithBackoff(() =>
      client.readContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals',
      })
    ) as number;
  } catch (err) {
    console.log(`    Failed to fetch decimals: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Process validation result
  if (onChainName !== null && onChainSymbol !== null && onChainDecimals !== null) {
    validationResult.onChainData = {
      name: onChainName,
      symbol: onChainSymbol,
      decimals: Number(onChainDecimals),
    };
  }

  // Validate each field
  if (onChainName === null) {
    validationResult.errors.push('Failed to fetch token name from contract');
  } else if (onChainName !== token.name) {
    validationResult.errors.push(`Name mismatch: expected "${token.name}", got "${onChainName}"`);
  }

  if (onChainSymbol === null) {
    validationResult.errors.push('Failed to fetch token symbol from contract');
  } else if (normalizeSymbolForComparison(onChainSymbol) !== normalizeSymbolForComparison(token.symbol)) {
    validationResult.errors.push(`Symbol mismatch: expected "${token.symbol}", got "${onChainSymbol}"`);
  }

  if (onChainDecimals === null) {
    validationResult.errors.push('Failed to fetch token decimals from contract');
  } else if (Number(onChainDecimals) !== token.decimals) {
    validationResult.errors.push(`Decimals mismatch: expected ${token.decimals}, got ${Number(onChainDecimals)}`);
  }

  validationResult.isValid = validationResult.errors.length === 0;
  return validationResult;
}

// Validate tokens using multicall for efficient batch processing
async function validateTokensBatch(tokenBatch: Token[]): Promise<ValidationResult[]> {
  console.log(`\nValidating batch of ${tokenBatch.length} tokens using multicall...`);
  
  // Prepare multicall contracts for each token
  const contracts = tokenBatch.flatMap(token => [
    {
      address: token.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'name',
    },
    {
      address: token.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'symbol',
    },
    {
      address: token.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals',
    },
  ]);

  try {
    // Execute multicall with retry logic
    const results = await retryWithBackoff(() =>
      client.multicall({
        contracts,
        allowFailure: true,
      })
    );

    // Process results and create validation results
    const validationResults: ValidationResult[] = [];
    
    for (let i = 0; i < tokenBatch.length; i++) {
      const token = tokenBatch[i];
      const nameResult = results[i * 3];
      const symbolResult = results[i * 3 + 1];
      const decimalsResult = results[i * 3 + 2];
      
      const validationResult: ValidationResult = {
        token,
        isValid: false,
        errors: [],
      };

      // Validate address format
      if (!token.address || !token.address.match(/^0x[a-fA-F0-9]{40}$/)) {
        validationResult.errors.push(`Invalid address format: ${token.address}`);
        validationResults.push(validationResult);
        continue;
      }

      console.log(`Validating ${token.symbol} (${token.address})...`);

      // Extract on-chain data from multicall results
      let onChainName: string | null = null;
      let onChainSymbol: string | null = null;
      let onChainDecimals: number | null = null;

      if (nameResult.status === 'success') {
        onChainName = nameResult.result as string;
      } else {
        console.log(`  Failed to fetch name: ${nameResult.error?.message || 'Unknown error'}`);
      }

      if (symbolResult.status === 'success') {
        onChainSymbol = symbolResult.result as string;
      } else {
        console.log(`  Failed to fetch symbol: ${symbolResult.error?.message || 'Unknown error'}`);
      }

      if (decimalsResult.status === 'success') {
        onChainDecimals = Number(decimalsResult.result);
      } else {
        console.log(`  Failed to fetch decimals: ${decimalsResult.error?.message || 'Unknown error'}`);
      }

      // Store onchain data for comparison
      if (onChainName !== null && onChainSymbol !== null && onChainDecimals !== null) {
        validationResult.onChainData = {
          name: onChainName,
          symbol: onChainSymbol,
          decimals: onChainDecimals,
        };
        console.log(`  On-chain: ${onChainName} | ${onChainSymbol} | ${onChainDecimals} decimals`);
      }

      // Validate each field
      if (onChainName === null) {
        validationResult.errors.push('Failed to fetch token name from contract');
      } else if (onChainName !== token.name) {
        validationResult.errors.push(`Name mismatch: expected "${token.name}", got "${onChainName}"`);
      }

      if (onChainSymbol === null) {
        validationResult.errors.push('Failed to fetch token symbol from contract');
      } else if (normalizeSymbolForComparison(onChainSymbol) !== normalizeSymbolForComparison(token.symbol)) {
        validationResult.errors.push(`Symbol mismatch: expected "${token.symbol}", got "${onChainSymbol}"`);
      }

      if (onChainDecimals === null) {
        validationResult.errors.push('Failed to fetch token decimals from contract');
      } else if (onChainDecimals !== token.decimals) {
        validationResult.errors.push(`Decimals mismatch: expected ${token.decimals}, got ${onChainDecimals}`);
      }

      // Valid if no errors
      validationResult.isValid = validationResult.errors.length === 0;

      if (validationResult.isValid) {
        console.log(`  ✅ Valid`);
      } else {
        console.log(`  ❌ Invalid: ${validationResult.errors.join(', ')}`);
      }

      validationResults.push(validationResult);
    }
    
    return validationResults;
    
  } catch (error) {
    console.error(`Multicall failed for batch: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`Falling back to individual validation for ${tokenBatch.length} tokens...`);
    
    // Fallback to individual validation for each token
    const fallbackResults: ValidationResult[] = [];
    for (const token of tokenBatch) {
      try {
        const result = await validateTokenIndividually(token);
        fallbackResults.push(result);
        // Small delay between individual calls
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (fallbackError) {
        fallbackResults.push({
          token,
          isValid: false,
          errors: [`Individual validation failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`],
        });
      }
    }
    return fallbackResults;
  }
}

// Validate all tokens efficiently using multicalls
async function validateAllTokens(): Promise<ValidationResult[]> {
  const allResults: ValidationResult[] = [];
  
  console.log(`Starting validation of ${tokens.length} tokens using multicalls...`);
  console.log(`Processing in batches of ${BATCH_SIZE} tokens`);
  
  // Process tokens in batches to avoid overwhelming the RPC
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tokens.length / BATCH_SIZE);
    
    console.log(`\n[Batch ${batchNumber}/${totalBatches}] Processing tokens ${i + 1}-${Math.min(i + BATCH_SIZE, tokens.length)}`);
    
    try {
      const batchResults = await validateTokensBatch(batch);
      allResults.push(...batchResults);
      
      // Add delay between batches to avoid rate limits
      if (i + BATCH_SIZE < tokens.length) {
        console.log(`  ⏳ Waiting ${BATCH_DELAY/1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    } catch (error) {
      console.error(`Failed to process batch ${batchNumber}:`, error);
      
      // Add error results for this batch
      const errorResults = batch.map(token => ({
        token,
        isValid: false,
        errors: [`Batch processing failed: ${error instanceof Error ? error.message : String(error)}`],
      }));
      allResults.push(...errorResults);
    }
  }
  
  return allResults;
}

// Generate summary report
function generateSummary(results: ValidationResult[]): ValidationSummary {
  const validTokens = results.filter(r => r.isValid).length;
  const invalidTokens = results.filter(r => !r.isValid && r.errors.length > 0).length;
  const errorTokens = results.filter(r => r.errors.some(e => e.includes('failed') || e.includes('Multicall failed'))).length;
  
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

// Main validation function
async function main() {
  try {
    const results = await validateAllTokens();
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
  validateTokensBatch,
  validateAllTokens,
  type ValidationResult,
  type ValidationSummary,
};
