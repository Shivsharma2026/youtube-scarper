import { loadEnvFile, loadConfig } from './config.js';
import { parseArgs } from './args.js';
import { YouTubeClient } from './youtube.js';
import { OpenAiSummarizer } from './openai.js';
import { LocalStore } from './storage.js';
import { runPipeline } from './pipeline.js';
import { createTranscriptFetcher } from './transcript-fetcher.js';

async function main() {
  loadEnvFile();

  const args = parseArgs();
  const config = loadConfig();
  const channelIds = args.channel ? [args.channel] : config.channelIds;

  const youtubeClient = new YouTubeClient({ apiKey: config.youtubeApiKey });
  const summarizer = new OpenAiSummarizer({
    apiKey: config.openAiApiKey,
    model: config.openAiModel,
    transcriptionModel: config.openAiTranscriptionModel
  });
  const store = new LocalStore({
    outputDir: config.outputDir,
    processedStorePath: config.processedStorePath
  });
  const transcriptFetcher = createTranscriptFetcher({
    transcriber: summarizer
  });

  const report = await runPipeline({
    channelIds,
    limit: args.limit,
    force: args.force,
    youtubeClient,
    summarizer,
    store,
    transcriptFetcher
  });

  for (const result of report.results) {
    if (result.status === 'error') {
      console.error(`[error] ${result.channelId}: ${result.error}`);
      continue;
    }

    if (result.status === 'already_processed') {
      console.log(`[skip] ${result.channelTitle || result.channelId}: latest videos already processed`);
      continue;
    }

    if (result.status === 'no_videos') {
      console.log(`[skip] ${result.channelId}: no uploaded videos found`);
      continue;
    }

    console.log(
      `[${result.status}] ${result.channelTitle || result.channelId} ${result.videoId ?? ''} ${result.artifactPath ?? ''} ${result.socialDraftPath ?? ''} ${result.transcriptTextPath ?? ''} ${result.summaryTextPath ?? ''}`.trim()
    );
  }

  if (report.hasErrors) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
