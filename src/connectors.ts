/**
 * Input connectors for the Data Quality Rules Lab demo.
 *
 * A connector turns one source payload into the neutral `RawRecord` shape the
 * rule engine understands. Two connectors ship with the demo - a CSV connector
 * and a JSON connector - and both deliver the same six records for the same
 * authored fixture.
 *
 * Malformed input never crashes the page: every connector failure is raised as
 * a `ConnectorError`, a controlled error with a message the UI can show.
 */

import {
  REQUIRED_FIELDS,
  type RawRecord,
} from './data';

export type ConnectorId = 'csv' | 'json';

/**
 * A controlled parse failure. The UI renders `message` in an error banner and
 * refuses to validate a partial payload.
 */
export class ConnectorError extends Error {
  readonly connectorId: ConnectorId;

  constructor(connectorId: ConnectorId, message: string) {
    super(message);
    this.name = 'ConnectorError';
    this.connectorId = connectorId;
  }
}

/** A pluggable source adapter. */
export interface Connector {
  /** Stable identifier used by the UI and by the fixtures. */
  id: ConnectorId;
  /** Human readable name shown in the connector switch. */
  label: string;
  /** One-line description of what the connector expects. */
  summary: string;
  /** Parses a payload into records, or throws a `ConnectorError`. */
  parse(payload: string): RawRecord[];
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeJsonError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'unknown parse error';
}

/* ------------------------------------------------------------------ CSV */

/**
 * Splits CSV text into rows of fields, honouring quoted fields, escaped
 * double quotes and embedded commas.
 */
function splitCsvRows(payload: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };

  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (index < payload.length) {
    const char = payload[index];

    if (inQuotes) {
      if (char === '"') {
        if (payload[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      if (field.length > 0) {
        throw new ConnectorError(
          'csv',
          'The CSV payload has an unexpected quote inside an unquoted value.',
        );
      }
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ',') {
      pushField();
      index += 1;
      continue;
    }

    if (char === '\r') {
      index += 1;
      continue;
    }

    if (char === '\n') {
      pushRow();
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (inQuotes) {
    throw new ConnectorError('csv', 'The CSV payload ends inside a quoted value.');
  }

  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

/**
 * Parses a CSV payload into records.
 *
 * The header row must declare every required column exactly once. Data rows
 * must carry the same number of fields as the header.
 */
export function parseCsvConnector(payload: string): RawRecord[] {
  if (payload.trim() === '') {
    throw new ConnectorError('csv', 'The CSV payload is empty.');
  }

  const rows = splitCsvRows(payload);
  const header = rows[0].map((name) => name.trim());

  if (header.length === 1 && header[0] === '') {
    throw new ConnectorError('csv', 'The CSV payload has no header row.');
  }

  const missing = REQUIRED_FIELDS.filter((field) => !header.includes(field));
  if (missing.length > 0) {
    throw new ConnectorError(
      'csv',
      `The CSV header is missing the required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`,
    );
  }

  const duplicates = REQUIRED_FIELDS.filter(
    (field) => header.filter((name) => name === field).length > 1,
  );
  if (duplicates.length > 0) {
    throw new ConnectorError(
      'csv',
      `The CSV header repeats the column${duplicates.length > 1 ? 's' : ''}: ${duplicates.join(', ')}.`,
    );
  }

  const records: RawRecord[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const cells = rows[rowIndex];
    const isBlank = cells.length === 1 && cells[0].trim() === '';
    if (isBlank) {
      continue;
    }

    if (cells.length !== header.length) {
      throw new ConnectorError(
        'csv',
        `Row ${rowIndex + 1} has ${cells.length} field${cells.length === 1 ? '' : 's'} but the header declares ${header.length}.`,
      );
    }

    const values = new Map<string, string>();
    header.forEach((name, cellIndex) => {
      values.set(name, (cells[cellIndex] ?? '').trim());
    });

    records.push({
      rowNumber: records.length + 1,
      assetId: values.get('assetId') ?? '',
      reading: values.get('reading') ?? '',
      ownerEmail: values.get('ownerEmail') ?? '',
      observedAt: values.get('observedAt') ?? '',
    });
  }

  if (records.length === 0) {
    throw new ConnectorError('csv', 'The CSV payload contains a header but no data rows.');
  }

  return records;
}

/* ----------------------------------------------------------------- JSON */

/**
 * Parses a JSON array payload into records. Every entry must be an object
 * that declares all four required fields; the `reading` field may be a number
 * or a string, the remaining fields must be strings.
 */
export function parseJsonConnector(payload: string): RawRecord[] {
  if (payload.trim() === '') {
    throw new ConnectorError('json', 'The JSON payload is empty.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    throw new ConnectorError(
      'json',
      `The JSON payload could not be parsed: ${describeJsonError(error)}.`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new ConnectorError('json', 'The JSON payload must be an array of records.');
  }

  if (parsed.length === 0) {
    throw new ConnectorError('json', 'The JSON payload contains no records.');
  }

  return parsed.map((entry, index) => {
    const rowNumber = index + 1;

    if (!isRecordObject(entry)) {
      throw new ConnectorError('json', `Record ${rowNumber} is not a JSON object.`);
    }

    const missing = REQUIRED_FIELDS.filter((field) => !(field in entry));
    if (missing.length > 0) {
      throw new ConnectorError(
        'json',
        `Record ${rowNumber} is missing the required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`,
      );
    }

    const assetId = entry.assetId;
    const ownerEmail = entry.ownerEmail;
    const observedAt = entry.observedAt;
    const reading = entry.reading;

    if (typeof assetId !== 'string') {
      throw new ConnectorError('json', `Record ${rowNumber} has a non-text "assetId" field.`);
    }
    if (typeof ownerEmail !== 'string') {
      throw new ConnectorError('json', `Record ${rowNumber} has a non-text "ownerEmail" field.`);
    }
    if (typeof observedAt !== 'string') {
      throw new ConnectorError('json', `Record ${rowNumber} has a non-text "observedAt" field.`);
    }
    if (typeof reading !== 'string' && typeof reading !== 'number') {
      throw new ConnectorError(
        'json',
        `Record ${rowNumber} has a "reading" field that is neither a number nor text.`,
      );
    }
    if (typeof reading === 'number' && !Number.isFinite(reading)) {
      throw new ConnectorError('json', `Record ${rowNumber} has a non-finite "reading" value.`);
    }

    return {
      rowNumber,
      assetId: assetId.trim(),
      reading: String(reading).trim(),
      ownerEmail: ownerEmail.trim(),
      observedAt: observedAt.trim(),
    };
  });
}

/* ------------------------------------------------------------ connectors */

export const csvConnector: Connector = {
  id: 'csv',
  label: 'CSV connector',
  summary: 'Reads a header row plus one row per record, honouring quoted fields.',
  parse: parseCsvConnector,
};

export const jsonConnector: Connector = {
  id: 'json',
  label: 'JSON connector',
  summary: 'Reads a JSON array of objects with the four neutral fields.',
  parse: parseJsonConnector,
};

/** Every connector the demo ships with, keyed by identifier. */
export const CONNECTORS: Record<ConnectorId, Connector> = {
  csv: csvConnector,
  json: jsonConnector,
};

export type { RawRecord };
