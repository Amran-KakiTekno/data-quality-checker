# Data Quality Rules Lab

A clean-room, fully client-side demonstration of **pluggable input connectors** and a
**configurable data quality rule engine**, built for the Dual Orbit portfolio.

The demo reads a small set of invented asset readings, validates them against five
toggleable rules, and lets you drill into every failure and export the run as a CSV
report generated in the browser.

- Live demo target: `https://data-quality-checker.pages.dev`
- Preview port used locally: `4105`
- Everything runs in the browser. There is no upload, no external fetch, no database,
  no routing and no persistence.

## Provenance of the data

**Every fixture in this repository was written from scratch for this demo.**

`src/data.ts` holds six invented rows of asset readings. The rows describe an imaginary
instrument network that does not exist. No client, employer, registry, supplier or real
dataset is represented, copied or derived from anything. Every address uses the reserved
`.invalid` top-level domain, so no value in the demo can resolve to a real mailbox. The
fixture is deliberately shaped so that each of the five rules fails on a different row
and the sixth row passes every rule, which keeps the summary unambiguous.

The demo was written without reading, copying or adapting any pre-existing project or
data set. It is a technique demonstration, not a production data quality service.

## Local commands

```bash
npm install        # install dependencies
npm run dev        # development server on http://127.0.0.1:4105
npm run typecheck  # tsc --noEmit
npm run test       # Vitest unit suite (src/domain.test.ts)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the static build on port 4105
npm run test:e2e   # Playwright browser suite (system Chrome)
npm run verify     # typecheck -> unit -> build -> browser -> artifact check
```

`npm run verify` is the full gate. It finishes by running `scripts/verify-build.mjs`,
which asserts that `dist/` holds exactly one HTML file, a non-empty JavaScript bundle and
a non-empty CSS bundle, and prints `VERIFY_OK data-quality-checker`.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/data.ts` | The authored CSV and JSON fixtures plus the two malformed samples. Defines the neutral `RawRecord` shape. |
| `src/connectors.ts` | The `Connector` interface, `parseCsvConnector`, `parseJsonConnector` and the `ConnectorError` controlled failure type. |
| `src/domain.ts` | The rule definitions, the pure `validateRecords(records, enabledRules)`, issue filtering and `issuesToCsv`. |
| `src/App.tsx` | Connector and rule controls, the validation summary, the parsed records, the issue drill-down and the report export. |
| `src/styles.css` | The single stylesheet for the page. |
| `src/domain.test.ts` | Vitest suite for the connectors and every rule. |
| `tests/demo.spec.ts` | Playwright suite for the browser flow, mobile layout, accessibility and request isolation. |

`src/domain.ts` and `src/connectors.ts` are free of React and of browser APIs, which is
why the unit suite runs in a plain Node environment.

## How the rule engine works

A rule is a plain definition, not a bespoke function call site:

```ts
export interface RuleDefinition {
  id: RuleId;
  label: string;
  field: string;
  description: string;
}
```

`validateRecords` walks the enabled rules and evaluates each one independently over the
records, so enabling or disabling one rule never changes what another rule reports.
Issues are returned in a stable order - by row number first, then by the declared rule
order - which keeps the list, the counts and the exported report reproducible.

The five rules of the demo:

| Rule | What it requires | Demo failure |
| --- | --- | --- |
| `Required assetId` | A non-empty asset identifier. | row 3 has a blank `assetId`. |
| `Unique assetId` | An identifier may appear only once. | row 2 repeats the identifier of row 1. |
| `Numeric reading` | The reading must be a finite number. | row 4 has the reading `n/a`. |
| `Reading range 0–100` | A numeric reading must fall in `0..100`. | row 1 has the reading `148.2`. |
| `Owner email format` | The address must look like `name@host.tld`. | row 5 has a mangled address. |

With all five rules enabled the run reports exactly five issues, one per rule, on five
distinct rows. Disabling `Owner email format` and rerunning reports four.

## Adding a connector

A connector turns one source payload into the neutral `RawRecord` shape. It is an object
with an identifier, a label, a one-line summary and a `parse` method:

```ts
export interface Connector {
  id: ConnectorId;
  label: string;
  summary: string;
  parse(payload: string): RawRecord[];
}
```

To add one:

1. Write a `parseXConnector(payload: string): RawRecord[]` function in `src/connectors.ts`.
2. Throw `new ConnectorError('x', 'a message the user can read')` for any malformed input.
   Never let an exception escape uncaught - the UI relies on `ConnectorError` to show a
   controlled error and to refuse a partial validation.
3. Add the connector to the `CONNECTORS` record and to the `ConnectorId` union, then add
   its payload to `PAYLOADS` in `src/App.tsx` and to `CONNECTOR_ORDER`.

The demo's own `parseCsvConnector` shows the shape: read the header, check that every
required column is present exactly once, check that every data row has the same number of
fields, and map each row onto `RawRecord`. `parseJsonConnector` does the same for a JSON
array of objects. Because the rule engine only ever sees `RawRecord`, a new connector
needs no change anywhere else.

## Adding a rule

To add a rule:

1. Add its identifier to the `RuleId` union and a `RuleDefinition` to the `RULES` array
   in `src/domain.ts`. The declaration order is the reporting order.
2. Add the check to `validateRecords`, guarded by
   `if (enabled.has('your-rule-id')) { ... }`, pushing one `Issue` per failure.
3. Extend the rule definition list in `src/App.tsx` - the toggle, the per-rule count and
   the filter options are all generated from `RULES`, so no markup changes are needed.

An `Issue` carries the rule identifier, the row number, the field, the offending value
exactly as the connector delivered it, and a plain-language message. The message and the
value are what the drill-down panel and the exported report show.

## The issue report

`issuesToCsv` writes one header row (`rowNumber,ruleId,ruleLabel,field,value,message`)
plus one row per issue. Values containing a comma, a double quote or a line break are
quoted, and embedded double quotes are doubled, so the exported file re-imports cleanly
into a spreadsheet. The download is generated in the browser from a `Blob`; nothing is
sent anywhere.

## Accessibility and layout

The page uses fieldsets, legends and real labels for every control, keeps a visible
focus ring, and states each issue in text as well as colour. The Playwright suite asserts
that there are no serious or critical axe violations and that the page does not scroll
horizontally at 390 px.

## License and intent

Written as a portfolio technique demo for Dual Orbit. Synthetic fixtures only.
