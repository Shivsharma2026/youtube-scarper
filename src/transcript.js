import { getSubtitles } from 'youtube-caption-extractor';
import { ensureYtDlpBinary, getYtDlpVideoMetadata } from './audio.js';

export async function fetchTranscript(videoId) {
  let subtitles;
  try {
    subtitles = await getSubtitles({ videoID: videoId, lang: 'en' });
  } catch (error) {
    if (isTranscriptUnavailableError(error)) {
      return {
        status: 'missing_transcript',
        languageCode: 'en',
        transcript: null
      };
    }
    throw error;
  }

  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return fetchTranscriptFromYtDlp(videoId);
  }

  const transcript = subtitles
    .map((item) => decodeHtmlEntities(String(item.text || '').replace(/\s+/g, ' ').trim()))
    .filter(Boolean)
    .join(' ')
    .trim();

  if (!transcript) {
    return fetchTranscriptFromYtDlp(videoId);
  }

  return {
    status: 'ok',
    languageCode: 'en',
    transcript
  };
}

async function fetchTranscriptFromYtDlp(videoId, fetchImpl = fetch) {
  try {
    await ensureYtDlpBinary();
    const metadata = await getYtDlpVideoMetadata(videoId);
    const captionUrl = findPreferredCaptionUrl(metadata);

    if (!captionUrl) {
      return {
        status: 'missing_transcript',
        languageCode: 'en',
        transcript: null
      };
    }

    const response = await fetchImpl(captionUrl, {
      headers: {
        'accept-language': 'en-CA,en;q=0.9',
        'user-agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
      return {
        status: 'missing_transcript',
        languageCode: 'en',
        transcript: null
      };
    }

    const transcriptJson = await response.json();
    const transcript = parseJson3Transcript(transcriptJson);

    if (!transcript) {
      return {
        status: 'missing_transcript',
        languageCode: 'en',
        transcript: null
      };
    }

    return {
      status: 'ok',
      languageCode: 'en',
      transcript
    };
  } catch {
    return {
      status: 'missing_transcript',
      languageCode: 'en',
      transcript: null
    };
  }
}

export function extractPlayerResponse(html) {
  const patterns = [
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
    /"PLAYER_INITIAL_RESPONSE"\s*:\s*(\{.+?\})\s*,\s*"PLAYER_CONFIG"/s
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return JSON.parse(match[1]);
    }
  }

  throw new Error('Unable to locate player response in YouTube watch page.');
}

export function selectTrack(tracks) {
  return (
    tracks.find((track) => track.languageCode === 'en' && !track.kind) ||
    tracks.find((track) => track.languageCode?.startsWith('en')) ||
    tracks[0]
  );
}

export function parseTranscriptXml(xml) {
  const segments = [];
  const pattern = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
  let match;

  while ((match = pattern.exec(xml)) !== null) {
    const cleaned = decodeHtmlEntities(stripTags(match[1]).replace(/\s+/g, ' ').trim());
    if (cleaned) {
      segments.push(cleaned);
    }
  }

  return segments.join(' ').trim();
}

export function parseJson3Transcript(payload) {
  const events = payload?.events || [];
  const segments = [];

  for (const event of events) {
    for (const segment of event.segs || []) {
      const cleaned = decodeHtmlEntities(String(segment.utf8 || '').replace(/\s+/g, ' ').trim());
      if (cleaned && cleaned !== '\n') {
        segments.push(cleaned);
      }
    }
  }

  return segments.join(' ').replace(/\s+/g, ' ').trim();
}

function isTranscriptUnavailableError(error) {
  return /transcript|caption|subtitle|not available|could not find/i.test(error?.message || '');
}

function findPreferredCaptionUrl(metadata) {
  const englishTracks =
    metadata?.automatic_captions?.en ||
    metadata?.subtitles?.en ||
    [];

  const preferredTrack =
    englishTracks.find((track) => track.ext === 'json3') ||
    englishTracks.find((track) => track.ext === 'srv3') ||
    englishTracks[0] ||
    null;

  return preferredTrack?.url || null;
}

function stripTags(input) {
  return input.replace(/<[^>]+>/g, '');
}

function decodeHtmlEntities(input) {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}
