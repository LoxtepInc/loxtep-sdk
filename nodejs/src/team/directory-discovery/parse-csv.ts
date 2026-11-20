/**
 * Parse a CSV roster into DirectoryPerson rows.
 * Does not start Products ingest.
 */

import { directoryPersonFingerprint } from './fingerprint.js';
import type { DirectoryPerson } from './types.js';

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function decodeCsvData(data: string, encoding: 'base64' | 'plain'): string {
  if (encoding === 'plain') {
    return data;
  }
  return Buffer.from(data, 'base64').toString('utf8');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/**
 * Expected columns (header, case-insensitive): email (required),
 * display_name | name, department, external_id.
 */
export function parseDirectoryCsv(opts: {
  csv_data: string;
  csv_encoding?: 'base64' | 'plain';
  delimiter?: ',' | ';' | '\t';
  source?: string;
}): DirectoryPerson[] {
  const source = opts.source ?? 'csv';
  const text = decodeCsvData(opts.csv_data, opts.csv_encoding ?? 'plain');
  const delimiter = opts.delimiter ?? ',';
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headerCells = splitCsvLine(lines[0], delimiter).map((h) => h.toLowerCase());
  const hasHeader = headerCells.some((h) => h === 'email' || h.includes('email'));
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const col = (names: string[]): number => {
    for (const name of names) {
      const idx = headerCells.indexOf(name);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const emailIdx = hasHeader ? col(['email', 'e-mail', 'mail']) : 0;
  const nameIdx = hasHeader ? col(['display_name', 'name', 'full_name']) : 1;
  const deptIdx = hasHeader ? col(['department', 'dept']) : -1;
  const externalIdx = hasHeader ? col(['external_id', 'id', 'employee_id']) : -1;

  const people: DirectoryPerson[] = [];
  const seen = new Set<string>();

  for (const line of dataLines) {
    const cells = splitCsvLine(line, delimiter);
    const emailRaw = (emailIdx >= 0 ? cells[emailIdx] : cells[0])?.trim() ?? '';
    const email = emailRaw.toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      continue;
    }
    if (seen.has(email)) {
      continue;
    }
    seen.add(email);

    const displayName = (nameIdx >= 0 ? cells[nameIdx] : '')?.trim() || undefined;
    const department = (deptIdx >= 0 ? cells[deptIdx] : '')?.trim() || undefined;
    const externalId = (externalIdx >= 0 ? cells[externalIdx] : '')?.trim() || undefined;

    people.push({
      email,
      display_name: displayName,
      department,
      external_id: externalId,
      status: 'active',
      source,
      fingerprint: directoryPersonFingerprint(email, source),
    });
  }

  return people;
}
