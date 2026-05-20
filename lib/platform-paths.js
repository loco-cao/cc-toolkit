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

function getPlatformPaths(platform) {
  switch (platform) {
    case 'claude': return getClaudePaths();
    default:       return null;
  }
}

module.exports = {
  getHomeDir,
  getClaudePaths,
  getPlatformPaths,
};
