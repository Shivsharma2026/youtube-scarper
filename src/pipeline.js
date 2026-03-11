import { fetchTranscript } from './transcript.js';

export async function runPipeline({
  channelIds,
  limit,
  force,
  youtubeClient,
  summarizer,
  store,
  transcriptFetcher = fetchTranscript,
  now = new Date()
}) {
  await store.ensureReady();
  const processedVideoIds = await store.loadProcessedVideoIds();
  const selectedChannelIds = channelIds;
  const results = [];

  for (const channelId of selectedChannelIds) {
    try {
      const channel = await youtubeClient.getChannel(channelId);
      const videos = await youtubeClient.getLatestVideos(channel.uploadsPlaylistId, limit);

      if (!videos.length) {
        results.push({
          channelId,
          status: 'no_videos'
        });
        continue;
      }

      const candidate = pickLatestUnprocessedVideo(videos, processedVideoIds, force);
      if (!candidate) {
        results.push({
          channelId,
          channelTitle: channel.title,
          status: 'already_processed'
        });
        continue;
      }

      const transcriptResult = await transcriptFetcher(candidate.videoId);
      const artifactBase = {
        channelId,
        channelTitle: channel.title,
        videoId: candidate.videoId,
        videoUrl: `https://www.youtube.com/watch?v=${candidate.videoId}`,
        title: candidate.title,
        description: candidate.description,
        publishedAt: candidate.publishedAt,
        transcriptSource: transcriptResult.source || null,
        transcriptLanguageCode: transcriptResult.languageCode,
        processedAt: now.toISOString()
      };

      if (transcriptResult.status !== 'ok') {
        const artifact = {
          ...artifactBase,
          transcript: null,
          summaryLong: null,
          summarySocial: null,
          status: 'missing_transcript'
        };

        const artifactPath = await store.writeVideoArtifact(artifact);
        await store.recordProcessedVideo(candidate.videoId, {
          channelId,
          status: artifact.status,
          artifactPath,
          processedAt: artifact.processedAt
        });
        processedVideoIds.add(candidate.videoId);
        results.push({
          channelId,
          channelTitle: channel.title,
          videoId: candidate.videoId,
          status: artifact.status,
          artifactPath
        });
        continue;
      }

      const summary = await summarizer.summarizeVideo({
        title: candidate.title,
        channelTitle: channel.title,
        publishedAt: candidate.publishedAt,
        videoUrl: artifactBase.videoUrl,
        transcript: transcriptResult.transcript
      });

      const artifact = {
        ...artifactBase,
        transcript: transcriptResult.transcript,
        summaryLong: summary.summaryLong,
        summarySocial: summary.summarySocial,
        status: 'ok'
      };

      const artifactPath = await store.writeVideoArtifact(artifact);
      const socialDraftPath = await store.writeSocialDraft(artifact);
      const transcriptTextPath = await store.writeTranscriptText(artifact);
      const summaryTextPath = await store.writeLongSummaryText(artifact);
      await store.recordProcessedVideo(candidate.videoId, {
        channelId,
        status: artifact.status,
        artifactPath,
        socialDraftPath,
        transcriptTextPath,
        summaryTextPath,
        processedAt: artifact.processedAt
      });
      processedVideoIds.add(candidate.videoId);

      results.push({
        channelId,
        channelTitle: channel.title,
        videoId: candidate.videoId,
        status: artifact.status,
        artifactPath,
        socialDraftPath,
        transcriptTextPath,
        summaryTextPath
      });
    } catch (error) {
      results.push({
        channelId,
        status: 'error',
        error: error.message
      });
    }
  }

  return {
    results,
    hasErrors: results.some((result) => result.status === 'error')
  };
}

export function pickLatestUnprocessedVideo(videos, processedVideoIds, force) {
  if (force) {
    return videos[0] || null;
  }

  return videos.find((video) => !processedVideoIds.has(video.videoId)) || null;
}
