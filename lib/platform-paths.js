const os = require('os');
const path = require('path');

function getHomeDir() {
  return os.homedir();
}

function getClaudePaths() {
  const home = getHomeDir();
  return {
    skills: path.join(home, '.claude', 'skills'),
    agents: path.join(home, '.claude', 'agents'),
  };
}

function getCodexPaths() {
  const home = getHomeDir();
  return {
    skills: path.join(home, '.codex', 'skills'),
    agents: path.join(home, '.codex', 'agents'),
  };
}

function getPlatformPaths(platform) {
  switch (platform) {
    case 'claude': return getClaudePaths();
    case 'codex':  return getCodexPaths();
    default:       return null;
  }
}

module.exports = {
  getHomeDir,
  getClaudePaths,
  getCodexPaths,
  getPlatformPaths,
};
