/**
 * Rule engine for the Data Quality Rules Lab demo.
 *
 * The engine is data-driven: every rule is a definition with an identifier, a
 * label, the field it inspects and a plain-language explanation. Rules are
 * independently toggleable and `validateRecords` is a pure function - it
 * never mutates the records it is given and always returns issues in a stable
 * order (by row, then by the declared rule order).
 */

import type { RawRecord } from './data';

export type RuleId =
  | 'required-asset-id'
  | 'unique-asset-id'
  | 'numeric-reading'
  | 'reading-range'
  | 'email-format';

export interface RuleDefinition {
  /** Stable identifier used by the UI, the filters and the report. */
  id: RuleId;
  /** Label shown next to the toggle. */
  label: string;
  /** Field the rule inspects. */
  field: string;
  /** One-line explanation of what the rule requires. */
  description: string;
}

/** The five rules of the demo, in the order they are reported. */
export const RULES: readonly RuleDefinition[] = Object.freeze([
  Object.freeze({
    id: 'required-asset-id',
    label: 'Required assetId',
    field: 'assetId',
    description: 'Every record must carry a non-empty asset identifier.',
  }),
  Object.freeze({
    id: 'unique-asset-id',
    label: 'Unique assetId',
    field: 'assetId',
    description: 'An asset identifier may only appear once across the payload.',
  }),
  Object.freeze({
    id: 'numeric-reading',
    label: 'Numeric reading',
    field: 'reading',
    description: 'The reading must be a finite number.',
  }),
  Object.freeze({
    id: 'reading-range',
    label: 'Reading range 0–100',
    field: 'reading',
    description: 'A numeric reading must fall between 0 and 100 inclusive.',
  }),
  Object.freeze({
    id: 'email-format',
    label: 'Owner email format',
    field: 'ownerEmail',
    description: 'The owner address must look like name@host.tld.',
  }),
]);

/** Every rule identifier, in declared order. */
export const RULE_IDS: readonly RuleId[] = RULES.map((rule) => rule.id);

/** All rules enabled - the default state of the demo. */
export const ALL_RULES: readonly RuleId[] = RULE_IDS;

/** The accepted inclusive range for a numeric reading. */
export const READING_MIN = 0;
export const READING_MAX = 100;

export interface Issue {
  /** Which rule failed. */
  ruleId: RuleId;
  /** 1-based row the failure was found on. */
  rowNumber: number;
  /** Field that failed. */
  field: string;
  /** The offending value, exactly as the connector delivered it. */
  value: string;
  /** Plain-language explanation of the failure. */
  message: string;
}

export interface ValidationResult {
  /** Every issue found, ordered by row and then by declared rule order. */
  issues: Issue[];
  /** Failure count per rule. */
  counts: Record<RuleId, number>;
  /** Sum of all per-rule counts. */
  total: number;
  /** How many records were inspected. */
  recordsChecked: number;
}

export interface IssueFilter {
  /** Keep only issues of this rule. */
  ruleId?: RuleId | 'all';
  /** Keep only issues of this row. */
  rowNumber?: number | 'all';
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ruleIndex(ruleId: RuleId): number {
  return RULE_IDS.indexOf(ruleId);
}

function ruleById(ruleId: RuleId): RuleDefinition {
  const rule = RULES.find((candidate) => candidate.id === ruleId);
  if (!rule) {
    throw new Error(`Unknown rule: ${ruleId}`);
  }
  return rule;
}

/** Parses a reading into a finite number, or returns `null`. */
export function parseReading(reading: string): number | null {
  const trimmed = reading.trim();
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** True when the address has the shape `name@host.tld`. */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/**
 * Validates records against the enabled rules.
 *
 * Every rule is evaluated independently, so enabling or disabling one rule
 * never changes what another rule reports.
 */
export function validateRecords(
  records: readonly RawRecord[],
  enabledRules: readonly RuleId[],
): ValidationResult {
  const enabled = new Set(enabledRules);
  const issues: Issue[] = [];
  const counts = createRuleCounts();

  // Required asset identifier.
  if (enabled.has('required-asset-id')) {
    for (const record of records) {
      if (record.assetId.trim() === '') {
        issues.push({
          ruleId: 'required-asset-id',
          rowNumber: record.rowNumber,
          field: 'assetId',
          value: record.assetId,
          message: `Row ${record.rowNumber} has an empty assetId, so the record cannot be identified.`,
        });
      }
    }
  }

  // Unique asset identifier: the first row of a repeated identifier is kept,
  // every later repeat is reported.
  if (enabled.has('unique-asset-id')) {
    const seen = new Set<string>();
    for (const record of records) {
      const assetId = record.assetId.trim();
      if (assetId === '') {
        continue;
      }
      if (seen.has(assetId)) {
        issues.push({
          ruleId: 'unique-asset-id',
          rowNumber: record.rowNumber,
          field: 'assetId',
          value: record.assetId,
          message: `Row ${record.rowNumber} repeats assetId ${assetId}, which was already used by an earlier row.`,
        });
      } else {
        seen.add(assetId);
      }
    }
  }

  // Numeric reading.
  if (enabled.has('numeric-reading')) {
    for (const record of records) {
      if (parseReading(record.reading) === null) {
        issues.push({
          ruleId: 'numeric-reading',
          rowNumber: record.rowNumber,
          field: 'reading',
          value: record.reading,
          message: `Row ${record.rowNumber} has a reading that is not a finite number.`,
        });
      }
    }
  }

  // Reading range: only numeric readings can be checked against the range.
  if (enabled.has('reading-range')) {
    for (const record of records) {
      const value = parseReading(record.reading);
      if (value === null) {
        continue;
      }
      if (value < READING_MIN || value > READING_MAX) {
        issues.push({
          ruleId: 'reading-range',
          rowNumber: record.rowNumber,
          field: 'reading',
          value: record.reading,
          message: `Row ${record.rowNumber} has a reading of ${record.reading.trim()}, outside the accepted range of ${READING_MIN} to ${READING_MAX}.`,
        });
      }
    }
  }

  // Owner email format.
  if (enabled.has('email-format')) {
    for (const record of records) {
      if (!isValidEmail(record.ownerEmail)) {
        issues.push({
          ruleId: 'email-format',
          rowNumber: record.rowNumber,
          field: 'ownerEmail',
          value: record.ownerEmail,
          message: `Row ${record.rowNumber} has an owner address that is not in the name@host.tld form: ${record.ownerEmail.trim()}.`,
        });
      }
    }
  }

  issues.sort((left, right) => {
    if (left.rowNumber !== right.rowNumber) {
      return left.rowNumber - right.rowNumber;
    }
    return ruleIndex(left.ruleId) - ruleIndex(right.ruleId);
  });

  for (const issue of issues) {
    counts[issue.ruleId] += 1;
  }

  return {
    issues,
    counts,
    total: issues.length,
    recordsChecked: records.length,
  };
}

/** A zeroed failure count for every rule. */
export function createRuleCounts(): Record<RuleId, number> {
  const counts = {} as Record<RuleId, number>;
  for (const ruleId of RULE_IDS) {
    counts[ruleId] = 0;
  }
  return counts;
}

/** Filters issues by rule and by row. */
export function filterIssues(issues: readonly Issue[], filter: IssueFilter): Issue[] {
  return issues.filter((issue) => {
    if (filter.ruleId && filter.ruleId !== 'all' && issue.ruleId !== filter.ruleId) {
      return false;
    }
    if (
      filter.rowNumber !== undefined &&
      filter.rowNumber !== 'all' &&
      issue.rowNumber !== filter.rowNumber
    ) {
      return false;
    }
    return true;
  });
}

/** Escapes one value for a CSV cell. */
export function escapeCsvValue(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** The header row of the exported issue report. */
export const ISSUE_REPORT_HEADER = ['rowNumber', 'ruleId', 'ruleLabel', 'field', 'value', 'message'];

/**
 * Renders issues as a CSV report: one header row plus one row per issue, with
 * every value escaped.
 */
export function issuesToCsv(issues: readonly Issue[]): string {
  const lines: string[] = [ISSUE_REPORT_HEADER.map(escapeCsvValue).join(',')];

  for (const issue of issues) {
    const cells = [
      String(issue.rowNumber),
      issue.ruleId,
      ruleById(issue.ruleId).label,
      issue.field,
      issue.value,
      issue.message,
    ];
    lines.push(cells.map(escapeCsvValue).join(','));
  }

  return `${lines.join('\n')}\n`;
}
