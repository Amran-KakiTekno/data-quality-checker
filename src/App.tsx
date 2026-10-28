import { useMemo, useState } from 'react';
import {
  CONNECTORS,
  ConnectorError,
  type ConnectorId,
} from './connectors';
import {
  ALL_RULES,
  RULES,
  RULE_IDS,
  filterIssues,
  issuesToCsv,
  validateRecords,
  type RuleId,
  type ValidationResult,
} from './domain';
import {
  CSV_FIXTURE,
  JSON_FIXTURE,
  MALFORMED_CSV_FIXTURE,
  MALFORMED_JSON_FIXTURE,
  type RawRecord,
} from './data';

interface ParseOutcome {
  records: RawRecord[];
  error: string | null;
}

const PAYLOADS: Record<ConnectorId, string> = {
  csv: CSV_FIXTURE,
  json: JSON_FIXTURE,
};

const MALFORMED_PAYLOADS: Record<ConnectorId, string> = {
  csv: MALFORMED_CSV_FIXTURE,
  json: MALFORMED_JSON_FIXTURE,
};

const CONNECTOR_ORDER: ConnectorId[] = ['csv', 'json'];

function issueKey(ruleId: RuleId, rowNumber: number): string {
  return `${ruleId}:${rowNumber}`;
}

function OrbitMark() {
  return (
    <svg
      className="orbit-mark"
      viewBox="0 0 64 64"
      role="img"
      aria-label="Dual Orbit mark"
      focusable="false"
    >
      <ellipse cx="32" cy="32" rx="26" ry="11" fill="none" stroke="currentColor" strokeWidth="2" />
      <ellipse
        cx="32"
        cy="32"
        rx="26"
        ry="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        transform="rotate(60 32 32)"
      />
      <circle cx="32" cy="32" r="5" fill="var(--amber)" />
    </svg>
  );
}

export default function App() {
  const [connectorId, setConnectorId] = useState<ConnectorId>('csv');
  const [malformed, setMalformed] = useState(false);
  const [enabledRuleIds, setEnabledRuleIds] = useState<RuleId[]>([...ALL_RULES]);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [clearedNotice, setClearedNotice] = useState(false);
  const [ruleFilter, setRuleFilter] = useState<RuleId | 'all'>('all');
  const [rowFilter, setRowFilter] = useState<number | 'all'>('all');
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);

  const parseOutcome = useMemo<ParseOutcome>(() => {
    const connector = CONNECTORS[connectorId];
    const payload = malformed ? MALFORMED_PAYLOADS[connectorId] : PAYLOADS[connectorId];
    try {
      return { records: connector.parse(payload), error: null };
    } catch (error) {
      const message =
        error instanceof ConnectorError
          ? error.message
          : 'The payload could not be read by this connector.';
      return { records: [], error: message };
    }
  }, [connectorId, malformed]);

  const invalidateResults = () => {
    if (result !== null) {
      setClearedNotice(true);
    }
    setResult(null);
    setSelectedIssueKey(null);
    setRuleFilter('all');
    setRowFilter('all');
  };

  const handleConnectorChange = (nextId: ConnectorId) => {
    setConnectorId(nextId);
    invalidateResults();
  };

  const handleMalformedToggle = (nextValue: boolean) => {
    setMalformed(nextValue);
    invalidateResults();
  };

  const handleRuleToggle = (ruleId: RuleId) => {
    setEnabledRuleIds((current) => {
      const next = new Set(current);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return RULE_IDS.filter((candidate) => next.has(candidate));
    });
    invalidateResults();
  };

  const handleRunValidation = () => {
    setClearedNotice(false);
    if (parseOutcome.error !== null) {
      setResult(null);
      setSelectedIssueKey(null);
      return;
    }
    setResult(validateRecords(parseOutcome.records, enabledRuleIds));
  };

  const handleDownload = () => {
    if (result === null) {
      return;
    }
    const csv = issuesToCsv(result.issues);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'data-quality-issues.csv';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const filteredIssues = result ? filterIssues(result.issues, { ruleId: ruleFilter, rowNumber: rowFilter }) : [];
  const selectedIssue =
    result && selectedIssueKey
      ? (filteredIssues.find((issue) => issueKey(issue.ruleId, issue.rowNumber) === selectedIssueKey) ??
        null)
      : null;
  const issueRowNumbers = result
    ? [...new Set(result.issues.map((issue) => issue.rowNumber))].sort((left, right) => left - right)
    : [];

  return (
    <div className="app-shell">
      <header className="masthead">
        <div className="masthead__identity">
          <OrbitMark />
          <div>
            <p className="eyebrow">Dual Orbit / Data Engineering demo</p>
            <h1>Data Quality Rules Lab</h1>
            <p className="lede">
              A technique demo for pluggable input connectors and a configurable rule engine,
              applied to a small set of invented asset readings.
            </p>
          </div>
        </div>
        <p className="notice" role="note">
          <strong>Synthetic data.</strong> Every record, value and rule on this page is invented
          for demonstration. Nothing here comes from a client, an employer or a real asset
          register, and no address can resolve to a real mailbox.
        </p>
      </header>

      <main className="lab">
        <section className="panel panel--wide" aria-labelledby="explanation-heading">
          <h2 id="explanation-heading">What this demo shows</h2>
          <p>
            A <strong>connector</strong> turns one source payload into a neutral record shape. The{' '}
            <strong>CSV connector</strong> and the <strong>JSON connector</strong> ship with the
            demo, and both deliver the same six records, so switching between them never changes a
            count. On top of that sits a <strong>rule engine</strong>: five data-driven rules that
            can be switched on and off independently. Running the engine reports the total number of
            issues and a failure count per rule, each issue can be drilled into for a plain-language
            explanation and the offending value, and the whole run can be exported as a CSV report
            generated in the browser.
          </p>
        </section>

        <section className="panel" aria-labelledby="connector-heading">
          <h2 id="connector-heading">Input connector</h2>
          <fieldset className="switch">
            <legend className="switch__legend">Connector</legend>
            {CONNECTOR_ORDER.map((id) => {
              const connector = CONNECTORS[id];
              return (
                <label className="switch__option" key={id}>
                  <input
                    type="radio"
                    name="connector"
                    value={id}
                    checked={connectorId === id}
                    data-testid={`connector-${id}`}
                    onChange={() => handleConnectorChange(id)}
                  />
                  <span>{connector.label}</span>
                </label>
              );
            })}
          </fieldset>
          <p className="panel__note">{CONNECTORS[connectorId].summary}</p>
          <label className="toggle">
            <input
              type="checkbox"
              checked={malformed}
              data-testid="malformed-toggle"
              onChange={(event) => handleMalformedToggle(event.target.checked)}
            />
            <span>Feed a malformed sample payload</span>
          </label>
          <p className="panel__note">
            The malformed sample shows how a connector reports unreadable input: the page shows a
            controlled error instead of validating half a payload.
          </p>
        </section>

        <section className="panel" aria-labelledby="rules-heading">
          <h2 id="rules-heading">Rules</h2>
          <fieldset className="rules">
            <legend className="rules__legend">Enabled rules</legend>
            {RULES.map((rule) => (
              <div className="rules__item" key={rule.id}>
                <label className="rules__label">
                  <input
                    type="checkbox"
                    checked={enabledRuleIds.includes(rule.id)}
                    data-testid={`rule-toggle-${rule.id}`}
                    onChange={() => handleRuleToggle(rule.id)}
                  />
                  <span>{rule.label}</span>
                </label>
                <p className="rules__description">{rule.description}</p>
              </div>
            ))}
          </fieldset>
          <div className="controls">
            <button
              type="button"
              className="btn btn--primary"
              data-testid="run-validation"
              onClick={handleRunValidation}
            >
              Run validation
            </button>
            <button
              type="button"
              className="btn"
              data-testid="download-report"
              onClick={handleDownload}
              disabled={result === null}
            >
              Download issue report
            </button>
          </div>
          {clearedNotice ? (
            <p className="inline-note" role="status" data-testid="results-cleared">
              The connector or the rule selection changed, so the previous results were cleared.
              Run the validation again.
            </p>
          ) : null}
        </section>

        <section className="panel panel--wide" aria-labelledby="summary-heading">
          <h2 id="summary-heading">Validation summary</h2>
          {parseOutcome.error !== null ? (
            <p className="error" role="alert" data-testid="connector-error">
              <strong>Connector error.</strong> {parseOutcome.error}
            </p>
          ) : null}
          {result === null ? (
            <p className="empty" data-testid="no-result">
              {parseOutcome.error !== null
                ? 'The payload could not be read, so no validation was run.'
                : 'No validation has been run yet. Choose a connector and the rules you want, then run the validation.'}
            </p>
          ) : (
            <div className="stat-row">
              <div className="stat stat--total">
                <span className="stat__label">Total issues</span>
                <span className="stat__value" data-testid="issue-total">
                  {result.total}
                </span>
              </div>
              <div className="stat stat--records">
                <span className="stat__label">Records checked</span>
                <span className="stat__value" data-testid="record-count">
                  {result.recordsChecked}
                </span>
              </div>
              {RULES.map((rule) => (
                <div
                  className="stat stat--rule"
                  key={rule.id}
                  data-testid={`rule-stat-${rule.id}`}
                >
                  <span className="stat__label">{rule.label}</span>
                  <span className="stat__value stat__value--rule" data-testid={`rule-count-${rule.id}`}>
                    {result.counts[rule.id]}
                  </span>
                  {enabledRuleIds.includes(rule.id) ? null : (
                    <span className="stat__tag" data-testid={`rule-state-${rule.id}`}>
                      disabled
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel panel--wide" aria-labelledby="records-heading">
          <h2 id="records-heading">Parsed records</h2>
          {parseOutcome.records.length === 0 ? (
            <p className="empty" data-testid="records-empty">
              The connector did not deliver any records for the current payload.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="records-table" data-testid="records-table">
                <caption className="sr-only">
                  Records delivered by the {CONNECTORS[connectorId].label}, exactly as parsed.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">assetId</th>
                    <th scope="col">reading</th>
                    <th scope="col">ownerEmail</th>
                    <th scope="col">observedAt</th>
                  </tr>
                </thead>
                <tbody>
                  {parseOutcome.records.map((record) => (
                    <tr key={record.rowNumber} data-testid={`record-row-${record.rowNumber}`}>
                      <td data-label="Row">{record.rowNumber}</td>
                      <td data-label="assetId">{record.assetId === '' ? '(empty)' : record.assetId}</td>
                      <td data-label="reading">{record.reading === '' ? '(empty)' : record.reading}</td>
                      <td data-label="ownerEmail">{record.ownerEmail === '' ? '(empty)' : record.ownerEmail}</td>
                      <td data-label="observedAt">{record.observedAt === '' ? '(empty)' : record.observedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel panel--wide" aria-labelledby="issues-heading">
          <h2 id="issues-heading">Issues</h2>
          <div className="filters">
            <label className="filter">
              <span>Rule</span>
              <select
                value={ruleFilter}
                data-testid="filter-rule"
                onChange={(event) => setRuleFilter(event.target.value as RuleId | 'all')}
                disabled={result === null}
              >
                <option value="all">All rules</option>
                {RULES.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span>Row</span>
              <select
                value={String(rowFilter)}
                data-testid="filter-row"
                onChange={(event) =>
                  setRowFilter(
                    event.target.value === 'all' ? 'all' : Number(event.target.value),
                  )
                }
                disabled={result === null}
              >
                <option value="all">All rows</option>
                {issueRowNumbers.map((rowNumber) => (
                  <option key={rowNumber} value={rowNumber}>
                    Row {rowNumber}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {result === null ? (
            <p className="empty" data-testid="issues-empty">
              Run the validation to list the issues that were found.
            </p>
          ) : filteredIssues.length === 0 ? (
            <p className="empty" data-testid="no-matching-issues">
              No issue matches the current filter.
            </p>
          ) : (
            <ul className="issues" data-testid="issues-list">
              {filteredIssues.map((issue) => {
                const key = issueKey(issue.ruleId, issue.rowNumber);
                const isSelected = key === selectedIssueKey;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className="issue-button"
                      data-testid="issue-item"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedIssueKey(key)}
                    >
                      <span className="issue-button__rule">{RULES.find((rule) => rule.id === issue.ruleId)?.label}</span>
                      <span className="issue-button__row">row {issue.rowNumber}</span>
                      <span className="issue-button__field">{issue.field}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="panel__note">
            Select an issue to read the explanation and the offending value. The download button
            writes every issue of the current run to a CSV file generated in the browser.
          </p>
        </section>

        <section className="panel panel--wide" aria-labelledby="detail-heading">
          <h2 id="detail-heading">Issue detail</h2>
          <div aria-live="polite" data-testid="issue-detail">
            {selectedIssue ? (
              <article className="detail">
                <h3 data-testid="issue-detail-rule">
                  {RULES.find((rule) => rule.id === selectedIssue.ruleId)?.label}
                </h3>
                <p className="detail__meta">
                  <span className="tag" data-testid="issue-detail-row">
                    row {selectedIssue.rowNumber}
                  </span>
                  <span className="tag tag--field" data-testid="issue-detail-field">
                    {selectedIssue.field}
                  </span>
                </p>
                <p className="detail__message" data-testid="issue-detail-message">
                  {selectedIssue.message}
                </p>
                <p className="detail__value-label">Offending value</p>
                <p className="detail__value" data-testid="issue-detail-value">
                  {selectedIssue.value === '' ? '(empty)' : selectedIssue.value}
                </p>
              </article>
            ) : (
              <p className="empty" data-testid="issue-detail-empty">
                No issue selected yet. Choose an issue from the list to see the explanation and the
                offending value.
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="colophon">
        <p>
          Clean-room technique demo by Dual Orbit. Synthetic fixtures only - no client, employer or
          personal data is present, and the demo is not a production data quality service.
        </p>
      </footer>
    </div>
  );
}
