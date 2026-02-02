import { createPublicClient, http, isAddress, Address, decodeAbiParameters, parseAbiParameters } from 'viem';
import { base } from 'viem/chains';
import { strategies } from '../src/strategies/8453';

/**
 * Run: npm run validate-gauge <poolAddress>
 * Run: npm run validate-gauge --hash <configHash>
 * 
 * This script validates that a pool address:
 * 1. Has a valid gauge address (not 0x0000...)
 * 2. Has a valid effective config for the oHYDX token
 * 3. Fetches and decodes the Merkl campaign configuration
 * 4. Validates campaign parameters (weights, pool address, etc.)
 * 5. Has correct token0 and token1 addresses in the strategies file
 * 
 * Alternatively, validate a pre-live campaign using its config hash:
 * 1. Fetches campaign config from Merkl API using the hash
 * 2. Decodes and validates campaign parameters
 * 3. Verifies token addresses match the strategies file
 */

const VOTER_CONTRACT = '0xc69E3eF39E3fFBcE2A1c570f8d3ADF76909ef17b';
const REWARDS_DISTRIBUTOR_CONTRACT = '0xf5E821da09616b4c576f7dfD0D85D28B5B591589';
const OHYDX_TOKEN = '0xA1136031150E50B015b41f1ca6B2e99e49D8cB78';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MERKL_API_BASE = 'https://api.merkl.xyz';

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
    name: 'getMerklConfig',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'distributionCreator', type: 'address' },
          { internalType: 'bytes32', name: 'campaignId', type: 'bytes32' },
          { internalType: 'address', name: 'creator', type: 'address' },
          { internalType: 'uint32', name: 'campaignType', type: 'uint32' },
          { internalType: 'uint32', name: 'duration', type: 'uint32' },
          { internalType: 'bytes', name: 'campaignData', type: 'bytes' },
        ],
        internalType: 'struct IIncentiveCampaignManager.MerklConfig',
        name: '',
        type: 'tuple',
      },
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

interface DecodedCampaignData {
  hydrexPool: Address;
  propFees: bigint;
  propToken0: bigint;
  propToken1: bigint;
  isOutOfRangeIncentivized: bigint;
  boostingAddress: Address;
  boostedReward: bigint;
  whitelist: Address[];
  blacklist: Address[];
  extraData: `0x${string}`;
  extraData2: `0x${string}`;
  extraData3: `0x${string}`;
}

interface MerklConfigResponse {
  campaignData?: string;
  config?: {
    hydrexPool?: string;
    propFees?: number;
    propToken0?: number;
    propToken1?: number;
    isOutOfRangeIncentivized?: number;
    boostingAddress?: string;
    boostedReward?: string;
    whitelist?: string[];
    blacklist?: string[];
  };
  // API response format
  poolAddress?: string;
  weightFees?: number;
  weightToken0?: number;
  weightToken1?: number;
  isOutOfRangeIncentivized?: boolean;
  whitelist?: string[];
  blacklist?: string[];
  distributionCreator?: string;
  creator?: string;
  campaignType?: number;
  duration?: number;
  startTimestamp?: number;
  endTimestamp?: number;
  rewardToken?: string;
  amount?: string;
  computeChainId?: number;
}

async function fetchConfigByHash(hash: string): Promise<MerklConfigResponse | null> {
  try {
    console.log(`   Fetching config from Merkl API: ${MERKL_API_BASE}/v4/config/hash/${hash}`);
    const response = await fetch(`${MERKL_API_BASE}/v4/config/hash/${hash}`);
    
    if (!response.ok) {
      console.error(`   ⚠️  API returned status ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('   ⚠️  Error fetching config from Merkl API:', error);
    return null;
  }
}

function decodeCampaignData(campaignData: `0x${string}`): DecodedCampaignData | null {
  try {
    const campaignDataParams = parseAbiParameters([
      'address',      // hydrexPool
      'uint256',      // propFees
      'uint256',      // propToken0
      'uint256',      // propToken1
      'uint256',      // isOutOfRangeIncentivized
      'address',      // boostingAddress
      'uint256',      // boostedReward
      'address[]',    // whitelist
      'address[]',    // blacklist
      'bytes',        // extraData
      'bytes',        // extraData2
      'bytes',        // extraData3
    ].join(','));

    const decoded = decodeAbiParameters(campaignDataParams, campaignData);

    return {
      hydrexPool: decoded[0] as Address,
      propFees: decoded[1] as bigint,
      propToken0: decoded[2] as bigint,
      propToken1: decoded[3] as bigint,
      isOutOfRangeIncentivized: decoded[4] as bigint,
      boostingAddress: decoded[5] as Address,
      boostedReward: decoded[6] as bigint,
      whitelist: decoded[7] as Address[],
      blacklist: decoded[8] as Address[],
      extraData: decoded[9] as `0x${string}`,
      extraData2: decoded[10] as `0x${string}`,
      extraData3: decoded[11] as `0x${string}`,
    };
  } catch (error) {
    console.error('   ⚠️  Error decoding campaign data:', error);
    return null;
  }
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

    // Step 2: Get Merkl config
    console.log('\n📍 Step 2: Fetching Merkl campaign configuration...');

    const merklConfig = await client.readContract({
      address: REWARDS_DISTRIBUTOR_CONTRACT,
      abi: REWARDS_DISTRIBUTOR_ABI,
      functionName: 'getMerklConfig',
      args: [gaugeAddress, OHYDX_TOKEN as Address],
    });

    console.log(`   Distribution Creator: ${merklConfig.distributionCreator}`);
    console.log(`   Campaign ID: ${merklConfig.campaignId}`);
    console.log(`   Creator: ${merklConfig.creator}`);
    console.log(`   Campaign Type: ${merklConfig.campaignType}`);
    console.log(`   Duration: ${merklConfig.duration}s (${merklConfig.duration / 86400} days)`);
    console.log(`   Campaign Data (raw): ${merklConfig.campaignData.slice(0, 66)}...`);

    // Decode campaign data
    console.log('\n📍 Step 2b: Decoding campaign data...');
    const decodedCampaign = decodeCampaignData(merklConfig.campaignData);

    if (decodedCampaign) {
      console.log(`   Pool Address: ${decodedCampaign.hydrexPool}`);
      console.log(`   Liquidity Weight (propFees): ${decodedCampaign.propFees.toString()} (${Number(decodedCampaign.propFees) / 100}%)`);
      console.log(`   Token0 Weight: ${decodedCampaign.propToken0.toString()} (${Number(decodedCampaign.propToken0) / 100}%)`);
      console.log(`   Token1 Weight: ${decodedCampaign.propToken1.toString()} (${Number(decodedCampaign.propToken1) / 100}%)`);
      console.log(`   Out-of-Range Incentivized: ${decodedCampaign.isOutOfRangeIncentivized === BigInt(0) ? 'No (in-range only)' : 'Yes'}`);
      console.log(`   Boosting Address: ${decodedCampaign.boostingAddress}`);
      console.log(`   Boosted Reward: ${decodedCampaign.boostedReward.toString()}`);
      console.log(`   Whitelist: ${decodedCampaign.whitelist.length > 0 ? decodedCampaign.whitelist.join(', ') : 'None'}`);
      console.log(`   Blacklist: ${decodedCampaign.blacklist.length > 0 ? decodedCampaign.blacklist.join(', ') : 'None'}`);

      // Verify the pool address matches
      if (normalizeAddress(decodedCampaign.hydrexPool) !== normalizeAddress(poolAddress)) {
        console.error('\n❌ FAILED: Campaign pool address mismatch!');
        console.error(`   Expected: ${poolAddress}`);
        console.error(`   Got:      ${decodedCampaign.hydrexPool}`);
        process.exit(1);
      }
      console.log('   ✅ Campaign pool address matches');

      // Verify weights sum to 10000 (100%)
      const totalWeight = Number(decodedCampaign.propFees) + Number(decodedCampaign.propToken0) + Number(decodedCampaign.propToken1);
      if (totalWeight !== 10000) {
        console.warn(`\n ⚠️ WARNING: Weights sum to ${totalWeight} instead of 10000 (100%)`);
      } else {
        console.log('   ✅ Weights sum to 100%');
      }
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
    console.log('\n' + '='.repeat(80));
    console.log('✅ VALIDATION SUCCESSFUL');
    console.log('='.repeat(80));
    console.log(`\nPool: ${poolAddress}`);
    console.log(`Gauge: ${gaugeAddress}`);
    console.log(`Strategy: ${strategy.title}`);
    console.log(`Token0: ${token0}`);
    console.log(`Token1: ${token1}`);

    if (decodedCampaign) {
      console.log(`\nMerkl Campaign Configuration:`);
      console.log(`  Distribution Creator: ${merklConfig.distributionCreator}`);
      console.log(`  Campaign ID: ${merklConfig.campaignId}`);
      console.log(`  Creator: ${merklConfig.creator}`);
      console.log(`  Duration: ${merklConfig.duration}s (${merklConfig.duration / 86400} days)`);
      console.log(`  Campaign Type: ${merklConfig.campaignType} (2 = Concentrated Liquidity)`);
      console.log(`\nWeight Distribution:`);
      const liquidityWeight = Number(decodedCampaign.propFees) / 100;
      const token0Weight = Number(decodedCampaign.propToken0) / 100;
      const token1Weight = Number(decodedCampaign.propToken1) / 100;
      console.log(`  Liquidity: ${liquidityWeight}%`);
      console.log(`  Token0: ${token0Weight}%`);
      console.log(`  Token1: ${token1Weight}%`);
      console.log(`  In-Range Only: ${decodedCampaign.isOutOfRangeIncentivized === BigInt(0) ? 'Yes' : 'No'}`);

      // Check if weight distribution is standard (20/40/40)
      const isStandard = liquidityWeight === 20 && token0Weight === 40 && token1Weight === 40;
      if (isStandard) {
        console.log(`  Distribution Type: ✅ STANDARD (20/40/40)`);
      } else {
        console.log(`  Distribution Type: ⚠️  NON-STANDARD (Standard is 20/40/40)`);
      }
    }

    console.log('\n✨ All checks passed!\n');

  } catch (error) {
    console.error('\n❌ ERROR during validation:');
    console.error(error);
    process.exit(1);
  }
}

async function validateGaugeByHash(configHash: string): Promise<void> {
  console.log('\n🔍 Validating Campaign Configuration by Hash\n');
  console.log('='.repeat(60));
  console.log(`Config Hash: ${configHash}`);
  console.log('='.repeat(60));

  try {
    // Step 1: Fetch config from Merkl API
    console.log('\n📍 Step 1: Fetching campaign config from Merkl API...');
    const configData = await fetchConfigByHash(configHash);

    if (!configData) {
      console.error('\n❌ FAILED: Could not fetch config from Merkl API');
      console.error('   The campaign may not exist yet or the hash is invalid');
      process.exit(1);
    }

    console.log('   ✅ Config data retrieved from API');

    // Step 2: Decode campaign data
    console.log('\n📍 Step 2: Decoding campaign data...');
    
    let decodedCampaign: DecodedCampaignData | null = null;
    let poolAddress: string | null = null;

    // Try to decode from campaignData field if present
    if (configData.campaignData) {
      decodedCampaign = decodeCampaignData(configData.campaignData as `0x${string}`);
    }

    // Fall back to config object if available
    if (!decodedCampaign && configData.config) {
      const cfg = configData.config;
      if (cfg.hydrexPool) {
        decodedCampaign = {
          hydrexPool: cfg.hydrexPool as Address,
          propFees: BigInt(cfg.propFees || 0),
          propToken0: BigInt(cfg.propToken0 || 0),
          propToken1: BigInt(cfg.propToken1 || 0),
          isOutOfRangeIncentivized: BigInt(cfg.isOutOfRangeIncentivized || 0),
          boostingAddress: (cfg.boostingAddress || ZERO_ADDRESS) as Address,
          boostedReward: BigInt(cfg.boostedReward || 0),
          whitelist: (cfg.whitelist || []) as Address[],
          blacklist: (cfg.blacklist || []) as Address[],
          extraData: '0x' as `0x${string}`,
          extraData2: '0x' as `0x${string}`,
          extraData3: '0x' as `0x${string}`,
        };
      }
    }

    // Parse API response format (weightFees, weightToken0, weightToken1, etc.)
    if (!decodedCampaign && configData.poolAddress) {
      // API uses basis points where 1000 = 10%, so we need to convert to our format where 10000 = 100%
      // API: 1000 = 10% -> Our format: 1000 = 10%
      // So we just use the values directly
      decodedCampaign = {
        hydrexPool: configData.poolAddress as Address,
        propFees: BigInt(configData.weightFees || 0),
        propToken0: BigInt(configData.weightToken0 || 0),
        propToken1: BigInt(configData.weightToken1 || 0),
        isOutOfRangeIncentivized: BigInt(configData.isOutOfRangeIncentivized ? 1 : 0),
        boostingAddress: ZERO_ADDRESS as Address,
        boostedReward: BigInt(0),
        whitelist: (configData.whitelist || []) as Address[],
        blacklist: (configData.blacklist || []) as Address[],
        extraData: '0x' as `0x${string}`,
        extraData2: '0x' as `0x${string}`,
        extraData3: '0x' as `0x${string}`,
      };
    }

    if (!decodedCampaign) {
      console.error('\n❌ FAILED: Could not decode campaign data');
      console.error('   Response:', JSON.stringify(configData, null, 2));
      process.exit(1);
    }

    poolAddress = decodedCampaign.hydrexPool;

    console.log(`   Pool Address: ${decodedCampaign.hydrexPool}`);
    console.log(`   Liquidity Weight (propFees): ${decodedCampaign.propFees.toString()} (${Number(decodedCampaign.propFees) / 100}%)`);
    console.log(`   Token0 Weight: ${decodedCampaign.propToken0.toString()} (${Number(decodedCampaign.propToken0) / 100}%)`);
    console.log(`   Token1 Weight: ${decodedCampaign.propToken1.toString()} (${Number(decodedCampaign.propToken1) / 100}%)`);
    console.log(`   Out-of-Range Incentivized: ${decodedCampaign.isOutOfRangeIncentivized === BigInt(0) ? 'No (in-range only)' : 'Yes'}`);
    console.log(`   Boosting Address: ${decodedCampaign.boostingAddress}`);
    console.log(`   Boosted Reward: ${decodedCampaign.boostedReward.toString()}`);
    console.log(`   Whitelist: ${decodedCampaign.whitelist.length > 0 ? decodedCampaign.whitelist.join(', ') : 'None'}`);
    console.log(`   Blacklist: ${decodedCampaign.blacklist.length > 0 ? decodedCampaign.blacklist.join(', ') : 'None'}`);

    // Verify weights sum to 10000 (100%)
    const totalWeight = Number(decodedCampaign.propFees) + Number(decodedCampaign.propToken0) + Number(decodedCampaign.propToken1);
    if (totalWeight !== 10000) {
      console.warn(`\n ⚠️ WARNING: Weights sum to ${totalWeight} instead of 10000 (100%)`);
    } else {
      console.log('   ✅ Weights sum to 100%');
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
    console.log('\n' + '='.repeat(80));
    console.log('✅ VALIDATION SUCCESSFUL');
    console.log('='.repeat(80));
    console.log(`\nConfig Hash: ${configHash}`);
    console.log(`Pool: ${poolAddress}`);
    console.log(`Strategy: ${strategy.title}`);
    console.log(`Token0: ${token0}`);
    console.log(`Token1: ${token1}`);

    console.log(`\nMerkl Campaign Configuration:`);
    if (configData.distributionCreator) {
      console.log(`  Distribution Creator: ${configData.distributionCreator}`);
    }
    if (configData.creator) {
      console.log(`  Creator: ${configData.creator}`);
    }
    if (configData.rewardToken) {
      console.log(`  Reward Token: ${configData.rewardToken}`);
    }
    if (configData.amount) {
      console.log(`  Reward Amount: ${configData.amount}`);
    }
    if (configData.startTimestamp && configData.endTimestamp) {
      const duration = configData.endTimestamp - configData.startTimestamp;
      console.log(`  Duration: ${duration}s (${duration / 86400} days)`);
      console.log(`  Start: ${new Date(configData.startTimestamp * 1000).toISOString()}`);
      console.log(`  End: ${new Date(configData.endTimestamp * 1000).toISOString()}`);
    } else if (configData.duration) {
      console.log(`  Duration: ${configData.duration}s (${configData.duration / 86400} days)`);
    }
    if (configData.campaignType !== undefined) {
      console.log(`  Campaign Type: ${configData.campaignType} ${configData.campaignType === 2 ? '(Concentrated Liquidity)' : ''}`);
    }
    if (configData.computeChainId) {
      console.log(`  Chain ID: ${configData.computeChainId}`);
    }

    console.log(`\nWeight Distribution:`);
    const liquidityWeight = Number(decodedCampaign.propFees) / 100;
    const token0Weight = Number(decodedCampaign.propToken0) / 100;
    const token1Weight = Number(decodedCampaign.propToken1) / 100;
    console.log(`  Liquidity: ${liquidityWeight}%`);
    console.log(`  Token0: ${token0Weight}%`);
    console.log(`  Token1: ${token1Weight}%`);
    console.log(`  In-Range Only: ${decodedCampaign.isOutOfRangeIncentivized === BigInt(0) ? 'Yes' : 'No'}`);

    // Check if weight distribution is standard (20/40/40)
    const isStandard = liquidityWeight === 20 && token0Weight === 40 && token1Weight === 40;
    if (isStandard) {
      console.log(`  Distribution Type: ✅ STANDARD (20/40/40)`);
    } else {
      console.log(`  Distribution Type: ⚠️  NON-STANDARD (Standard is 20/40/40)`);
    }

    console.log('\n✨ All checks passed!\n');

  } catch (error) {
    console.error('\n❌ ERROR during validation:');
    console.error(error);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  // Check for --hash flag
  if (args[0] === '--hash' && args[1]) {
    const configHash = args[1];
    validateGaugeByHash(configHash).catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
  } else if (args[0] && !args[0].startsWith('--')) {
    // Assume it's a pool address
    const poolAddress = args[0];
    validateGauge(poolAddress).catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
  } else {
    console.error('❌ Error: Invalid arguments');
    console.error('\nUsage:');
    console.error('  npm run validate-gauge <poolAddress>');
    console.error('  npm run validate-gauge --hash <configHash>');
    console.error('\nExamples:');
    console.error('  npm run validate-gauge 0xa4b2401dbbf97e3fbda6fb4ef3f4b7a37069232b');
    console.error('  npm run validate-gauge --hash 0x6cffa3c201fddee8f6098f783dab4d7136effc986eb6304aa639a267f1c35510');
    process.exit(1);
  }
}

export { validateGauge, validateGaugeByHash };
