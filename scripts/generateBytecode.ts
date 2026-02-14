import { createPublicClient, http, isAddress, Address, encodeAbiParameters, parseAbiParameters } from 'viem';
import { base } from 'viem/chains';

/**
 * Generate bytecode for Merkl or Hydrex campaign configurations
 * 
 * Run: npm run generate-bytecode <poolAddress> [options]
 * 
 * Examples:
 *   - Hydrex config: npm run generate-bytecode 0x... --type hydrex
 *   - Merkl config:  npm run generate-bytecode 0x... --type merkl
 *   - Help:          npm run generate-bytecode -- --help
*/

const VOTER_CONTRACT = '0xc69E3eF39E3fFBcE2A1c570f8d3ADF76909ef17b';
const INCENTIVE_CAMPAIGN_MANAGER = '0x416d1A1b4555f715A6d804fCc10805b44409096D'; // New production contract
const OHYDX_TOKEN = '0xA1136031150E50B015b41f1ca6B2e99e49D8cB78';

// Merkl Campaign Configuration (from incentive campaign manager contract)
const DISTRIBUTION_CREATOR = '0x8BB4C975Ff3c250e0ceEA271728547f3802B36Fd';
const CAMPAIGN_ID = '0x0000000000000000000000000000000000000000000000000000000000000000';
const CREATOR_ADDRESS = '0x40fbfe5312330f278824ddbb7521ab77409192f0'; // Creator address (lowercase - will be checksummed by viem)
const CAMPAIGN_TYPE = 2; // Concentrated liquidity
const DEFAULT_DURATION = 604800; // 7 days in seconds

// Hydrex Campaign Configuration
const HYDREX_DISTRIBUTOR = '0x8604d646df5A15074876fc2825CfeE306473dD45';

const VOTER_ABI = [
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'gauges',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

type ConfigType = 'merkl' | 'hydrex';

// Use environment variable or fallback to public RPC
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';

const client = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

/**
 * Generates the campaign data bytes for a concentrated liquidity campaign
 * 
 * Structure: abi.encode(
 *   hydrexPool, propFees, propToken0, propToken1, 
 *   isOutOfRangeIncentivized, boostingAddress, boostedReward,
 *   whitelist, blacklist, extraBytes
 * )
 */
function generateCampaignData(
  poolAddress: Address,
  token0Weight: number = 4000,
  token1Weight: number = 4000,
  liquidityWeight: number = 2000,
  blacklist: Address[] = []
): `0x${string}` {
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  
  const campaignDataParams = parseAbiParameters([
    'address',      // hydrexPool (the pool address)
    'uint256',      // propFees
    'uint256',      // propToken0
    'uint256',      // propToken1
    'uint256',      // isOutOfRangeIncentivized (0 = false)
    'address',      // boostingAddress
    'uint256',      // boostedReward
    'address[]',    // whitelist
    'address[]',    // blacklist
    'bytes',        // extraData
    'bytes',        // extraData2
    'bytes',        // extraData3
  ].join(','));

  return encodeAbiParameters(campaignDataParams, [
    poolAddress,                 // hydrexPool
    BigInt(liquidityWeight),     // propFees (Liquidity Contribution weight)
    BigInt(token0Weight),        // propToken0 (Token0 weight)
    BigInt(token1Weight),        // propToken1 (Token1 weight)
    BigInt(0),                   // isOutOfRangeIncentivized (0 = false = only in-range positions)
    ZERO_ADDRESS as Address,     // boostingAddress (zero address)
    BigInt(0),                   // boostedReward
    [],                          // whitelist (empty)
    blacklist,                   // blacklist (provided addresses)
    '0x',                        // extraData (empty)
    '0x',                        // extraData2 (empty)
    '0x',                        // extraData3 (empty)
  ]);
}

async function generateBytecode(
  poolAddress: string,
  configType: ConfigType = 'merkl',
  duration: number = DEFAULT_DURATION,
  token0Weight: number = 4000,
  token1Weight: number = 4000,
  liquidityWeight: number = 2000,
  blacklist: Address[] = []
): Promise<void> {
  // Validate input
  if (!isAddress(poolAddress)) {
    console.error('❌ Invalid pool address format');
    process.exit(1);
  }

  // Validate blacklist addresses
  for (const addr of blacklist) {
    if (!isAddress(addr)) {
      console.error(`❌ Invalid blacklist address format: ${addr}`);
      process.exit(1);
    }
  }

  console.log(`\n🔧 Generating ${configType === 'merkl' ? 'Merkl' : 'Hydrex'} Config for pool:`, poolAddress);

  try {
    // Get gauge address from Voter contract
    const gaugeAddress = await client.readContract({
      address: VOTER_CONTRACT,
      abi: VOTER_ABI,
      functionName: 'gauges',
      args: [poolAddress as Address],
    });

    if (gaugeAddress === '0x0000000000000000000000000000000000000000') {
      console.error('❌ No gauge found for this pool');
      process.exit(1);
    }

    if (configType === 'hydrex') {
      // Generate Hydrex config

      // Format config as JSON array for Gnosis Safe
      const configArray = [
        HYDREX_DISTRIBUTOR,
        0,
        duration
      ];

      // Output results
      console.log('\n' + '='.repeat(80));
      console.log('✅ INPUTS FOR GNOSIS SAFE (HYDREX CONFIG)');
      console.log('='.repeat(80));
      
      console.log('\nContract: Hydrex Incentive Campaign Manager');
      console.log(`Address: ${INCENTIVE_CAMPAIGN_MANAGER}`);
      console.log('Method: setHydrexConfigOverride(address gauge, address token, tuple config)');
      console.log(`Basescan: https://basescan.org/address/${INCENTIVE_CAMPAIGN_MANAGER}#writeContract`);
      
      console.log('\n' + '='.repeat(80));
      console.log('COPY-PASTE VALUES BELOW:');
      console.log('='.repeat(80));
      
      console.log('\n1. gauge (address):');
      console.log(gaugeAddress);
      
      console.log('\n2. token (address):');
      console.log(OHYDX_TOKEN);
      
      console.log('\n3. config (tuple):');
      console.log(JSON.stringify(configArray));
      
      console.log('\n' + '='.repeat(80));
      console.log('CONFIG DETAILS:');
      console.log('='.repeat(80));
      console.log(`Pool: ${poolAddress}`);
      console.log(`Gauge: ${gaugeAddress}`);
      console.log(`Token: ${OHYDX_TOKEN}`);
      console.log(`Distributor: ${HYDREX_DISTRIBUTOR}`);
      console.log(`Start Timestamp: 0 (current block.timestamp)`);
      console.log(`Duration: ${duration}s (${duration / 86400} days)`);
      console.log('='.repeat(80) + '\n');

    } else {
      // Generate Merkl config (existing logic)
      // Validate weights sum to 10000 (100%)
      const totalWeight = token0Weight + token1Weight + liquidityWeight;
      if (totalWeight !== 10000) {
        console.warn(`⚠️  WARNING: Weights sum to ${totalWeight} instead of 10000 (100%)`);
        console.warn(`   Token0: ${token0Weight}, Token1: ${token1Weight}, Liquidity: ${liquidityWeight}`);
      }

      const campaignData = generateCampaignData(
        poolAddress as Address,
        token0Weight,
        token1Weight,
        liquidityWeight,
        blacklist
      );

      // Format config as JSON array for Gnosis Safe
      const configArray = [
        DISTRIBUTION_CREATOR,
        CAMPAIGN_ID,
        CREATOR_ADDRESS,
        CAMPAIGN_TYPE,
        duration,
        campaignData
      ];

      // Output results
      console.log('\n' + '='.repeat(80));
      console.log('✅ INPUTS FOR GNOSIS SAFE (MERKL CONFIG)');
      console.log('='.repeat(80));
      
      console.log('\nContract: Hydrex Incentive Campaign Manager');
      console.log(`Address: ${INCENTIVE_CAMPAIGN_MANAGER}`);
      console.log('Method: setMerklConfigOverride(address gauge, address token, tuple config)');
      console.log(`Basescan: https://basescan.org/address/${INCENTIVE_CAMPAIGN_MANAGER}#writeContract`);
      
      console.log('\n' + '='.repeat(80));
      console.log('COPY-PASTE VALUES BELOW:');
      console.log('='.repeat(80));
      
      console.log('\n1. gauge (address):');
      console.log(gaugeAddress);
      
      console.log('\n2. token (address):');
      console.log(OHYDX_TOKEN);
      
      console.log('\n3. config (tuple):');
      console.log(JSON.stringify(configArray));
      
      console.log('\n' + '='.repeat(80));
      console.log('CONFIG DETAILS:');
      console.log('='.repeat(80));
      console.log(`Pool: ${poolAddress}`);
      console.log(`Gauge: ${gaugeAddress}`);
      console.log(`Distribution Creator: ${DISTRIBUTION_CREATOR}`);
      console.log(`Campaign ID: ${CAMPAIGN_ID}`);
      console.log(`Creator: ${CREATOR_ADDRESS}`);
      console.log(`Campaign Type: ${CAMPAIGN_TYPE} (Concentrated Liquidity)`);
      console.log(`Duration: ${duration}s (${duration / 86400} days)`);
      console.log(`Weights: Token0=${token0Weight/100}%, Token1=${token1Weight/100}%, Liquidity=${liquidityWeight/100}%`);
      console.log(`Only In-Range: Yes (rewards only in-range positions)`);
      console.log(`Blacklist: ${blacklist.length > 0 ? blacklist.join(', ') : 'None'}`);
      console.log(`Campaign Data Length: ${campaignData.length} bytes`);
      console.log('='.repeat(80) + '\n');
    }

  } catch (error) {
    console.error('\n❌ ERROR during generation:');
    console.error(error);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let poolAddress: string | undefined;
  let configType: ConfigType = 'merkl'; // Default to merkl
  let duration = DEFAULT_DURATION;
  let token0Weight = 4000;
  let token1Weight = 4000;
  let liquidityWeight = 2000;
  let blacklist: Address[] = [];

  // Parse flags and positional arguments
  let positionalIndex = 0;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--type' || arg === '-t') {
      // Parse config type (merkl or hydrex)
      i++;
      if (i < args.length) {
        const type = args[i].toLowerCase();
        if (type === 'merkl' || type === 'hydrex') {
          configType = type as ConfigType;
        } else {
          console.error(`❌ Invalid config type: ${args[i]}. Must be 'merkl' or 'hydrex'`);
          process.exit(1);
        }
      }
    } else if (arg === '--blacklist' || arg === '-b') {
      // Parse comma-separated blacklist addresses
      i++;
      if (i < args.length) {
        const addresses = args[i].split(',').map(addr => addr.trim() as Address);
        blacklist = addresses;
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log('\nUsage: npm run generate-bytecode <poolAddress> [options]');
      console.log('\nPositional Arguments:');
      console.log('  poolAddress           Pool address (required)');
      console.log('  duration              Campaign duration in seconds (optional, default: 604800)');
      console.log('  token0Weight          Token0 weight in basis points (optional, default: 4000 = 40%, Merkl only)');
      console.log('  token1Weight          Token1 weight in basis points (optional, default: 4000 = 40%, Merkl only)');
      console.log('  liquidityWeight       Liquidity weight in basis points (optional, default: 2000 = 20%, Merkl only)');
      console.log('\nOptions:');
      console.log('  --type, -t <type>             Config type: "merkl" or "hydrex" (default: merkl)');
      console.log('  --blacklist, -b <addresses>   Comma-separated blacklist addresses (Merkl only)');
      console.log('  --help, -h                    Show this help message');
      console.log('\nConfig Types:');
      console.log('  merkl    - Merkl campaign config with custom weights and campaign data');
      console.log('  hydrex   - Hydrex campaign config with distributor, startTimestamp, and duration');
      console.log('\nExamples:');
      console.log('  # Generate Hydrex config (7 days)');
      console.log('  npm run generate-bytecode 0x51f0b932855986b0e621c9d4db6eee1f4644d3d2 --type hydrex');
      console.log('\n  # Generate Hydrex config (14 days)');
      console.log('  npm run generate-bytecode 0x51f0b932855986b0e621c9d4db6eee1f4644d3d2 1209600 -t hydrex');
      console.log('\n  # Generate Merkl config (standard 40/40/20 distribution)');
      console.log('  npm run generate-bytecode 0x51f0b932855986b0e621c9d4db6eee1f4644d3d2');
      console.log('\n  # Generate Merkl config with custom weights (30/50/20)');
      console.log('  npm run generate-bytecode 0x51f0b932855986b0e621c9d4db6eee1f4644d3d2 604800 5000 3000 2000');
      console.log('\n  # Generate Merkl config with blacklist addresses');
      console.log('  npm run generate-bytecode 0x51f0b932855986b0e621c9d4db6eee1f4644d3d2 --blacklist 0xabc...,0xdef...');
      console.log('\nDefault values:');
      console.log('  configType: merkl');
      console.log('  duration: 604800 seconds (7 days)');
      console.log('  token0Weight: 4000 (40%, Merkl only)');
      console.log('  token1Weight: 4000 (40%, Merkl only)');
      console.log('  liquidityWeight: 2000 (20%, Merkl only)');
      console.log('  blacklist: None (Merkl only)');
      console.log('\nNote: Weights must sum to 10000 (100%) for Merkl configs');
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      // Positional arguments
      switch (positionalIndex) {
        case 0:
          poolAddress = arg;
          break;
        case 1:
          duration = parseInt(arg);
          break;
        case 2:
          token0Weight = parseInt(arg);
          break;
        case 3:
          token1Weight = parseInt(arg);
          break;
        case 4:
          liquidityWeight = parseInt(arg);
          break;
      }
      positionalIndex++;
    }
  }

  if (!poolAddress) {
    console.error('❌ Error: Pool address is required');
    console.error('\nRun with --help for usage information');
    process.exit(1);
  }

  // Validate that weights are only provided for Merkl configs
  if (configType === 'hydrex' && positionalIndex > 2) {
    console.warn('⚠️  WARNING: Weight parameters are ignored for Hydrex configs');
  }

  generateBytecode(poolAddress, configType, duration, token0Weight, token1Weight, liquidityWeight, blacklist).catch(error => {
    console.error('Generation failed:', error);
    process.exit(1);
  });
}

export { generateBytecode };
