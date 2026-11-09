import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('batch-tracker/tracker.js', 'utf8');
const start = source.indexOf('async function saveBiologicalOperation(event) {');
const end = source.indexOf('\nfunction ', start);
assert.ok(start >= 0 && end > start, 'biological operation writer must remain a named function');

const writer = source.slice(start, end);
assert.match(writer, /getManualWriteIdempotencyKey\\(\\s*[\"']biological-operation[\"']/,
  'biological operation retries must reuse the durable session-scoped idempotency key helper');
assert.match(writer, /p_idempotency_key:\s*idempotencyKey/,
  'the durable key must be sent to the atomic biological operation RPC');
assert.match(writer, /clearManualWriteIdempotencyKey\(["']biological-operation["']\)/,
  'the pending key must be cleared only after the RPC confirms success');
assert.doesNotMatch(source, /let pendingBiologicalOperationKey\s*=\s*null/,
  'biological operation idempotency must not depend on volatile in-memory-only state');
assert.doesNotMatch(writer, /crypto\.randomUUID\(\)/,
  'the writer must not generate a fresh key on every page load or retry');

const helperStart = source.indexOf('async function getManualWriteIdempotencyKey(scope, payload) {');
const helperEnd = source.indexOf('\nfunction clearManualWriteIdempotencyKey', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'shared durable idempotency helper must remain available');
const helper = source.slice(helperStart, helperEnd);
assert.match(helper, /sessionStorage\.getItem\(storageKey\)/,
  'pending write identity must survive a page reload in the current tab');
assert.match(helper, /sessionStorage\.setItem\(storageKey, JSON\.stringify\(next\)\)/,
  'new idempotency keys must be persisted before sending the write');
assert.match(helper, /persisted\?\.fingerprint === fingerprint && persisted\?\.key/,
  'only retries with the identical payload may reuse the persisted key');

console.log('PASS: biological operation retries reuse a durable session-scoped idempotency key');
