import { AudioSizeLimitError, downloadAudioForTranscription } from './audio.js';
import { fetchTranscript } from './transcript.js';

export function createTranscriptFetcher({
  captionFetcher = fetchTranscript,
  audioDownloader = downloadAudioForTranscription,
  transcriber
}) {
  return async function transcriptFetcher(videoId) {
    const captionResult = await captionFetcher(videoId);
    if (captionResult.status === 'ok') {
      return {
        ...captionResult,
        source: 'captions'
      };
    }

    if (!transcriber) {
      return {
        ...captionResult,
        source: null
      };
    }

    try {
      const audio = await audioDownloader(videoId);
      const transcript = await transcriber.transcribeAudioParts(audio.audioParts);

      if (!transcript) {
        return {
          status: 'missing_transcript',
          languageCode: 'en',
          transcript: null,
          source: null
        };
      }

      return {
        status: 'ok',
        languageCode: 'en',
        transcript,
        source: 'audio_transcription'
      };
    } catch (error) {
      if (error instanceof AudioSizeLimitError) {
        return {
          status: 'missing_transcript',
          languageCode: 'en',
          transcript: null,
          source: null
        };
      }
      throw error;
    }
  };
}
