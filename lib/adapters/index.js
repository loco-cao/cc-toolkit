const claude = require('./claude.js');
const codex = require('./codex.js');

const ALL = [claude];

// Conditionally include codex if its CLI is available on PATH
try {
  if (codex.detect()) {
    ALL.push(codex);
  }
} catch (_) {
  // codex not available
}

function detectAll() {
  const available = [];
  for (const adapter of [claude, codex]) {
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
    case 'codex':  return codex;
    default:       return null;
  }
}

function getInstallableAdapters() {
  // For install, we don't need the CLI to be present — just the adapter definition
  return [claude, codex];
}

module.exports = {
  ALL,
  detectAll,
  getAdapter,
  getInstallableAdapters,
};
