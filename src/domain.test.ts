import { describe, expect, it } from 'vitest';
import {
  ConnectorError,
  parseCsvConnector,
  parseJsonConnector,
} from './connectors';
import {
  CSV_FIXTURE,
  JSON_FIXTURE,
  MALFORMED_CSV_FIXTURE,
  MALFORMED_JSON_FIXTURE,
} from './data';
import {
  ALL_RULES,
  ISSUE_REPORT_HEADER,
  RULES,
  RULE_IDS,
  escapeCsvValue,
  filterIssues,
  issuesToCsv,
  validateRecords,
  type Issue,
  type RuleId,
} from './domain';

const records = parseCsvConnector(CSV_FIXTURE);

function onlyRule(ruleId: RuleId) {
  return validateRecords(records, [ruleId]);
}

describe('connectors', () => {
  it('parses six records from the CSV fixture', () => {
    expect(records).toHaveLength(6);
    expect(records.map((record) => record.rowNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('parses six records from the JSON fixture', () => {
    expect(parseJsonConnector(JSON_FIXTURE)).toHaveLength(6);
  });

  it('delivers identical records from both connectors', () => {
    expect(parseJsonConnector(JSON_FIXTURE)).toEqual(records);
  });

  it('keeps the quoted comma inside a single field', () => {
    expect(records[4].ownerEmail).toBe('ops, lead@@northline.invalid');
  });

  it('reports a missing CSV column as a controlled error', () => {
    expect(() => parseCsvConnector(MALFORMED_CSV_FIXTURE)).toThrow(ConnectorError);
    expect(() => parseCsvConnector(MALFORMED_CSV_FIXTURE)).toThrow(/ownerEmail/);
  });

  it('reports malformed JSON as a controlled error', () => {
    expect(() => parseJsonConnector(MALFORMED_JSON_FIXTURE)).toThrow(ConnectorError);
  });

  it('reports a non-array JSON payload as a controlled error', () => {
    expect(() => parseJsonConnector('{"assetId":"SYN-AST-1001"}')).toThrow(/array/);
  });

  it('reports a JSON record with a missing field as a controlled error', () => {
    expect(() =>
      parseJsonConnector('[{"assetId":"SYN-AST-1001","reading":42.5,"observedAt":"2026-02-02"}]'),
    ).toThrow(/ownerEmail/);
  });

  it('reports a ragged CSV row as a controlled error', () => {
    expect(() =>
      parseCsvConnector('assetId,reading,ownerEmail,observedAt\nSYN-AST-1001,42.5\n'),
    ).toThrow(/Row 2/);
  });

  it('reports an empty payload as a controlled error', () => {
    expect(() => parseCsvConnector('   ')).toThrow(/empty/);
    expect(() => parseJsonConnector('   ')).toThrow(/empty/);
  });
});

describe('rules in isolation', () => {
  it('flags exactly one missing asset identifier', () => {
    const result = onlyRule('required-asset-id');
    expect(result.total).toBe(1);
    expect(result.issues[0].rowNumber).toBe(3);
    expect(result.issues[0].field).toBe('assetId');
    expect(result.issues[0].value).toBe('');
  });

  it('flags exactly one repeated asset identifier', () => {
    const result = onlyRule('unique-asset-id');
    expect(result.total).toBe(1);
    expect(result.issues[0].rowNumber).toBe(2);
    expect(result.issues[0].value).toBe('SYN-AST-1001');
  });

  it('flags exactly one non-numeric reading', () => {
    const result = onlyRule('numeric-reading');
    expect(result.total).toBe(1);
    expect(result.issues[0].rowNumber).toBe(4);
    expect(result.issues[0].value).toBe('n/a');
  });

  it('flags exactly one reading outside the 0-100 range', () => {
    const result = onlyRule('reading-range');
    expect(result.total).toBe(1);
    expect(result.issues[0].rowNumber).toBe(1);
    expect(result.issues[0].value).toBe('148.2');
  });

  it('flags exactly one malformed owner address', () => {
    const result = onlyRule('email-format');
    expect(result.total).toBe(1);
    expect(result.issues[0].rowNumber).toBe(5);
    expect(result.issues[0].value).toBe('ops, lead@@northline.invalid');
  });

  it('never reports a failure on the valid sixth row', () => {
    const result = validateRecords(records, ALL_RULES);
    expect(result.issues.some((issue) => issue.rowNumber === 6)).toBe(false);
  });
});

describe('combined validation', () => {
  it('reports one failure per rule and five issues in total', () => {
    const result = validateRecords(records, ALL_RULES);

    expect(result.total).toBe(5);
    expect(result.recordsChecked).toBe(6);
    for (const rule of RULES) {
      expect(result.counts[rule.id]).toBe(1);
    }
  });

  it('puts the five failures on five distinct rows', () => {
    const result = validateRecords(records, ALL_RULES);
    const rows = result.issues.map((issue) => issue.rowNumber);
    expect(rows).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(rows).size).toBe(5);
  });

  it('drops the email failure when the format rule is disabled', () => {
    const enabled = RULE_IDS.filter((ruleId) => ruleId !== 'email-format');
    const result = validateRecords(records, enabled);

    expect(result.total).toBe(4);
    expect(result.counts['email-format']).toBe(0);
    expect(result.issues.some((issue) => issue.ruleId === 'email-format')).toBe(false);
  });

  it('produces the same counts from the JSON connector', () => {
    const fromCsv = validateRecords(parseCsvConnector(CSV_FIXTURE), ALL_RULES);
    const fromJson = validateRecords(parseJsonConnector(JSON_FIXTURE), ALL_RULES);

    expect(fromJson.total).toBe(fromCsv.total);
    expect(fromJson.counts).toEqual(fromCsv.counts);
    expect(fromJson.issues).toEqual(fromCsv.issues);
  });

  it('returns issues in a deterministic order', () => {
    const first = validateRecords(records, ALL_RULES);
    const second = validateRecords(records, ALL_RULES);

    expect(first.issues).toEqual(second.issues);
    expect(first.issues.map((issue) => issue.ruleId)).toEqual([
      'reading-range',
      'unique-asset-id',
      'required-asset-id',
      'numeric-reading',
      'email-format',
    ]);
  });

  it('reports no issue at all when every rule is disabled', () => {
    const result = validateRecords(records, []);
    expect(result.total).toBe(0);
    expect(result.issues).toEqual([]);
  });
});

describe('issue filtering', () => {
  const result = validateRecords(records, ALL_RULES);

  it('keeps only the issues of the selected rule', () => {
    const filtered = filterIssues(result.issues, { ruleId: 'email-format' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].rowNumber).toBe(5);
  });

  it('keeps only the issues of the selected row', () => {
    const filtered = filterIssues(result.issues, { rowNumber: 3 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].ruleId).toBe('required-asset-id');
  });

  it('combines the rule and row filters', () => {
    expect(filterIssues(result.issues, { ruleId: 'email-format', rowNumber: 3 })).toEqual([]);
  });

  it('returns every issue for the all filter', () => {
    expect(filterIssues(result.issues, { ruleId: 'all', rowNumber: 'all' })).toHaveLength(5);
  });
});

describe('issue report', () => {
  const result = validateRecords(records, ALL_RULES);

  it('writes one header row and one row per issue', () => {
    const lines = issuesToCsv(result.issues).trimEnd().split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe(ISSUE_REPORT_HEADER.join(','));
  });

  it('quotes values that contain a comma', () => {
    const csv = issuesToCsv(result.issues);
    expect(csv).toContain('"ops, lead@@northline.invalid"');
  });

  it('escapes double quotes by doubling them', () => {
    expect(escapeCsvValue('say "hello"')).toBe('"say ""hello"""');
  });

  it('leaves plain values unquoted', () => {
    expect(escapeCsvValue('SYN-AST-1001')).toBe('SYN-AST-1001');
  });

  it('escapes an injected comma in the offending value', () => {
    const injected: Issue = {
      ruleId: 'email-format',
      rowNumber: 9,
      field: 'ownerEmail',
      value: 'a,b"c',
      message: 'Row 9 failed.',
    };
    const lines = issuesToCsv([injected]).trimEnd().split('\n');
    expect(lines[1]).toBe('9,email-format,Owner email format,ownerEmail,"a,b""c",Row 9 failed.');
  });
});
