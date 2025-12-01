import https from 'https';
import fs from 'fs';
import path from 'path';

interface Strategy {
  address: string;
  title?: string;
  chainId: number;
}

async function fetchApiStrategies(chainId: number): Promise<Strategy[]> {
  return new Promise((resolve, reject) => {
    https.get(`https://api.hydrex.fi/strategies?chainId=${chainId}`, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const strategies = JSON.parse(data);
          resolve(strategies);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

async function compareStrategies(chainId: number) {
  console.log(`\n🔍 Comparing strategies for chainId ${chainId}...\n`);

  // Fetch from API
  console.log('Fetching from API...');
  const apiStrategies = await fetchApiStrategies(chainId);
  
  // Read local file
  console.log('Reading local file...');
  const localFilePath = path.join(__dirname, '..', 'strategies', `${chainId}.json`);
  const localStrategies: Strategy[] = JSON.parse(fs.readFileSync(localFilePath, 'utf-8'));

  // Normalize addresses for comparison
  const apiAddresses = new Set(apiStrategies.map(s => normalizeAddress(s.address)));
  const localAddresses = new Set(localStrategies.map(s => normalizeAddress(s.address)));

  // Create maps for easy lookup
  const apiMap = new Map(apiStrategies.map(s => [normalizeAddress(s.address), s]));
  const localMap = new Map(localStrategies.map(s => [normalizeAddress(s.address), s]));

  // Find discrepancies
  const inApiNotLocal: Strategy[] = [];
  const inLocalNotApi: Strategy[] = [];

  apiAddresses.forEach(addr => {
    if (!localAddresses.has(addr)) {
      inApiNotLocal.push(apiMap.get(addr)!);
    }
  });

  localAddresses.forEach(addr => {
    if (!apiAddresses.has(addr)) {
      inLocalNotApi.push(localMap.get(addr)!);
    }
  });

  // Print results
  console.log(`📊 Summary:`);
  console.log(`API strategies: ${apiStrategies.length}`);
  console.log(`Local strategies: ${localStrategies.length}`);
  console.log(`\n`);

  if (inApiNotLocal.length > 0) {
    console.log(`❌ ${inApiNotLocal.length} addresses in API but NOT in local file:`);
    inApiNotLocal.forEach(s => {
      console.log(`   - ${s.address} ${s.title ? `(${s.title})` : ''}`);
    });
    console.log('');
  } else {
    console.log(`✅ All API addresses exist in local file`);
    console.log('');
  }

  if (inLocalNotApi.length > 0) {
    console.log(`❌ ${inLocalNotApi.length} addresses in LOCAL file but NOT in API:`);
    inLocalNotApi.forEach(s => {
      console.log(`   - ${s.address} ${s.title ? `(${s.title})` : ''}`);
    });
    console.log('');
  } else {
    console.log(`✅ All local addresses exist in API`);
    console.log('');
  }

  if (inApiNotLocal.length === 0 && inLocalNotApi.length === 0) {
    console.log(`🎉 Perfect match! Both sources have the same addresses.`);
  }
}

// Run the comparison
compareStrategies(8453).catch(console.error);

