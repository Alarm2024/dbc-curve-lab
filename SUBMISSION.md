# Submission draft — Meteora DBC side track

Not submitted. Replace `<…>` with figures from the committed report.

**Title:** dbc-curve-lab

**Link:** https://github.com/Alarm2024/dbc-curve-lab
**Demo:** <video link>
**Report:** <published URL of out/report.html>

**What it is:**
A lab for launchpad builders to compare Dynamic Bonding Curve configs before creating one. A few numbers (market cap at start and graduation, supply, fee schedule) become full SDK ConfigParameters, and the report shows the quote needed to graduate, the price multiple, the share of supply sold on the curve, what each 5 % of buyers pays, and the base fee second by second with the fee cost of buying at open. Example designs for a stock pair (USDC, 5×, ten-minute fee step-down) and an RWA pair (2×, hour-long low fee) sit next to a meme curve and next to <n> real configs read from mainnet.

**How it uses DBC:**
All math is Meteora's SDK: buildCurveWithMarketCap, getMigrationThresholdPrice, the segment delta and next-price functions the program uses to price a buy, and getBaseFeeNumeratorByPeriod. Real configs are decoded from account bytes with the IDL in the SDK. Tests check that the ladder ends exactly at the SDK's graduation price and that a 16-segment curve is crossed segment by segment to the same result.

**Safety:** read-only. No wallet, no transaction; designs export as parameters for the builder's own tooling.

**AI used:** Claude Code.
