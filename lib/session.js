const fs = require('fs');
const path = require('path');

function getTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function createSessionDirs(baseDir = '.adsense-lint', timestamp) {
  const ts = timestamp || getTimestamp();
  const sessionDir = path.join(baseDir, `session-${ts}`);

  const dirs = [
    '01-policy',
    '02-eeat',
    '03-content',
    '04-cookie',
    '05-traffic',
    '06-adplacement',
    '07-tech',
    '08-legal',
    '99-summary',
  ];

  for (const d of dirs) {
    fs.mkdirSync(path.join(sessionDir, d), { recursive: true });
  }

  return { sessionDir, timestamp: ts };
}

module.exports = { getTimestamp, createSessionDirs };
