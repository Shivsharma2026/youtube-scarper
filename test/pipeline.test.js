import test from 'node:test';
import assert from 'node:assert/strict';

import { pickLatestUnprocessedVideo, runPipeline } from '../src/pipeline.js';

test('pickLatestUnprocessedVideo returns the first unprocessed video', () => {
  const videos = [{ videoId: 'a' }, { videoId: 'b' }];
  const processed = new Set(['a']);

  assert.deepEqual(pickLatestUnprocessedVideo(videos, processed, false), { videoId: 'b' });
});

test('pickLatestUnprocessedVideo returns first video when forced', () => {
  const videos = [{ videoId: 'a' }, { videoId: 'b' }];
  const processed = new Set(['a', 'b']);

  assert.deepEqual(pickLatestUnprocessedVideo(videos, processed, true), { videoId: 'a' });
});

test('runPipeline processes a transcript-backed video', async (t) => {
  const storeState = {
    artifacts: [],
    socialDrafts: [],
    transcripts: [],
    summaries: [],
    processed: new Set()
  };

  const report = await runPipeline({
    channelIds: ['channel-1'],
    limit: 1,
    force: false,
    youtubeClient: {
      getChannel: async () => ({
        channelId: 'channel-1',
        title: 'Channel One',
        uploadsPlaylistId: 'playlist-1'
      }),
      getLatestVideos: async () => [
        {
          videoId: 'video-1',
          title: 'Latest market update',
          description: 'desc',
          publishedAt: '2026-03-10T10:00:00Z'
        }
      ]
    },
    summarizer: {
      summarizeVideo: async () => ({
        summaryLong: 'Long summary',
        summarySocial: 'Short summary'
      })
    },
    transcriptFetcher: async () => ({
      status: 'ok',
      languageCode: 'en',
      transcript: 'Ontario market update'
    }),
    store: {
      ensureReady: async () => {},
      loadProcessedVideoIds: async () => storeState.processed,
      writeVideoArtifact: async (artifact) => {
        storeState.artifacts.push(artifact);
        return `/tmp/latest-market-update.json`;
      },
      writeSocialDraft: async (artifact) => {
        storeState.socialDrafts.push(artifact.summarySocial);
        return `/tmp/latest-market-update.social.txt`;
      },
      writeTranscriptText: async (artifact) => {
        storeState.transcripts.push(artifact.transcript);
        return `/tmp/latest-market-update.transcript.txt`;
      },
      writeLongSummaryText: async (artifact) => {
        storeState.summaries.push(artifact.summaryLong);
        return `/tmp/latest-market-update.summary.txt`;
      },
      recordProcessedVideo: async (videoId) => {
        storeState.processed.add(videoId);
      }
    },
    now: new Date('2026-03-10T12:00:00Z')
  });

  assert.equal(report.hasErrors, false);
  assert.equal(report.results[0].status, 'ok');
  assert.equal(storeState.artifacts[0].summarySocial, 'Short summary');
  assert.equal(report.results[0].socialDraftPath, '/tmp/latest-market-update.social.txt');
  assert.equal(report.results[0].transcriptTextPath, '/tmp/latest-market-update.transcript.txt');
  assert.equal(report.results[0].summaryTextPath, '/tmp/latest-market-update.summary.txt');
  assert.deepEqual(storeState.socialDrafts, ['Short summary']);
  assert.deepEqual(storeState.transcripts, ['Ontario market update']);
  assert.deepEqual(storeState.summaries, ['Long summary']);
});

test('runPipeline records missing transcripts without summarizing', async (t) => {
  let summarizeCalls = 0;

  const report = await runPipeline({
    channelIds: ['channel-1'],
    limit: 1,
    force: false,
    youtubeClient: {
      getChannel: async () => ({
        channelId: 'channel-1',
        title: 'Channel One',
        uploadsPlaylistId: 'playlist-1'
      }),
      getLatestVideos: async () => [
        {
          videoId: 'video-1',
          title: 'Latest market update',
          description: 'desc',
          publishedAt: '2026-03-10T10:00:00Z'
        }
      ]
    },
    summarizer: {
      summarizeVideo: async () => {
        summarizeCalls += 1;
        return {
          summaryLong: 'unused',
          summarySocial: 'unused'
        };
      }
    },
    transcriptFetcher: async () => ({
      status: 'missing_transcript',
      languageCode: null,
      transcript: null
    }),
    store: {
      ensureReady: async () => {},
      loadProcessedVideoIds: async () => new Set(),
      writeVideoArtifact: async (artifact) => `/tmp/${artifact.videoId}.json`,
      writeSocialDraft: async () => {
        throw new Error('should not run');
      },
      writeTranscriptText: async () => {
        throw new Error('should not run');
      },
      writeLongSummaryText: async () => {
        throw new Error('should not run');
      },
      recordProcessedVideo: async () => {}
    },
    now: new Date('2026-03-10T12:00:00Z')
  });

  assert.equal(report.results[0].status, 'missing_transcript');
  assert.equal(summarizeCalls, 0);
});
