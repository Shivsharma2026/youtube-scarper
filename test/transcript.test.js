import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractPlayerResponse,
  parseJson3Transcript,
  parseTranscriptXml,
  selectTrack
} from '../src/transcript.js';

test('selectTrack prefers English standard captions', () => {
  const selected = selectTrack([
    { languageCode: 'fr', baseUrl: 'fr-url' },
    { languageCode: 'en', baseUrl: 'en-url' }
  ]);

  assert.equal(selected.baseUrl, 'en-url');
});

test('parseTranscriptXml flattens XML transcript text', () => {
  const transcript = parseTranscriptXml(
    '<transcript><text start="0" dur="1">Hello &amp; welcome</text><text start="1" dur="1">Ontario market</text></transcript>'
  );

  assert.equal(transcript, 'Hello & welcome Ontario market');
});

test('extractPlayerResponse parses the initial player payload', () => {
  const player = extractPlayerResponse(
    '<script>var x = 1;</script><script>ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"languageCode":"en","baseUrl":"https://example.com"}]}}};</script>'
  );

  assert.equal(
    player.captions.playerCaptionsTracklistRenderer.captionTracks[0].languageCode,
    'en'
  );
});

test('parseJson3Transcript flattens json3 caption events', () => {
  const transcript = parseJson3Transcript({
    events: [
      {
        segs: [{ utf8: 'Hello' }, { utf8: ' world' }]
      },
      {
        segs: [{ utf8: 'Ontario' }]
      }
    ]
  });

  assert.equal(transcript, 'Hello world Ontario');
});
