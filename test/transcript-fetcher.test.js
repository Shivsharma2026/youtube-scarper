import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioSizeLimitError } from '../src/audio.js';
import { createTranscriptFetcher } from '../src/transcript-fetcher.js';

test('createTranscriptFetcher returns caption transcript when available', async () => {
  const transcriptFetcher = createTranscriptFetcher({
    captionFetcher: async () => ({
      status: 'ok',
      languageCode: 'en',
      transcript: 'Caption transcript'
    }),
    transcriber: {
      transcribeAudio: async () => {
        throw new Error('should not run');
      }
    }
  });

  const result = await transcriptFetcher('video-1');

  assert.deepEqual(result, {
    status: 'ok',
    languageCode: 'en',
    transcript: 'Caption transcript',
    source: 'captions'
  });
});

test('createTranscriptFetcher falls back to audio transcription', async () => {
  const transcriptFetcher = createTranscriptFetcher({
    captionFetcher: async () => ({
      status: 'missing_transcript',
      languageCode: 'en',
      transcript: null
    }),
    audioDownloader: async () => ({
      audioParts: [
        {
          audioBuffer: Buffer.from('audio'),
          mimeType: 'audio/webm',
          fileName: 'video-1.webm'
        }
      ]
    }),
    transcriber: {
      transcribeAudioParts: async () => 'Fallback transcript'
    }
  });

  const result = await transcriptFetcher('video-1');

  assert.deepEqual(result, {
    status: 'ok',
    languageCode: 'en',
    transcript: 'Fallback transcript',
    source: 'audio_transcription'
  });
});

test('createTranscriptFetcher returns missing transcript when audio is too large', async () => {
  const transcriptFetcher = createTranscriptFetcher({
    captionFetcher: async () => ({
      status: 'missing_transcript',
      languageCode: 'en',
      transcript: null
    }),
    audioDownloader: async () => {
      throw new AudioSizeLimitError('too large');
    },
    transcriber: {
      transcribeAudioParts: async () => 'unused'
    }
  });

  const result = await transcriptFetcher('video-1');

  assert.deepEqual(result, {
    status: 'missing_transcript',
    languageCode: 'en',
    transcript: null,
    source: null
  });
});
