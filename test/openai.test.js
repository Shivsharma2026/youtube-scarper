import test from 'node:test';
import assert from 'node:assert/strict';

import { OpenAiSummarizer } from '../src/openai.js';

test('summarizeVideo asks for original multi-option social copy and trims output', async () => {
  let requestBody = null;

  const summarizer = new OpenAiSummarizer({
    apiKey: 'test-key',
    model: 'gpt-test',
    transcriptionModel: 'gpt-test-transcribe',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            summaryLong: '  Internal recap.  ',
            summarySocial:
              '  Option 1: First post.\n\nOption 2: Second post.\n\nOption 3: Third post.  '
          })
        })
      };
    }
  });

  const result = await summarizer.summarizeVideo({
    title: 'Market update',
    channelTitle: 'Channel One',
    publishedAt: '2026-03-10T10:00:00Z',
    videoUrl: 'https://www.youtube.com/watch?v=video-1',
    transcript: 'Transcript text'
  });

  assert.match(
    requestBody.input,
    /summarySocial should contain exactly 3 distinct social-media-ready post options/
  );
  assert.match(requestBody.input, /Do not imitate the video speaker, guest, host, channel voice/);
  assert.equal(result.summaryLong, 'Internal recap.');
  assert.equal(
    result.summarySocial,
    'Option 1: First post.\n\nOption 2: Second post.\n\nOption 3: Third post.'
  );
});
