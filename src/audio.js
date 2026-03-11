import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const TARGET_CHUNK_BYTES = 20 * 1024 * 1024;
const MIN_CHUNK_SECONDS = 5 * 60;
const MAX_CHUNK_SECONDS = 20 * 60;
const AUDIO_FORMAT_SELECTOR = '139/249/bestaudio[abr<=64]/bestaudio/best';
const YT_DLP_DIR = path.resolve(process.cwd(), '.cache/bin');
const YT_DLP_PATH = path.join(
  YT_DLP_DIR,
  os.platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
);

export class AudioSizeLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AudioSizeLimitError';
  }
}

export async function downloadAudioForTranscription(
  videoId,
  {
    maxAudioBytes = DEFAULT_MAX_AUDIO_BYTES,
    targetChunkBytes = TARGET_CHUNK_BYTES,
    fetchImpl = fetch
  } = {}
) {
  await ensureYtDlpBinary({ fetchImpl });

  const metadata = await getAudioMetadata(videoId);
  const chunks = planAudioChunks({
    durationSeconds: metadata.durationSeconds,
    estimatedBytes: metadata.estimatedBytes,
    targetChunkBytes,
    maxAudioBytes
  });

  if (chunks.length === 0) {
    throw new AudioSizeLimitError(`Could not derive audio chunks for ${videoId}.`);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-audio-'));

  try {
    const audioParts = [];
    for (const chunk of chunks) {
      const filePath = await downloadAudioChunk(videoId, tempDir, chunk, maxAudioBytes);
      const audioBuffer = await fs.readFile(filePath);

      if (audioBuffer.length > maxAudioBytes) {
        throw new AudioSizeLimitError(
          `Downloaded audio chunk exceeded ${maxAudioBytes} bytes for ${videoId}.`
        );
      }

      audioParts.push({
        audioBuffer,
        mimeType: detectMimeType(filePath),
        fileName: path.basename(filePath),
        sizeBytes: audioBuffer.length,
        startSeconds: chunk.startSeconds,
        endSeconds: chunk.endSeconds
      });
    }

    return {
      audioParts
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function ensureYtDlpBinary({ fetchImpl = fetch } = {}) {
  try {
    await fs.access(YT_DLP_PATH);
    return YT_DLP_PATH;
  } catch {
    await fs.mkdir(YT_DLP_DIR, { recursive: true });
  }

  const response = await fetchImpl(getYtDlpDownloadUrl(), {
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Failed to download yt-dlp binary (${response.status} ${response.statusText}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(YT_DLP_PATH, Buffer.from(arrayBuffer));

  if (os.platform() !== 'win32') {
    await fs.chmod(YT_DLP_PATH, 0o755);
  }

  return YT_DLP_PATH;
}

export async function getAudioMetadata(videoId) {
  const metadata = await getYtDlpVideoMetadata(videoId);
  const requestedDownload = metadata.requested_downloads?.[0] || metadata;
  const durationSeconds = Number(metadata.duration || 0);
  const estimatedBytes =
    Number(requestedDownload.filesize || 0) ||
    Number(requestedDownload.filesize_approx || 0) ||
    estimateBytesFromBitrate({
      abrKbps: Number(requestedDownload.abr || 0),
      durationSeconds
    });

  return {
    durationSeconds,
    estimatedBytes,
    fileExtension: requestedDownload.ext || 'm4a'
  };
}

export async function getYtDlpVideoMetadata(videoId) {
  const { stdout } = await execFileAsync(
    YT_DLP_PATH,
    [
      '--js-runtimes',
      'node',
      '--dump-single-json',
      '--format',
      AUDIO_FORMAT_SELECTOR,
      `https://www.youtube.com/watch?v=${videoId}`
    ],
    {
      maxBuffer: 10 * 1024 * 1024
    }
  );

  return JSON.parse(stdout);
}

export function planAudioChunks({
  durationSeconds,
  estimatedBytes,
  targetChunkBytes = TARGET_CHUNK_BYTES,
  maxAudioBytes = DEFAULT_MAX_AUDIO_BYTES
}) {
  return buildAudioChunks({
    durationSeconds,
    estimatedBytes,
    targetChunkBytes,
    maxAudioBytes
  });
}

function buildAudioChunks({
  durationSeconds,
  estimatedBytes,
  targetChunkBytes,
  maxAudioBytes,
  overrideChunkSeconds
}) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return [];
  }

  const normalizedEstimate = Number.isFinite(estimatedBytes) && estimatedBytes > 0
    ? estimatedBytes
    : targetChunkBytes + 1;
  const minimumChunkCount = Math.max(1, Math.ceil(normalizedEstimate / targetChunkBytes));
  const suggestedChunkSeconds = Math.ceil(durationSeconds / minimumChunkCount);
  const chunkSeconds = overrideChunkSeconds
    ? Math.max(60, Math.min(MAX_CHUNK_SECONDS, overrideChunkSeconds))
    : Math.min(MAX_CHUNK_SECONDS, Math.max(MIN_CHUNK_SECONDS, suggestedChunkSeconds));

  const chunks = [];
  for (let startSeconds = 0, index = 0; startSeconds < durationSeconds; startSeconds += chunkSeconds, index += 1) {
    const endSeconds = Math.min(durationSeconds, startSeconds + chunkSeconds);
    chunks.push({
      index,
      startSeconds,
      endSeconds
    });
  }

  const bytesPerSecond = normalizedEstimate / durationSeconds;
  const largestEstimatedChunk = Math.max(
    ...chunks.map((chunk) => Math.ceil((chunk.endSeconds - chunk.startSeconds) * bytesPerSecond))
  );

  if (!overrideChunkSeconds && largestEstimatedChunk > maxAudioBytes) {
    return buildAudioChunks({
      durationSeconds,
      estimatedBytes,
      targetChunkBytes: Math.min(targetChunkBytes, maxAudioBytes),
      maxAudioBytes,
      overrideChunkSeconds: Math.floor(maxAudioBytes / Math.max(bytesPerSecond, 1))
    });
  }

  return chunks;
}

export function formatBytesForYtDlp(bytes) {
  return `${Math.max(1, Math.floor(bytes / (1024 * 1024)))}M`;
}

export function detectMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.m4a':
      return 'audio/mp4';
    case '.mp3':
      return 'audio/mpeg';
    case '.opus':
      return 'audio/opus';
    case '.wav':
      return 'audio/wav';
    case '.webm':
      return 'audio/webm';
    default:
      return 'application/octet-stream';
  }
}

export function formatTimestamp(seconds) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = String(Math.floor(wholeSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((wholeSeconds % 3600) / 60)).padStart(2, '0');
  const remainingSeconds = String(wholeSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${remainingSeconds}`;
}

function estimateBytesFromBitrate({ abrKbps, durationSeconds }) {
  if (!Number.isFinite(abrKbps) || abrKbps <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }

  return Math.ceil((abrKbps * 1000 * durationSeconds) / 8);
}

async function downloadAudioChunk(videoId, tempDir, chunk, maxAudioBytes) {
  const outputTemplate = path.join(tempDir, `${videoId}-part-${chunk.index}.%(ext)s`);
  const section = `*${formatTimestamp(chunk.startSeconds)}-${formatTimestamp(chunk.endSeconds)}`;

  try {
    await execFileAsync(
      YT_DLP_PATH,
      [
        '--no-playlist',
        '--no-warnings',
        '--js-runtimes',
        'node',
        '--download-sections',
        section,
        '--max-filesize',
        formatBytesForYtDlp(maxAudioBytes),
        '--format',
        AUDIO_FORMAT_SELECTOR,
        '--output',
        outputTemplate,
        `https://www.youtube.com/watch?v=${videoId}`
      ],
      {
        maxBuffer: 1024 * 1024
      }
    );
  } catch (error) {
    if (isYtDlpSizeError(error)) {
      throw new AudioSizeLimitError(
        `No downloadable audio section under ${maxAudioBytes} bytes for ${videoId}.`
      );
    }
    throw error;
  }

  const filePath = await findDownloadedAudioFile(tempDir, `${videoId}-part-${chunk.index}`);
  if (!filePath) {
    throw new Error(
      `yt-dlp completed without leaving a downloadable audio chunk for ${videoId} section ${section}.`
    );
  }

  return filePath;
}

function getYtDlpDownloadUrl() {
  switch (os.platform()) {
    case 'darwin':
      return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
    case 'linux':
      return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
    case 'win32':
      return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    default:
      throw new Error(`Unsupported platform for yt-dlp bootstrap: ${os.platform()}`);
  }
}

function isYtDlpSizeError(error) {
  const message = `${error?.stderr || ''}\n${error?.stdout || ''}\n${error?.message || ''}`;
  return /File is larger than max-filesize|requested format not available|does not pass filter/i.test(
    message
  );
}

async function findDownloadedAudioFile(tempDir, prefix) {
  const entries = await fs.readdir(tempDir);
  const matchingEntry =
    entries.find(
      (entry) =>
        entry.startsWith(`${prefix}.`) &&
        !entry.endsWith('.part') &&
        !entry.endsWith('.ytdl')
    ) || null;
  return matchingEntry ? path.join(tempDir, matchingEntry) : null;
}
