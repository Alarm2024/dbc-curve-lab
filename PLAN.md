# PLAN — dbc-curve-lab

A read-only lab for Meteora Dynamic Bonding Curve (DBC) launch configs. Put in a
few numbers (market cap at start and at graduation, supply, fee schedule) and see,
before anyone creates a config: the price path to graduation, what the first and
last buyers pay, how much of the supply the curve sells, the base fee second by
second, and what buying at open costs in fees. Real configs read from mainnet sit
in the same table as the designs.

All math is Meteora's own SDK (`@meteora-ag/dynamic-bonding-curve-sdk`): curve
building, segment deltas, next price on input, migration price and the fee scheduler.

## Dates (UTC)

| When | What |
|---|---|
| Sun 5 Oct | Code, tests, docs (done). |
| by Thu 9 Oct | Record 3–5 real configs from mainnet (`npm run record`), commit them to `fixtures/`, add them to the report; publish `out/report.html`. |
| by Sat 11 Oct | 2–3 min demo (DEMO.md). |
| Mon 13 Oct, 06:59 | Superteam deadline (confirm on the listing page). |

## Scope

In: presets → SDK ConfigParameters (exported as JSON); report: graduation quote,
price multiple, market caps, supply sold on the curve, 20-step buy ladder, first
vs last buyer price, base-fee schedule, fee on a buy at open; real configs decoded
from account bytes with the SDK's IDL.

Out: creating configs or pools, swapping, wallets. The SDK can build those
transactions; a test fails the build if `src/` imports a builder, a wallet or a sender.

## Honest read on the listing

The DBC track ("Best use of Meteora's DBC", 20k USDC) leans toward launchpads that
use DBC end to end, with stock, RWA and meme pairs. A read-only lab is a tool for
launchpad builders rather than a launchpad. Its case: equity- and RWA-style presets,
exact SDK math, and real mainnet configs compared side by side. Wyndham should read
the listing (not reachable from the build machine) and decide if that is enough.

## Not modelled (said on the report)

Dynamic (volatility) fee on top of the base fee; rate-limiter fee mode
(deprecated for new configs); post-migration DAMM v2 trading.
