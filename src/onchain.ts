import BN from 'bn.js';
import { BorshAccountsCoder, type Idl } from '@coral-xyz/anchor';
import * as dbc from '@meteora-ag/dynamic-bonding-curve-sdk';
import type { CurveConfig } from './lab.ts';

// Real configs from mainnet. `npm run record -- <config address>` saves the raw
// account bytes (getAccountInfo, read-only) with the slot and time; this file
// decodes them with the IDL shipped in Meteora's SDK, so the lab can run on a
// config that is really in use.

export const DBC_PROGRAM_ID = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';

export interface ConfigFixture {
  meta: { recorded_at: string; source: string; slot: number; address: string; owner: string };
  config: { data_base64: string };
  quoteMint: { address: string; decimals: number };
}

type Raw = Record<string, unknown>;
const get = (o: Raw, snake: string): unknown => o[snake] ?? o[snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())];
const bn = (v: unknown): BN => (BN.isBN(v) ? (v as BN) : new BN(String(v ?? 0)));

export function decodePoolConfig(base64: string): Raw {
  const coder = new BorshAccountsCoder(dbc.DynamicBondingCurveIdl as unknown as Idl);
  return coder.decode('PoolConfig', Buffer.from(base64, 'base64')) as Raw;
}

export function fromFixture(f: ConfigFixture): CurveConfig {
  if (f.meta.owner !== DBC_PROGRAM_ID) throw new Error(`${f.meta.address} is owned by ${f.meta.owner}, not the DBC program`);
  const c = decodePoolConfig(f.config.data_base64);
  const fees = get(c, 'pool_fees') as Raw;
  const base = get(fees, 'base_fee') as Raw;
  const curve = (get(c, 'curve') as Raw[]).map((p) => ({ sqrtPrice: bn(get(p, 'sqrt_price')), liquidity: bn(get(p, 'liquidity')) }));
  return {
    sqrtStartPrice: bn(get(c, 'sqrt_start_price')),
    migrationQuoteThreshold: bn(get(c, 'migration_quote_threshold')),
    curve,
    baseDecimals: Number(get(c, 'token_decimal')),
    quoteDecimals: f.quoteMint.decimals,
    totalBaseSupply: bn(get(c, 'pre_migration_token_supply')),
    baseFee: {
      cliffFeeNumerator: bn(get(base, 'cliff_fee_numerator')),
      numberOfPeriod: Number(get(base, 'first_factor')),
      periodFrequency: bn(get(base, 'second_factor')),
      reductionFactor: bn(get(base, 'third_factor')),
      mode: Number(get(base, 'base_fee_mode')),
    },
  };
}

/** Quote mint address from the decoded config (for the recorder). */
export function quoteMintOf(base64: string): string {
  const v = get(decodePoolConfig(base64), 'quote_mint') as { toBase58?: () => string };
  return typeof v?.toBase58 === 'function' ? v.toBase58() : String(v);
}
