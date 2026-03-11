import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../src/args.js';

test('parseArgs returns defaults', () => {
  assert.deepEqual(parseArgs([]), {
    force: false,
    limit: 1,
    channel: null
  });
});

test('parseArgs parses supported flags', () => {
  assert.deepEqual(parseArgs(['--force', '--limit=3', '--channel=abc']), {
    force: true,
    limit: 3,
    channel: 'abc'
  });
});

test('parseArgs rejects invalid limit', () => {
  assert.throws(() => parseArgs(['--limit=0']), /positive integer/);
});
