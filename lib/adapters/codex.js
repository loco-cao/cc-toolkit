const path = require('path');
const os = require('os');

const ADAPTER_NAME = 'codex';
const DISPLAY_NAME = 'OpenAI Codex CLI';

function detect() {
  const { execSync } = require('child_process');
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where codex 2>nul' : 'which codex 2>/dev/null';
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
  // Codex trust prompt format TBD — return null until observed
  return null;
}

function answerPermission(output) {
  // Codex permission prompt format TBD
  return null;
}

function formatCommand(skillName, args) {
  // Codex skill trigger syntax TBD — assuming slash command for now
  const argStr = args.length > 0 ? ' ' + args.join(' ') : '';
  return `/${skillName}${argStr}\r`;
}

function getInstallPaths() {
  const home = os.homedir();
  return {
    skills: path.join(home, '.codex', 'skills'),
    agents: path.join(home, '.codex', 'agents'),
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
