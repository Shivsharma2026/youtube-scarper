import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectMimeType,
  formatBytesForYtDlp,
  formatTimestamp,
  planAudioChunks
} from '../src/audio.js';

test('formatBytesForYtDlp formats byte limits in megabytes', () => {
  assert.equal(formatBytesForYtDlp(24 * 1024 * 1024), '24M');
});

test('detectMimeType resolves common audio extensions', () => {
  assert.equal(detectMimeType('/tmp/audio.webm'), 'audio/webm');
  assert.equal(detectMimeType('/tmp/audio.m4a'), 'audio/mp4');
  assert.equal(detectMimeType('/tmp/audio.bin'), 'application/octet-stream');
});

test('formatTimestamp renders hh:mm:ss', () => {
  assert.equal(formatTimestamp(3661), '01:01:01');
});

test('planAudioChunks splits large audio into multiple chunks', () => {
  const chunks = planAudioChunks({
    durationSeconds: 3600,
    estimatedBytes: 60 * 1024 * 1024,
    targetChunkBytes: 20 * 1024 * 1024,
    maxAudioBytes: 24 * 1024 * 1024
  });

  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0], {
    index: 0,
    startSeconds: 0,
    endSeconds: 1200
  });
});
