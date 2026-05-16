const path = require('path');
const os = require('os');

const ADAPTER_NAME = 'claude';
const DISPLAY_NAME = 'Claude Code';

function detect() {
  const { execSync } = require('child_process');
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where claude 2>nul' : 'which claude 2>/dev/null';
    const out = execSync(cmd, { shell: true, encoding: 'utf8', timeout: 5000 });
    const lines = out.trim().split(/\r?\n/).filter(Boolean);

    let best = null;
    for (const raw of lines) {
      const cleaned = raw.trim();
      if (!cleaned) continue;
      try { require('fs').accessSync(cleaned); } catch (_) { continue; }
      if (isWin) {
        if (cleaned.endsWith('.exe')) return cleaned;
        if (cleaned.endsWith('.cmd') && !best) best = cleaned;
      } else {
        return cleaned;
      }
    }
    return best;
  } catch (_) {
    return null;
  }
}

function getVersion(bin) {
  try {
    const { execSync } = require('child_process');
    return execSync(`"${bin}" --version`, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch (_) {
    return 'unknown';
  }
}

function spawn(bin, cwd) {
  let pty;
  try {
    pty = require('node-pty');
  } catch (_) {
    return null;
  }

  return pty.spawn(bin, [], {
    name: 'xterm-color',
    cols: 120,
    rows: 30,
    cwd,
    env: process.env,
  });
}

function answerTrust(output) {
  const plain = output.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  if (/Yes.*don.*t ask again/i.test(plain) && /Tab to amend|Esc to cancel/i.test(plain)) {
    return '2\r';
  }
  return null;
}

function answerPermission(output) {
  return answerTrust(output); // Same pattern for Claude Code
}

function formatCommand(skillName, args) {
  const argStr = args.length > 0 ? ' ' + args.join(' ') : '';
  return `/${skillName}${argStr}\r`;
}

function getInstallPaths() {
  const home = os.homedir();
  return {
    skills: path.join(home, '.claude', 'skills'),
    agents: path.join(home, '.claude', 'agents'),
  };
}

module.exports = {
  name: ADAPTER_NAME,
  displayName: DISPLAY_NAME,
  detect,
  getVersion,
  spawn,
  answerTrust,
  answerPermission,
  formatCommand,
  getInstallPaths,
};
