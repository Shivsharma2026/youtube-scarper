import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig, parseChannelIds } from '../src/config.js';

test('parseChannelIds trims values and removes blanks', () => {
  assert.deepEqual(parseChannelIds(' one, two ,, three '), ['one', 'two', 'three']);
});

test('loadConfig validates required fields', () => {
  assert.throws(
    () =>
      loadConfig({
        YOUTUBE_API_KEY: 'yt',
        OPENAI_API_KEY: 'oa',
        CHANNEL_IDS: 'one'
      }, '/tmp/project'),
    /expected at least two channel IDs/
  );
});

test('loadConfig returns resolved paths and values', () => {
  const config = loadConfig(
    {
      YOUTUBE_API_KEY: 'yt',
      OPENAI_API_KEY: 'oa',
      OPENAI_MODEL: 'gpt-test',
      CHANNEL_IDS: 'one,two',
      OUTPUT_DIR: './out'
    },
    '/tmp/project'
  );

  assert.equal(config.youtubeApiKey, 'yt');
  assert.equal(config.openAiApiKey, 'oa');
  assert.equal(config.openAiModel, 'gpt-test');
  assert.deepEqual(config.channelIds, ['one', 'two']);
  assert.equal(config.outputDir, '/tmp/project/out');
  assert.equal(config.processedStorePath, '/tmp/project/data/processed-videos.json');
});
