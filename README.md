# YouTube Scraper

CLI pipeline that fetches the latest uploaded videos from two configured YouTube channels, retrieves captions when available, falls back to OpenAI speech-to-text when captions are unavailable, summarizes the transcript with OpenAI, and stores the result locally.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in your YouTube Data API key, OpenAI API key, and the two channel IDs.
3. Run `npm test` to execute the local test suite.
4. Run `npm run scrape` to process both channels.

The first run that needs audio fallback will download a local `yt-dlp` binary into `.cache/bin/`.

## Usage

```bash
npm run scrape
npm run scrape -- --channel=UCXXXXXXXXXXXXXXXXXXXXXX
npm run scrape -- --limit=3 --force
```

## Output

- Video artifacts are written to `data/outputs/`.
- Successful runs also write a `.social.txt` file with three original, post-ready social copy options.
- Successful runs also write `.transcript.txt` and `.summary.txt` files.
- Processed video IDs are tracked in `data/processed-videos.json`.
- Each artifact records whether the transcript came from YouTube captions or audio transcription fallback.
