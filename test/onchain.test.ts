import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import BN from 'bn.js';
import { BorshAccountsCoder, type Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as dbc from '@meteora-ag/dynamic-bonding-curve-sdk';
import { analyze, fromConfigParameters } from '../src/lab.ts';
import { buildConfig, loadPresets } from '../src/presets.ts';
import { fromFixture, DBC_PROGRAM_ID, type ConfigFixture } from '../src/onchain.ts';

const IDL = dbc.DynamicBondingCurveIdl as unknown as Idl;
type Field = { name: string; type: unknown };
const TYPES = (dbc.DynamicBondingCurveIdl as unknown as { types: { name: string; type: { fields?: Field[] } }[] }).types;

// A zero value for any IDL type, so a PoolConfig account can be encoded in a test.
function zero(t: unknown): unknown {
  if (typeof t === 'string') return t === 'pubkey' ? PublicKey.default : ['u8', 'u16', 'u32', 'i8', 'i16', 'i32'].includes(t) ? 0 : t === 'bool' ? false : new BN(0);
  const o = t as { array?: [unknown, number]; defined?: { name: string } };
  if (o.array) return Array.from({ length: o.array[1] }, () => zero(o.array![0]));
  if (o.defined) {
    const def = TYPES.find((x) => x.name === o.defined!.name)!;
    return Object.fromEntries((def.type.fields ?? []).map((f: Field) => [f.name, zero(f.type)]));
  }
  throw new Error(`no zero for ${JSON.stringify(t)}`);
}

test('decoding a PoolConfig account gives the same report as the SDK parameters it was built from', () => {
  // Constructed account: a preset's ConfigParameters written into the on-chain layout.
  const preset = loadPresets()[0]!;
  const cp = buildConfig(preset);
  const acct = zero({ defined: { name: 'PoolConfig' } }) as Record<string, any>;
  acct.sqrt_start_price = cp.sqrtStartPrice;
  acct.migration_quote_threshold = cp.migrationQuoteThreshold;
  acct.token_decimal = cp.tokenDecimal;
  acct.pre_migration_token_supply = cp.tokenSupply!.preMigrationTokenSupply;
  acct.pool_fees.base_fee.cliff_fee_numerator = cp.poolFees.baseFee.cliffFeeNumerator;
  acct.pool_fees.base_fee.first_factor = cp.poolFees.baseFee.firstFactor;
  acct.pool_fees.base_fee.second_factor = cp.poolFees.baseFee.secondFactor;
  acct.pool_fees.base_fee.third_factor = cp.poolFees.baseFee.thirdFactor;
  acct.pool_fees.base_fee.base_fee_mode = cp.poolFees.baseFee.baseFeeMode;
  cp.curve.forEach((p, i) => { acct.curve[i] = { sqrt_price: p.sqrtPrice, liquidity: p.liquidity }; });
  // BorshAccountsCoder.encode allocates 1000 bytes, less than a PoolConfig; encode with the layout directly.
  const coder = new BorshAccountsCoder(IDL) as unknown as { accountLayouts: Map<string, { layout: { encode(v: unknown, b: Buffer): number } }>; accountDiscriminator(n: string): Buffer };
  const body = Buffer.alloc(4096);
  const len = coder.accountLayouts.get('PoolConfig')!.layout.encode(acct, body);
  const buf = Buffer.concat([coder.accountDiscriminator('PoolConfig'), body.subarray(0, len)]);
  {
    const fx: ConfigFixture = { meta: { recorded_at: 'constructed', source: 'test', slot: 0, address: 'test', owner: DBC_PROGRAM_ID }, config: { data_base64: buf.toString('base64') }, quoteMint: { address: 'So11111111111111111111111111111111111111112', decimals: preset.quoteDecimals } };
    assert.deepEqual(analyze(fromFixture(fx)), analyze(fromConfigParameters(cp, preset.quoteDecimals)));
  }
});

test('an account owned by another program is refused', () => {
  const fx = { meta: { recorded_at: '', source: '', slot: 0, address: 'x', owner: '11111111111111111111111111111111' }, config: { data_base64: '' }, quoteMint: { address: '', decimals: 9 } };
  assert.throws(() => fromFixture(fx), /not the DBC program/);
});

// Real configs recorded with `npm run record -- <address>`.
const files = existsSync('fixtures') ? readdirSync('fixtures').filter((f) => /-config-.+\.json$/.test(f)) : [];
if (files.length === 0) {
  test('real mainnet DBC config', { skip: 'no recording in fixtures/ yet — run `npm run record -- <config address>` with DBC_RPC_URL set' }, () => {});
}
for (const f of files) {
  test(`${f}: decodes and walks to graduation`, () => {
    const fx = JSON.parse(readFileSync(join('fixtures', f), 'utf8')) as ConfigFixture;
    assert.match(fx.meta.recorded_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(fx.meta.slot > 0);
    const r = analyze(fromFixture(fx));
    assert.ok(r.migrationQuote > 0 && r.priceMultiple > 1);
    const last = r.ladder[r.ladder.length - 1]!;
    assert.ok(Math.abs(last.priceAfter - r.migrationPrice) / r.migrationPrice < 1e-9);
  });
}
