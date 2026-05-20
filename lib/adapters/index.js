const claude = require('./claude.js');

const ALL = [claude];

function detectAll() {
  const available = [];
  for (const adapter of [claude]) {
    try {
      const bin = adapter.detect();
      if (bin) {
        available.push({ ...adapter, bin });
      }
    } catch (_) {}
  }
  return available;
}

function getAdapter(name) {
  switch (name) {
    case 'claude': return claude;
    default:       return null;
  }
}

function getInstallableAdapters() {
  // For install, we don't need the CLI to be present — just the adapter definition
  return [claude];
}

module.exports = {
  ALL,
  detectAll,
  getAdapter,
  getInstallableAdapters,
};
