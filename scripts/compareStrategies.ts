import fs from 'fs';
import path from 'path';

interface Strategy {
  address: string;
  title?: string;
  chainId: number;
  permissionless?: boolean;
}

function formatStrategy(s: Strategy, apiStrategy?: Strategy): string {
  const label = s.title ? ` (${s.title})` : '';
  const permTag = apiStrategy?.permissionless ? ' [permissionless]' : '';
  return `   - ${s.address}${label}${permTag}`;
}

async function compareStrategies(chainId: number) {
  console.log(`\nComparing strategies for chainId ${chainId}...\n`);

  const [apiRes, localFile] = await Promise.all([
    fetch(`https://api.hydrex.fi/strategies?chainId=${chainId}`),
    fs.promises.readFile(path.join(__dirname, '..', 'strategies', `${chainId}.json`), 'utf-8'),
  ]);

  const apiStrategies: Strategy[] = await apiRes.json();
  const localStrategies: Strategy[] = JSON.parse(localFile);

  const apiMap = new Map(apiStrategies.map(s => [s.address.toLowerCase(), s]));
  const localMap = new Map(localStrategies.map(s => [s.address.toLowerCase(), s]));

  const inApiNotLocal = [...apiMap.entries()].filter(([addr]) => !localMap.has(addr)).map(([, s]) => s);
  const inLocalNotApi = [...localMap.entries()].filter(([addr]) => !apiMap.has(addr)).map(([, s]) => s);

  console.log(`API strategies: ${apiStrategies.length}`);
  console.log(`Local strategies: ${localStrategies.length}\n`);

  if (inApiNotLocal.length > 0) {
    console.log(`${inApiNotLocal.length} in API but NOT in local file:`);
    inApiNotLocal.forEach(s => console.log(formatStrategy(s, s)));
  } else {
    console.log(`All API addresses exist in local file`);
  }

  console.log('');

  if (inLocalNotApi.length > 0) {
    console.log(`${inLocalNotApi.length} in local file but NOT in API:`);
    inLocalNotApi.forEach(s => console.log(formatStrategy(s, apiMap.get(s.address.toLowerCase()))));
  } else {
    console.log(`All local addresses exist in API`);
  }

  if (inApiNotLocal.length === 0 && inLocalNotApi.length === 0) {
    console.log(`\nPerfect match! Both sources have the same addresses.`);
  }
}

compareStrategies(8453).catch(console.error);

