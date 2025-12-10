import { createPublicClient, http, isAddress, Address } from 'viem';
import { base } from 'viem/chains';
import { strategies } from '../src/strategies/8453';

/**
 * Run: npm run validate-gauge <poolAddress>
 * 
 * This script validates that a pool address:
 * 1. Has a valid gauge address (not 0x0000...)
 * 2. Has a valid effective config for the oHYDX token
 * 3. Has correct token0 and token1 addresses in the strategies file
 */

const VOTER_CONTRACT = '0xc69E3eF39E3fFBcE2A1c570f8d3ADF76909ef17b';
const REWARDS_DISTRIBUTOR_CONTRACT = '0xf5E821da09616b4c576f7dfD0D85D28B5B591589';
const OHYDX_TOKEN = '0xA1136031150E50B015b41f1ca6B2e99e49D8cB78';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const VOTER_ABI = [
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'gauges',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const REWARDS_DISTRIBUTOR_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'gauge', type: 'address' },
      { internalType: 'address', name: 'token', type: 'address' },
    ],
    name: 'getEffectiveConfig',
    outputs: [
      { internalType: 'uint256', name: 'rewardRate', type: 'uint256' },
      { internalType: 'uint256', name: 'rewardAmount', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

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

const client = createPublicClient({
  chain: base,
  transport: http(process.env.RPC_URL),
});

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

async function validateGauge(poolAddress: string): Promise<void> {
  console.log('\n🔍 Validating Gauge Configuration\n');
  console.log('='.repeat(60));
  
  // Validate input
  if (!isAddress(poolAddress)) {
    console.error('❌ Invalid pool address format');
    process.exit(1);
  }

  console.log(`Pool Address: ${poolAddress}`);
  console.log('='.repeat(60));

  try {
    // Step 1: Get gauge address from Voter contract
    console.log('\n📍 Step 1: Fetching gauge address from Voter contract...');
    const gaugeAddress = await client.readContract({
      address: VOTER_CONTRACT,
      abi: VOTER_ABI,
      functionName: 'gauges',
      args: [poolAddress as Address],
    });

    console.log(`   Gauge Address: ${gaugeAddress}`);

    // Check if gauge address is zero address
    if (normalizeAddress(gaugeAddress) === normalizeAddress(ZERO_ADDRESS)) {
      console.error('\n❌ FAILED: Gauge address is zero address (0x0000...)');
      console.error('   This pool does not have a gauge configured.');
      process.exit(1);
    }

    console.log('   ✅ Valid gauge address found');

    // Step 2: Get effective config from RewardsDistributor
    console.log('\n📍 Step 2: Fetching effective config from RewardsDistributor...');
    console.log(`   Token: ${OHYDX_TOKEN} (oHYDX)`);
    
    const config = await client.readContract({
      address: REWARDS_DISTRIBUTOR_CONTRACT,
      abi: REWARDS_DISTRIBUTOR_ABI,
      functionName: 'getEffectiveConfig',
      args: [gaugeAddress, OHYDX_TOKEN as Address],
    });

    const [rewardRate, rewardAmount] = config;
    console.log(`   Reward Rate: ${rewardRate.toString()}`);
    console.log(`   Reward Amount: ${rewardAmount.toString()}`);

    // Check if config exists (both values should be non-zero for active config)
    if (rewardRate === BigInt(0) && rewardAmount === BigInt(0)) {
      console.warn('\n ⚠️ WARNING: Config exists but both reward rate and amount are zero');
      console.warn('   This gauge may not have active rewards configured.');
    } else {
      console.log('   ✅ Valid config found');
    }

    // Step 3: Get token0 and token1 from pool contract
    console.log('\n📍 Step 3: Fetching token addresses from pool contract...');
    
    const [token0, token1] = await Promise.all([
      client.readContract({
        address: poolAddress as Address,
        abi: POOL_ABI,
        functionName: 'token0',
      }),
      client.readContract({
        address: poolAddress as Address,
        abi: POOL_ABI,
        functionName: 'token1',
      }),
    ]);

    console.log(`   Token0: ${token0}`);
    console.log(`   Token1: ${token1}`);

    // Step 4: Verify against strategies file
    console.log('\n📍 Step 4: Verifying against strategies file...');
    
    const strategy = strategies.find(
      s => normalizeAddress(s.address) === normalizeAddress(poolAddress)
    );

    if (!strategy) {
      console.error(`\n❌ FAILED: Pool address ${poolAddress} not found in strategies file`);
      console.error('   Please add this strategy to src/strategies/8453.ts');
      process.exit(1);
    }

    console.log(`   Strategy found: ${strategy.title}`);
    console.log(`   Strategy token0: ${strategy.token0Address}`);
    console.log(`   Strategy token1: ${strategy.token1Address}`);

    // Compare addresses
    const token0Match = normalizeAddress(strategy.token0Address || '') === normalizeAddress(token0);
    const token1Match = normalizeAddress(strategy.token1Address || '') === normalizeAddress(token1);

    if (!token0Match) {
      console.error('\n❌ FAILED: token0 mismatch!');
      console.error(`   Expected: ${token0}`);
      console.error(`   Got:      ${strategy.token0Address}`);
      process.exit(1);
    }

    if (!token1Match) {
      console.error('\n❌ FAILED: token1 mismatch!');
      console.error(`   Expected: ${token1}`);
      console.error(`   Got:      ${strategy.token1Address}`);
      process.exit(1);
    }

    console.log('   ✅ Token addresses match');

    // Success summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ VALIDATION SUCCESSFUL');
    console.log('='.repeat(60));
    console.log(`\nPool: ${poolAddress}`);
    console.log(`Gauge: ${gaugeAddress}`);
    console.log(`Strategy: ${strategy.title}`);
    console.log(`Token0: ${token0}`);
    console.log(`Token1: ${token1}`);
    console.log(`Reward Rate: ${rewardRate.toString()}`);
    console.log(`Reward Amount: ${rewardAmount.toString()}`);
    console.log('\n✨ All checks passed!\n');

  } catch (error) {
    console.error('\n❌ ERROR during validation:');
    console.error(error);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  const poolAddress = process.argv[2];

  if (!poolAddress) {
    console.error('❌ Error: Pool address is required');
    console.error('\nUsage: npm run validate-gauge <poolAddress>');
    console.error('Example: npm run validate-gauge 0xa4b2401dbbf97e3fbda6fb4ef3f4b7a37069232b');
    process.exit(1);
  }

  validateGauge(poolAddress).catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

export { validateGauge };
