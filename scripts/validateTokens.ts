import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { tokens } from '../src/tokens/8453';
import { Token } from '../src/types';

/**
 * Run: npm run validate-tokens to validate all tokens
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

const BATCH_SIZE = 20;
const BATCH_DELAY = 3000;
const MAX_RETRIES = 8;
const RETRY_DELAY_BASE = 3000;

const client = createPublicClient({
  chain: base,
  transport: http(process.env.RPC_URL, {
    retryCount: 0,
    timeout: 30000,
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

// Normalize symbols for comparison (strip $ prefix)
function normalizeSymbol(symbol: string): string {
  return symbol.startsWith('$') ? symbol.slice(1) : symbol;
}

// Retry with exponential backoff and rate limit detection
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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
      
      if (attempt === MAX_RETRIES - 1) break;
      
      // Use longer delays for rate limits, shorter for other errors
      const baseDelay = isRateLimit ? RETRY_DELAY_BASE * 2 : RETRY_DELAY_BASE;
      const delay = baseDelay * Math.pow(2, attempt);
      
      console.log(`  ${isRateLimit ? 'Rate limited' : 'Error'}, retrying in ${delay/1000}s... (${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Validate a batch of tokens using multicall
async function validateBatch(batch: Token[]): Promise<ValidationResult[]> {
  console.log(`\nValidating ${batch.length} tokens...`);
  
  const contracts = batch.flatMap(token => [
    { address: token.address as `0x${string}`, abi: ERC20_ABI, functionName: 'name' },
    { address: token.address as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' },
    { address: token.address as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' },
  ]);

  try {
    const results = await retry(() => 
      client.multicall({ contracts, allowFailure: true })
    );

    return batch.map((token, i) => {
      const [nameResult, symbolResult, decimalsResult] = results.slice(i * 3, i * 3 + 3);
      
      const validationResult: ValidationResult = {
        token,
        isValid: false,
        errors: [],
      };

      // Extract on-chain data
      const onChainName = nameResult.status === 'success' ? nameResult.result as string : null;
      const onChainSymbol = symbolResult.status === 'success' ? symbolResult.result as string : null;
      const onChainDecimals = decimalsResult.status === 'success' ? Number(decimalsResult.result) : null;

      if (onChainName && onChainSymbol && onChainDecimals !== null) {
        validationResult.onChainData = {
          name: onChainName,
          symbol: onChainSymbol,
          decimals: onChainDecimals,
        };
      }

      // Validate fields
      if (!onChainName) {
        validationResult.errors.push('Failed to fetch name');
      } else if (onChainName !== token.name) {
        validationResult.errors.push(`Name mismatch: expected "${token.name}", got "${onChainName}"`);
      }

      if (!onChainSymbol) {
        validationResult.errors.push('Failed to fetch symbol');
      } else if (normalizeSymbol(onChainSymbol) !== normalizeSymbol(token.symbol)) {
        validationResult.errors.push(`Symbol mismatch: expected "${token.symbol}", got "${onChainSymbol}"`);
      }

      if (onChainDecimals === null) {
        validationResult.errors.push('Failed to fetch decimals');
      } else if (onChainDecimals !== token.decimals) {
        validationResult.errors.push(`Decimals mismatch: expected ${token.decimals}, got ${onChainDecimals}`);
      }

      validationResult.isValid = validationResult.errors.length === 0;
      
      console.log(`${validationResult.isValid ? '✅' : '❌'} ${token.symbol}`);
      
      return validationResult;
    });
    
  } catch (error) {
    console.error(`Batch failed: ${error}`);
    return batch.map(token => ({
      token,
      isValid: false,
      errors: [`Validation failed: ${error}`],
    }));
  }
}

// Main validation function
async function validateAllTokens(): Promise<void> {
  console.log(`Starting validation of ${tokens.length} tokens...`);
  
  const allResults: ValidationResult[] = [];
  const totalBatches = Math.ceil(tokens.length / BATCH_SIZE);
  
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    
    console.log(`\n[${batchNumber}/${totalBatches}] Processing tokens ${i + 1}-${Math.min(i + BATCH_SIZE, tokens.length)}`);
    
    const batchResults = await validateBatch(batch);
    allResults.push(...batchResults);
    
    // Delay between batches
    if (i + BATCH_SIZE < tokens.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  
  // Summary
  const validTokens = allResults.filter(r => r.isValid).length;
  const invalidTokens = allResults.filter(r => !r.isValid).length;
  
  console.log('\n' + '='.repeat(50));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total: ${allResults.length}`);
  console.log(`Valid: ${validTokens} (${((validTokens / allResults.length) * 100).toFixed(1)}%)`);
  console.log(`Invalid: ${invalidTokens} (${((invalidTokens / allResults.length) * 100).toFixed(1)}%)`);
  
  // Show invalid tokens
  const invalidResults = allResults.filter(r => !r.isValid);
  if (invalidResults.length > 0) {
    console.log('\nINVALID TOKENS:');
    invalidResults.forEach(result => {
      console.log(`\n❌ ${result.token.symbol} (${result.token.address})`);
      result.errors.forEach(error => console.log(`   ${error}`));
    });
  }
  
  process.exit(invalidTokens > 0 ? 1 : 0);
}

// Run validation
if (require.main === module) {
  validateAllTokens().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

export { validateBatch, validateAllTokens, type ValidationResult };