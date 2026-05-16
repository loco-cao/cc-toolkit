const path = require('path');
const os = require('os');
const {
  AgentState,
  cleanOutput,
  DEFAULT_TRUST_PATTERNS,
  DEFAULT_PERMISSION_PATTERNS,
  createAnswerer,
  createStateDetector,
} = require('./automation.js');

const ADAPTER_NAME = 'codex';
const DISPLAY_NAME = 'OpenAI Codex CLI';

// ── CLI-specific patterns ──────────────────────────────────────────
// Codex prompt format is not yet finalized — we start with the generic
// cross-CLI heuristic set and will tighten patterns as they're observed.
const CODEX_TRUST_PATTERNS = [...DEFAULT_TRUST_PATTERNS];
const CODEX_PERM_PATTERNS = [...DEFAULT_PERMISSION_PATTERNS];

// Codex uses y/n confirms rather than keyboard-navigation dialogs.
const _answerTrust = createAnswerer(CODEX_TRUST_PATTERNS, 'yes\r');
const _answerPermission = createAnswerer(CODEX_PERM_PATTERNS, 'y\r');
const _detectState = createStateDetector(CODEX_TRUST_PATTERNS, CODEX_PERM_PATTERNS);

// ── Public adapter ─────────────────────────────────────────────────

function detect() {
  const { execSync } = require('child_process');
  try {
    const isWin = process.platform === 'win32';
    const binCmd = isWin ? 'where codex 2>nul' : 'which codex 2>/dev/null';
    const out = execSync(binCmd, { shell: true, encoding: 'utf8', timeout: 5000 });
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
  return _answerTrust(output);
}

function answerPermission(output) {
  return _answerPermission(output);
}

function detectState(output) {
  return _detectState(output);
}

// Codex does not use slash-command syntax — send skill name as natural language.
function formatCommand(skillName, args) {
  const argStr = args.length > 0 ? ' ' + args.join(' ') : '';
  return `${skillName}${argStr}\r`;
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
  detectState,
  formatCommand,
  getInstallPaths,
};
