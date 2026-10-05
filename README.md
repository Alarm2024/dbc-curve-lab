# dbc-curve-lab

Compare Meteora **Dynamic Bonding Curve** launch configs before anyone creates one.

For each config the lab works out, with Meteora's own SDK math:

- the quote needed to graduate and the price multiple from start to graduation;
- market cap at start and at graduation, and the share of supply the curve sells;
- a 20-step buy ladder: what each 5 % of buyers pays, and last vs first;
- the base-fee schedule second by second, and the fee on a buy at open vs later.

Designs come from small preset files; real configs come from mainnet. The report is
one static page (`out/report.html`) plus JSON, and each design is exported as SDK
`ConfigParameters` (`out/<name>.config.json`) for whoever creates it — with their
own wallet, elsewhere.

Read-only: no wallet, no transaction. The SDK can build transactions; this project
uses its math and IDL only, and `test/readonly.test.ts` fails the build otherwise.

## Run it

Node 22.18+.

```bash
git clone https://github.com/Alarm2024/dbc-curve-lab && cd dbc-curve-lab
npm install
npm run lab                     # presets/*.json → out/report.html
npm run lab -- --preset my.json # one design
```

A preset:

```json
{
  "name": "stock-pair", "label": "Stock pair, USDC", "about": "…",
  "quote": "USDC", "quoteDecimals": 6, "baseDecimals": 9, "totalSupply": 10000000,
  "initialMarketCap": 100000, "migrationMarketCap": 500000,
  "fee": { "mode": "linear", "startingFeeBps": 1000, "endingFeeBps": 50, "numberOfPeriod": 60, "totalDuration": 600 }
}
```

The three presets in `presets/` (meme, stock pair, RWA) are example designs, not recommendations.

## Real configs from mainnet

```bash
cp .env.example .env            # DBC_RPC_URL=<your mainnet RPC>
npm run record -- <DBC config address>       # saves fixtures/<date>-config-<address>.json
npm run lab -- --fixture fixtures/<file>.json # adds it to the report
```

`record` makes two `getAccountInfo` calls (the config and its quote mint) and
saves the raw bytes with slot and time. The lab decodes them with the IDL in
Meteora's SDK and refuses accounts not owned by the DBC program
(`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`).

> **Placeholder:** no mainnet config is committed yet (PLAN.md, due 9 Oct).

## How the numbers are made

| Figure | How |
|---|---|
| Curve | `buildCurveWithMarketCap` from the preset (SDK). |
| Graduation price | `getMigrationThresholdPrice` (SDK). |
| Ladder | The threshold in 20 equal parts; each part walks the curve segment by segment with `getDeltaAmountQuoteUnsigned`, `getNextSqrtPriceFromInput` and `getDeltaAmountBaseUnsigned` (SDK), the way the program prices a buy. Net of fees. |
| Base fee | `getBaseFeeNumeratorByPeriod` with the config's scheduler (SDK). |
| Fee at open | 1 % of the threshold × base fee at second 0, and after the schedule. |

The tests check the lab against the SDK: market caps and multiple come back as the
preset says, the ladder ends exactly at the SDK's graduation price, a 16-segment
curve is crossed segment by segment to the same result, a decoded account gives
the same report as the parameters it was built from, and the fee schedule starts
and ends where the preset says.

Not modelled, and said on the report: a dynamic (volatility) fee on top of the base fee.

## Tests

`npm test` · `npm run typecheck`

## Hackathon

Built for the Meteora DBC side track of the Colosseum Crypto World's Fair.

MIT — [LICENSE](LICENSE). Made by [elghaly](https://elghaly.dev).

Docs and images: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), © elghaly. Third-party fonts, logos and screenshots of other services keep their own licenses.
