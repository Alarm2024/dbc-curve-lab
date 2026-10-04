import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DBC_PROGRAM_ID, quoteMintOf, type ConfigFixture } from './onchain.ts';

// npm run record -- <DBC config address>
// Reads the config account and its quote mint from mainnet with getAccountInfo
// (read-only) and saves fixtures/<date>-config-<address>.json. Needs DBC_RPC_URL.

function loadDotEnv(): void {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#') && process.env[m[1] as string] === undefined) process.env[m[1] as string] = m[2] as string;
  }
}

async function accountInfo(rpc: string, address: string): Promise<{ slot: number; owner: string; data: string }> {
  const r = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [address, { encoding: 'base64', commitment: 'confirmed' }] }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await r.json()) as { result?: { context: { slot: number }; value: { owner: string; data: [string, string] } | null }; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  if (!body.result?.value) throw new Error(`account ${address} not found`);
  return { slot: body.result.context.slot, owner: body.result.value.owner, data: body.result.value.data[0] };
}

loadDotEnv();
const address = process.argv[2];
const rpc = process.env.DBC_RPC_URL ?? '';
if (!address || !rpc) {
  console.error('usage: DBC_RPC_URL=<mainnet RPC> npm run record -- <DBC config address>');
  process.exit(1);
}
const recorded_at = new Date().toISOString();
const cfg = await accountInfo(rpc, address);
if (cfg.owner !== DBC_PROGRAM_ID) throw new Error(`${address} is owned by ${cfg.owner}, not the DBC program ${DBC_PROGRAM_ID}`);
const mint = quoteMintOf(cfg.data);
const mintInfo = await accountInfo(rpc, mint);
const decimals = Buffer.from(mintInfo.data, 'base64')[44]; // SPL mint layout: decimals at byte 44
const fixture: ConfigFixture = {
  meta: { recorded_at, source: `Solana mainnet getAccountInfo via ${new URL(rpc).host}`, slot: cfg.slot, address, owner: cfg.owner },
  config: { data_base64: cfg.data },
  quoteMint: { address: mint, decimals: Number(decimals) },
};
mkdirSync('fixtures', { recursive: true });
const path = join('fixtures', `${recorded_at.slice(0, 10)}-config-${address}.json`);
writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n');
console.log(`saved ${path} (slot ${cfg.slot}, quote mint ${mint}, ${decimals} decimals)`);
