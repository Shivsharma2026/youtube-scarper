export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    force: false,
    limit: 1,
    channel: null
  };

  for (const arg of argv) {
    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg.startsWith('--channel=')) {
      options.channel = arg.slice('--channel='.length).trim() || null;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const value = Number.parseInt(arg.slice('--limit='.length), 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('`--limit` must be a positive integer.');
      }
      options.limit = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}
