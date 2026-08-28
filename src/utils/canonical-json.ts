import { createHash } from 'node:crypto';

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalJsonError';
  }
}

function canonicalize(value: unknown, path: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CanonicalJsonError(`${path} must be a finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`));
  }
  if (typeof value !== 'object') {
    throw new CanonicalJsonError(`${path} contains a non-JSON ${typeof value} value`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CanonicalJsonError(`${path} must contain only plain JSON objects`);
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key], `${path}.${key}`)])
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, '$'));
}

export function sha256Digest(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export function canonicalJsonSha256Digest(value: unknown): string {
  return sha256Digest(Buffer.from(canonicalJson(value), 'utf8'));
}
