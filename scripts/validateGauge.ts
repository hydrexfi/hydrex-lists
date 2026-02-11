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
 * 3. Fetches the Merkl campaign configuration from the contract
 * 4. Automatically detects if the campaignData is a reference hash or full ABI-encoded data
 *    - If 32-byte hash (66 chars): fetches config from Merkl API and validates
 *    - If full data: decodes and validates directly
 * 5. Validates campaign parameters (weights, pool address, etc.)
 * 6. Has correct token0 and token1 addresses in the strategies file
 * 
 * Alternatively, validate a pre-live campaign using its config hash:
 * 1. Fetches campaign config from Merkl API using the hash
 * 2. Decodes and validates campaign parameters
 * 3. Verifies token addresses match the strategies file
 */

const VOTER_CONTRACT = '0xc69E3eF39E3fFBcE2A1c570f8d3ADF76909ef17b';
const INCENTIVE_CAMPAIGN_MANAGER = '0x416d1A1b4555f715A6d804fCc10805b44409096D'; // New production contract
const OHYDX_TOKEN = '0xA1136031150E50B015b41f1ca6B2e99e49D8cB78';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MERKL_API_BASE = 'https://api.merkl.xyz';

// Expected config values from incentive campaign manager (for validation)
const EXPECTED_DISTRIBUTION_CREATOR = '0x8BB4C975Ff3c250e0ceEA271728547f3802B36Fd';
const EXPECTED_CREATOR = '0x40fbfe5312330f278824ddbb7521ab77409192f0';
const EXPECTED_CAMPAIGN_TYPE = 2; // Concentrated liquidity

const VOTER_ABI = [
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'gauges',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const INCENTIVE_CAMPAIGN_MANAGER_ABI = [
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

// Use environment variable or fallback to public RPC
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';

const client = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
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
      address: INCENTIVE_CAMPAIGN_MANAGER,
      abi: INCENTIVE_CAMPAIGN_MANAGER_ABI,
      functionName: 'getMerklConfig',
      args: [gaugeAddress, OHYDX_TOKEN as Address],
    });

    console.log(`   Distribution Creator: ${merklConfig.distributionCreator}`);
    console.log(`   Campaign ID: ${merklConfig.campaignId}`);
    console.log(`   Creator: ${merklConfig.creator}`);
    console.log(`   Campaign Type: ${merklConfig.campaignType}`);
    console.log(`   Duration: ${merklConfig.duration}s (${merklConfig.duration / 86400} days)`);
    console.log(`   Campaign Data (raw): ${merklConfig.campaignData.slice(0, 66)}...`);

    // Validate config values match expected constants
    console.log('\n📍 Step 2a: Validating config values...');
    
    let configValidationPassed = true;
    
    if (normalizeAddress(merklConfig.distributionCreator) !== normalizeAddress(EXPECTED_DISTRIBUTION_CREATOR)) {
      console.warn(`   ⚠️  WARNING: Distribution Creator mismatch`);
      console.warn(`      Expected: ${EXPECTED_DISTRIBUTION_CREATOR}`);
      console.warn(`      Got:      ${merklConfig.distributionCreator}`);
      configValidationPassed = false;
    } else {
      console.log(`   ✅ Distribution Creator matches expected value`);
    }

    if (normalizeAddress(merklConfig.creator) !== normalizeAddress(EXPECTED_CREATOR)) {
      console.warn(`   ⚠️  WARNING: Creator address mismatch`);
      console.warn(`      Expected: ${EXPECTED_CREATOR}`);
      console.warn(`      Got:      ${merklConfig.creator}`);
      configValidationPassed = false;
    } else {
      console.log(`   ✅ Creator address matches expected value`);
    }

    if (merklConfig.campaignType !== EXPECTED_CAMPAIGN_TYPE) {
      console.warn(`   ⚠️  WARNING: Campaign Type mismatch`);
      console.warn(`      Expected: ${EXPECTED_CAMPAIGN_TYPE}`);
      console.warn(`      Got:      ${merklConfig.campaignType}`);
      configValidationPassed = false;
    } else {
      console.log(`   ✅ Campaign Type matches expected value (Concentrated Liquidity)`);
    }

    if (merklConfig.duration === 0) {
      console.warn(`   ⚠️  WARNING: Duration is 0`);
      configValidationPassed = false;
    } else {
      console.log(`   ✅ Duration is valid (${merklConfig.duration / 86400} days)`);
    }

    if (!configValidationPassed) {
      console.log('\n   ⚠️  Some config values do not match expected constants');
      console.log('   This may be intentional, but please verify the configuration');
    }

    // Check if campaignData is a 32-byte hash or full ABI-encoded data
    const isHashReference = merklConfig.campaignData.length === 66; // "0x" + 64 hex chars = 32 bytes
    
    let decodedCampaign: DecodedCampaignData | null = null;
    let apiConfigData: MerklConfigResponse | null = null;

    if (isHashReference) {
      // Campaign data is a reference hash - fetch from Merkl API
      console.log('\n📍 Step 2b: Detected 32-byte reference hash, fetching from Merkl API...');
      console.log(`   Config Hash: ${merklConfig.campaignData}`);
      
      apiConfigData = await fetchConfigByHash(merklConfig.campaignData);

      if (!apiConfigData) {
        console.error('\n❌ FAILED: Could not fetch config from Merkl API');
        console.error('   The campaign may not exist yet or the hash is invalid');
        process.exit(1);
      }

      console.log('   ✅ Config data retrieved from API');

      // Decode campaign data from API response
      console.log('\n📍 Step 2c: Decoding campaign data from API...');

      // Try to decode from campaignData field if present
      if (apiConfigData.campaignData) {
        decodedCampaign = decodeCampaignData(apiConfigData.campaignData as `0x${string}`);
      }

      // Fall back to config object if available
      if (!decodedCampaign && apiConfigData.config) {
        const cfg = apiConfigData.config;
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
      if (!decodedCampaign && apiConfigData.poolAddress) {
        decodedCampaign = {
          hydrexPool: apiConfigData.poolAddress as Address,
          propFees: BigInt(apiConfigData.weightFees || 0),
          propToken0: BigInt(apiConfigData.weightToken0 || 0),
          propToken1: BigInt(apiConfigData.weightToken1 || 0),
          isOutOfRangeIncentivized: BigInt(apiConfigData.isOutOfRangeIncentivized ? 1 : 0),
          boostingAddress: ZERO_ADDRESS as Address,
          boostedReward: BigInt(0),
          whitelist: (apiConfigData.whitelist || []) as Address[],
          blacklist: (apiConfigData.blacklist || []) as Address[],
          extraData: '0x' as `0x${string}`,
          extraData2: '0x' as `0x${string}`,
          extraData3: '0x' as `0x${string}`,
        };
      }

      if (!decodedCampaign) {
        console.error('\n❌ FAILED: Could not decode campaign data from API response');
        console.error('   Response:', JSON.stringify(apiConfigData, null, 2));
        process.exit(1);
      }
    } else {
      // Campaign data is full ABI-encoded data - decode directly
      console.log('\n📍 Step 2b: Decoding full ABI-encoded campaign data...');
      decodedCampaign = decodeCampaignData(merklConfig.campaignData);
    }

    if (decodedCampaign) {
      console.log('\n📍 Step 2d: Validating decoded campaign data...');
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
        console.error('\n   ❌ FAILED: Campaign pool address mismatch!');
        console.error(`      Expected: ${poolAddress}`);
        console.error(`      Got:      ${decodedCampaign.hydrexPool}`);
        process.exit(1);
      }
      console.log('   ✅ Campaign pool address matches');

      // Verify weights sum to 10000 (100%)
      const totalWeight = Number(decodedCampaign.propFees) + Number(decodedCampaign.propToken0) + Number(decodedCampaign.propToken1);
      if (totalWeight !== 10000) {
        console.warn(`\n   ⚠️  WARNING: Weights sum to ${totalWeight} instead of 10000 (100%)`);
      } else {
        console.log('   ✅ Weights sum to 100%');
      }

      // Additional validation for campaign data structure
      if (normalizeAddress(decodedCampaign.boostingAddress) !== normalizeAddress(ZERO_ADDRESS)) {
        console.warn(`   ⚠️  WARNING: Boosting address is not zero address`);
      } else {
        console.log('   ✅ Boosting address is zero (no boosting)');
      }

      if (decodedCampaign.boostedReward !== BigInt(0)) {
        console.warn(`   ⚠️  WARNING: Boosted reward is not zero`);
      } else {
        console.log('   ✅ Boosted reward is zero');
      }

      if (decodedCampaign.isOutOfRangeIncentivized !== BigInt(0)) {
        console.warn(`   ⚠️  WARNING: Out-of-range positions are incentivized`);
      } else {
        console.log('   ✅ Only in-range positions are incentivized');
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
      console.log(`\n${'='.repeat(80)}`);
      console.log('MERKL CAMPAIGN CONFIGURATION (New Incentive Campaign Manager)');
      console.log('='.repeat(80));
      console.log(`\nConfig Tuple Fields:`);
      console.log(`  distributionCreator: ${merklConfig.distributionCreator}`);
      console.log(`    ${normalizeAddress(merklConfig.distributionCreator) === normalizeAddress(EXPECTED_DISTRIBUTION_CREATOR) ? '✅' : '⚠️ '} ${normalizeAddress(merklConfig.distributionCreator) === normalizeAddress(EXPECTED_DISTRIBUTION_CREATOR) ? 'Matches expected value' : 'Does not match expected: ' + EXPECTED_DISTRIBUTION_CREATOR}`);
      console.log(`  campaignId: ${merklConfig.campaignId}`);
      console.log(`    ${merklConfig.campaignId === '0x0000000000000000000000000000000000000000000000000000000000000000' ? '✅ Zero bytes (new campaign)' : 'ℹ️  Existing campaign ID'}`);
      console.log(`  creator: ${merklConfig.creator}`);
      console.log(`    ${normalizeAddress(merklConfig.creator) === normalizeAddress(EXPECTED_CREATOR) ? '✅' : '⚠️ '} ${normalizeAddress(merklConfig.creator) === normalizeAddress(EXPECTED_CREATOR) ? 'Matches expected value' : 'Does not match expected: ' + EXPECTED_CREATOR}`);
      console.log(`  campaignType: ${merklConfig.campaignType}`);
      console.log(`    ${merklConfig.campaignType === EXPECTED_CAMPAIGN_TYPE ? '✅' : '⚠️ '} ${merklConfig.campaignType === EXPECTED_CAMPAIGN_TYPE ? 'Concentrated Liquidity (type 2)' : 'Unexpected campaign type'}`);
      console.log(`  duration: ${merklConfig.duration}s (${merklConfig.duration / 86400} days)`);
      console.log(`    ${merklConfig.duration > 0 ? '✅' : '❌'} ${merklConfig.duration > 0 ? 'Valid duration' : 'Invalid duration (0)'}`);
      console.log(`  campaignData: ${isHashReference ? 'Hash Reference' : 'Full ABI-encoded data'}`);
      console.log(`    Length: ${merklConfig.campaignData.length} characters`);
      
      // Show additional API data if fetched via hash
      if (isHashReference && apiConfigData) {
        console.log(`  Config Hash: ${merklConfig.campaignData}`);
        if (apiConfigData.rewardToken) {
          console.log(`  Reward Token: ${apiConfigData.rewardToken}`);
        }
        if (apiConfigData.amount) {
          console.log(`  Reward Amount: ${apiConfigData.amount}`);
        }
        if (apiConfigData.startTimestamp && apiConfigData.endTimestamp) {
          console.log(`  Start: ${new Date(apiConfigData.startTimestamp * 1000).toISOString()}`);
          console.log(`  End: ${new Date(apiConfigData.endTimestamp * 1000).toISOString()}`);
        }
        if (apiConfigData.computeChainId) {
          console.log(`  Chain ID: ${apiConfigData.computeChainId}`);
        }
      }
      
      console.log(`\nCampaign Data (Decoded):`);
      console.log(`  Pool Address: ${decodedCampaign.hydrexPool}`);
      console.log(`    ${normalizeAddress(decodedCampaign.hydrexPool) === normalizeAddress(poolAddress) ? '✅ Matches pool address' : '❌ Does not match pool address'}`);
      
      console.log(`\n  Weight Distribution:`);
      const liquidityWeight = Number(decodedCampaign.propFees) / 100;
      const token0Weight = Number(decodedCampaign.propToken0) / 100;
      const token1Weight = Number(decodedCampaign.propToken1) / 100;
      const totalWeight = liquidityWeight + token0Weight + token1Weight;
      console.log(`    Liquidity: ${liquidityWeight}% (${decodedCampaign.propFees.toString()} basis points)`);
      console.log(`    Token0: ${token0Weight}% (${decodedCampaign.propToken0.toString()} basis points)`);
      console.log(`    Token1: ${token1Weight}% (${decodedCampaign.propToken1.toString()} basis points)`);
      console.log(`    Total: ${totalWeight}% ${totalWeight === 100 ? '✅' : '⚠️  (should be 100%)'}`);

      // Check if weight distribution is standard (20/40/40)
      const isStandard = liquidityWeight === 20 && token0Weight === 40 && token1Weight === 40;
      if (isStandard) {
        console.log(`    Distribution Type: ✅ STANDARD (20/40/40)`);
      } else {
        console.log(`    Distribution Type: ⚠️  NON-STANDARD (Standard is 20/40/40)`);
      }

      console.log(`\n  Campaign Settings:`);
      console.log(`    In-Range Only: ${decodedCampaign.isOutOfRangeIncentivized === BigInt(0) ? '✅ Yes' : '⚠️  No'}`);
      console.log(`    Boosting Address: ${decodedCampaign.boostingAddress} ${normalizeAddress(decodedCampaign.boostingAddress) === normalizeAddress(ZERO_ADDRESS) ? '✅' : '⚠️ '}`);
      console.log(`    Boosted Reward: ${decodedCampaign.boostedReward.toString()} ${decodedCampaign.boostedReward === BigInt(0) ? '✅' : '⚠️ '}`);
      console.log(`    Whitelist: ${decodedCampaign.whitelist.length > 0 ? decodedCampaign.whitelist.join(', ') : 'None ✅'}`);
      console.log(`    Blacklist: ${decodedCampaign.blacklist.length > 0 ? decodedCampaign.blacklist.join(', ') : 'None ✅'}`);
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
    console.error('    - Automatically detects if campaign uses hash reference or full ABI data');
    console.error('  npm run validate-gauge --hash <configHash>');
    console.error('    - Validate pre-live campaign directly by config hash');
    console.error('\nExamples:');
    console.error('  npm run validate-gauge 0xa4b2401dbbf97e3fbda6fb4ef3f4b7a37069232b');
    console.error('  npm run validate-gauge --hash 0x6cffa3c201fddee8f6098f783dab4d7136effc986eb6304aa639a267f1c35510');
    process.exit(1);
  }
}

export { validateGauge, validateGaugeByHash };
