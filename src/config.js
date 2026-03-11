import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT_DIR = './data/outputs';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

export function loadEnvFile(filePath = '.env', cwd = process.cwd()) {
  const resolvedPath = path.resolve(cwd, filePath);
  let content;

  try {
    content = readTextFile(resolvedPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadConfig(env = process.env, cwd = process.cwd()) {
  const youtubeApiKey = env.YOUTUBE_API_KEY;
  const openAiApiKey = env.OPENAI_API_KEY;
  const channelIds = parseChannelIds(env.CHANNEL_IDS);
  const outputDir = path.resolve(cwd, env.OUTPUT_DIR || DEFAULT_OUTPUT_DIR);
  const processedStorePath = path.resolve(cwd, 'data/processed-videos.json');
  const openAiModel = env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const openAiTranscriptionModel =
    env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_OPENAI_TRANSCRIPTION_MODEL;

  const missing = [];
  if (!youtubeApiKey) missing.push('YOUTUBE_API_KEY');
  if (!openAiApiKey) missing.push('OPENAI_API_KEY');
  if (channelIds.length < 2) missing.push('CHANNEL_IDS (expected at least two channel IDs)');

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }

  return {
    youtubeApiKey,
    openAiApiKey,
    openAiModel,
    openAiTranscriptionModel,
    channelIds,
    outputDir,
    processedStorePath
  };
}

export function parseChannelIds(rawValue = '') {
  return rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}
