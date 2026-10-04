import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// The SDK can also build transactions. This project uses its math and IDL only;
// the build fails if src/ reaches for a transaction builder, a wallet or a sender.

const FORBIDDEN = [
  /\b(PoolService|PartnerService|CreatorService|MigrationService|DynamicBondingCurveClient|StateService)\b/,
  /\b(Keypair|Wallet|Transaction|VersionedTransaction|sendTransaction|sendRawTransaction|signTransaction|AnchorProvider)\b/,
  /secretKey|privateKey|mnemonic|seed ?phrase/i,
  /\bnew Connection\b/,
];

test('src/ uses SDK math and IDL only, never a builder, wallet or sender', () => {
  for (const f of readdirSync('src')) {
    const text = readFileSync(`src/${f}`, 'utf8');
    for (const re of FORBIDDEN) assert.ok(!re.test(text), `src/${f} matches ${re}`);
  }
});

test('the recorder calls getAccountInfo and nothing else', () => {
  const text = readFileSync('src/record.ts', 'utf8');
  const rpcMethods = [...text.matchAll(/jsonrpc: '2\.0', id: \d+, method: '([a-zA-Z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(rpcMethods)], ['getAccountInfo']);
  const httpMethods = [...text.matchAll(/method: '([A-Z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(httpMethods)], ['POST'], 'JSON-RPC over HTTP POST');
});

test('.env.example holds placeholders only', () => {
  for (const line of readFileSync('.env.example', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) assert.ok(!/[A-Za-z0-9]{24,}/.test(m[2] ?? ''), `${m[1]} looks like a real secret`);
  }
});
