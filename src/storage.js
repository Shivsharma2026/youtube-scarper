import fs from 'node:fs/promises';
import path from 'node:path';

export class LocalStore {
  constructor({ outputDir, processedStorePath }) {
    this.outputDir = outputDir;
    this.processedStorePath = processedStorePath;
  }

  async ensureReady() {
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(path.dirname(this.processedStorePath), { recursive: true });
  }

  async loadProcessedVideoIds() {
    try {
      const raw = await fs.readFile(this.processedStorePath, 'utf8');
      const parsed = JSON.parse(raw);
      return new Set(Object.keys(parsed));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return new Set();
      }
      throw error;
    }
  }

  async recordProcessedVideo(videoId, metadata) {
    const current = await this.#readProcessedMap();
    current[videoId] = metadata;
    await fs.writeFile(this.processedStorePath, JSON.stringify(current, null, 2) + '\n', 'utf8');
  }

  async writeVideoArtifact(artifact) {
    const fileName = this.buildBaseFileName(artifact);
    const filePath = path.join(this.outputDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
    return filePath;
  }

  async writeSocialDraft(artifact) {
    const fileName = this.buildBaseFileName(artifact, '.social.txt');
    const filePath = path.join(this.outputDir, fileName);
    await fs.writeFile(filePath, `${artifact.summarySocial}\n`, 'utf8');
    return filePath;
  }

  async writeTranscriptText(artifact) {
    const fileName = this.buildBaseFileName(artifact, '.transcript.txt');
    const filePath = path.join(this.outputDir, fileName);
    await fs.writeFile(filePath, `${artifact.transcript}\n`, 'utf8');
    return filePath;
  }

  async writeLongSummaryText(artifact) {
    const fileName = this.buildBaseFileName(artifact, '.summary.txt');
    const filePath = path.join(this.outputDir, fileName);
    await fs.writeFile(filePath, `${artifact.summaryLong}\n`, 'utf8');
    return filePath;
  }

  buildBaseFileName(artifact, extension = '.json') {
    return `${artifact.publishedAt.slice(0, 10)}-${slugifyFileName(artifact.title)}${extension}`;
  }

  async #readProcessedMap() {
    try {
      const raw = await fs.readFile(this.processedStorePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }
}

function slugifyFileName(input) {
  return String(input)
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120) || 'untitled-video';
}
