export class OpenAiSummarizer {
  constructor({ apiKey, model, transcriptionModel, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.transcriptionModel = transcriptionModel;
    this.fetchImpl = fetchImpl;
  }

  async summarizeVideo({ title, channelTitle, publishedAt, videoUrl, transcript }) {
    const prompt = [
      'You are summarizing YouTube videos about Ontario, Canada real estate.',
      'Return valid JSON with keys "summaryLong" and "summarySocial".',
      'summaryLong should be 2-4 sentences and useful as an internal recap.',
      'summarySocial should contain exactly 3 distinct social-media-ready post options separated by blank lines.',
      'Label them "Option 1", "Option 2", and "Option 3".',
      'Each option should be 2-4 sentences, professional, specific, and ready to post.',
      'Rewrite the transcript as original copy in a neutral analyst voice.',
      'Do not imitate the video speaker, guest, host, channel voice, or any named personality.',
      'Do not use catchphrases, sarcasm, insults, or profanity from the transcript.',
      'Base every claim on the transcript and avoid adding facts that are not supported there.',
      'No hashtags unless strongly justified.',
      '',
      `Title: ${title}`,
      `Channel: ${channelTitle}`,
      `Published At: ${publishedAt}`,
      `Video URL: ${videoUrl}`,
      '',
      'Transcript:',
      transcript
    ].join('\n');

    const response = await this.fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'video_summaries',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['summaryLong', 'summarySocial'],
              properties: {
                summaryLong: { type: 'string' },
                summarySocial: { type: 'string' }
              }
            }
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed (${response.status} ${response.statusText})`);
    }

    const payload = await response.json();
    const outputText = payload.output_text || findOutputText(payload);

    if (!outputText) {
      throw new Error('OpenAI response did not include summary text.');
    }

    const parsed = JSON.parse(outputText);
    if (!parsed.summaryLong || !parsed.summarySocial) {
      throw new Error('OpenAI response JSON was missing required summary fields.');
    }

    return {
      summaryLong: parsed.summaryLong.trim(),
      summarySocial: parsed.summarySocial.trim()
    };
  }

  async transcribeAudio({ audioBuffer, mimeType, fileName }) {
    const formData = new FormData();
    formData.append(
      'file',
      new File([audioBuffer], fileName, {
        type: mimeType
      })
    );
    formData.append('model', this.transcriptionModel);
    formData.append('language', 'en');
    formData.append('response_format', 'json');

    const response = await this.fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI transcription failed (${response.status} ${response.statusText}): ${errorText}`
      );
    }

    const payload = await response.json();
    if (!payload.text || typeof payload.text !== 'string') {
      throw new Error('OpenAI transcription response did not include transcript text.');
    }

    return payload.text.trim();
  }

  async transcribeAudioParts(audioParts) {
    const transcripts = [];

    for (const [index, audioPart] of audioParts.entries()) {
      const transcript = await this.transcribeAudio(audioPart);
      if (transcript) {
        transcripts.push(transcript.trim());
      }
      if (!transcript && index === 0) {
        return '';
      }
    }

    return transcripts.join('\n\n').trim();
  }
}

function findOutputText(payload) {
  const output = payload.output || [];
  for (const item of output) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) {
        return content.text;
      }
    }
  }
  return null;
}
