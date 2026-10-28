/**
 * Authored fixtures for the Data Quality Rules Lab demo.
 *
 * Everything in this file is invented for demonstration purposes. The six rows
 * describe synthetic asset readings on an imaginary instrument network. No
 * client, employer, registry or real dataset is represented here, and every
 * address uses the reserved `.invalid` top-level domain so that nothing can
 * resolve to a real mailbox.
 *
 * Fixture shape (six rows, four neutral fields):
 *
 *   row 1  SYN-AST-1001  148.2  valid email            -> range failure
 *   row 2  SYN-AST-1001   12.4  valid email            -> uniqueness failure (reuses row 1)
 *   row 3  (empty)        63.1  valid email            -> required-assetId failure
 *   row 4  SYN-AST-1004   n/a   valid email            -> numeric-reading failure
 *   row 5  SYN-AST-1005   74.8  mangled email         -> owner-email-format failure
 *   row 6  SYN-AST-1006   39.5  valid email            -> fully valid
 *
 * The five failures sit on five distinct rows so that the summary is
 * unambiguous, and row 6 passes every rule. Both connectors carry exactly the
 * same values, so switching the connector never changes a count.
 */

/** One parsed source row. Every field is kept as text, exactly as delivered. */
export interface RawRecord {
  /** 1-based position of the record inside the source payload. */
  rowNumber: number;
  /** Invented asset identifier. May be blank, which is a rule failure. */
  assetId: string;
  /** Invented reading. May be non-numeric, which is a rule failure. */
  reading: string;
  /** Invented owner address. May be malformed, which is a rule failure. */
  ownerEmail: string;
  /** ISO date of the reading. */
  observedAt: string;
}

/** The four neutral fields every connector must deliver. */
export const REQUIRED_FIELDS = ['assetId', 'reading', 'ownerEmail', 'observedAt'] as const;

/** CSV payload holding the six authored rows. */
export const CSV_FIXTURE = [
  'assetId,reading,ownerEmail,observedAt',
  'SYN-AST-1001,148.2,ops@northline.invalid,2026-02-02',
  'SYN-AST-1001,12.4,ops@northline.invalid,2026-02-02',
  ',63.1,ops@northline.invalid,2026-02-03',
  'SYN-AST-1004,n/a,ops@northline.invalid,2026-02-03',
  'SYN-AST-1005,74.8,"ops, lead@@northline.invalid",2026-02-04',
  'SYN-AST-1006,39.5,ops@northline.invalid,2026-02-04',
  '',
].join('\n');

/** JSON payload holding the same six authored rows. */
export const JSON_FIXTURE = [
  '[',
  '  {',
  '    "assetId": "SYN-AST-1001",',
  '    "reading": 148.2,',
  '    "ownerEmail": "ops@northline.invalid",',
  '    "observedAt": "2026-02-02"',
  '  },',
  '  {',
  '    "assetId": "SYN-AST-1001",',
  '    "reading": 12.4,',
  '    "ownerEmail": "ops@northline.invalid",',
  '    "observedAt": "2026-02-02"',
  '  },',
  '  {',
  '    "assetId": "",',
  '    "reading": 63.1,',
  '    "ownerEmail": "ops@northline.invalid",',
  '    "observedAt": "2026-02-03"',
  '  },',
  '  {',
  '    "assetId": "SYN-AST-1004",',
  '    "reading": "n/a",',
  '    "ownerEmail": "ops@northline.invalid",',
  '    "observedAt": "2026-02-03"',
  '  },',
  '  {',
  '    "assetId": "SYN-AST-1005",',
  '    "reading": 74.8,',
  '    "ownerEmail": "ops, lead@@northline.invalid",',
  '    "observedAt": "2026-02-04"',
  '  },',
  '  {',
  '    "assetId": "SYN-AST-1006",',
  '    "reading": 39.5,',
  '    "ownerEmail": "ops@northline.invalid",',
  '    "observedAt": "2026-02-04"',
  '  }',
  ']',
  '',
].join('\n');

/**
 * A deliberately broken CSV payload: the header is missing the `ownerEmail`
 * column, so the connector cannot build a record from the row.
 */
export const MALFORMED_CSV_FIXTURE = [
  'assetId,reading,observedAt',
  'SYN-AST-1001,148.2,2026-02-02',
  '',
].join('\n');

/**
 * A deliberately broken JSON payload: the array is truncated, so the payload
 * cannot be parsed at all.
 */
export const MALFORMED_JSON_FIXTURE = [
  '[',
  '  {',
  '    "assetId": "SYN-AST-1001",',
  '    "reading": 148.2,',
  '',
].join('\n');
