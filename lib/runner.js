const fs = require('fs');
const path = require('path');
const { ANSI, colorize, STATUS, SPINNER_FRAMES } = require('./colors.js');
const { detectAll, getAdapter } = require('./adapters/index.js');
const { AgentState, cleanOutput } = require('./adapters/automation.js');

// Color palette assigned round-robin to dynamically discovered agents
const PALETTE = [
  ANSI.red, ANSI.cyan, ANSI.green, ANSI.yellow,
  ANSI.blue, ANSI.magenta, ANSI.brightCyan, ANSI.brightGreen,
  ANSI.brightRed, ANSI.brightBlue, ANSI.brightMagenta,
];

class AgentRunner {
  constructor() {
    this.agents = [];             // { id, name, status, message, score, color }
    this.spinnerIdx = 0;
    this.renderedLines = 0;
    this._interval = null;
    this.statusLine = null;
    this.traceLines = [];
    this._nextColor = 0;
    this.summaryReport = null;   // populated from 99-summary/report.json if present
  }

  _assignColor() {
    const c = PALETTE[this._nextColor % PALETTE.length];
    this._nextColor++;
    return c;
  }

  /** Ensure an agent dir is tracked. Safe to call on every poll. */
  syncAgent(id) {
    if (this.agents.find((a) => a.id === id)) return;
    // Derive display name from directory name: strip leading digits+dash, replace hyphens
    const name = id.replace(/^\d+-/, '').replace(/-/g, ' ');
    this.agents.push({ id, name, status: 'waiting', message: '', score: null, color: this._assignColor() });
  }

  setStatus(id, status, message = '') {
    const agent = this.agents.find((a) => a.id === id);
    if (!agent) return;
    agent.status = status;
    agent.message = message;
    this.render();
  }

  setScore(id, score) {
    const agent = this.agents.find((a) => a.id === id);
    if (agent) agent.score = score;
    this.render();
  }

  startSpinner() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      this.spinnerIdx = (this.spinnerIdx + 1) % SPINNER_FRAMES.length;
      this.render();
    }, 80);
  }

  stopSpinner() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  clearPanel() {
    if (this.renderedLines > 0) {
      process.stdout.write(`\x1b[${this.renderedLines}A`);
      process.stdout.write('\x1b[0J');
    }
  }

  render() {
    this.clearPanel();
    const lines = [];

    const header = `${ANSI.bold}AIT — Skill Runner${ANSI.reset}`;
    lines.push('');
    lines.push(`  ${header}`);
    lines.push(`  ${colorize('═'.repeat(42), ANSI.gray)}`);

    // Sort: running → waiting → done/failed
    const order = { running: 0, waiting: 1, done: 2, failed: 3 };
    const sorted = [...this.agents].sort((a, b) => (order[a.status] || 4) - (order[b.status] || 4));

    for (const agent of sorted) {
      const name = colorize(agent.name.padEnd(14), agent.color);
      const statusIcon = agent.status === 'running'
        ? colorize(SPINNER_FRAMES[this.spinnerIdx], ANSI.brightYellow)
        : STATUS[agent.status] || STATUS.waiting;
      const statusLabel = colorize(agent.status.padEnd(8), ANSI.dim);
      const msg = agent.message ? `  ${ANSI.dim}${agent.message}${ANSI.reset}` : '';
      const score = agent.score !== null
        ? colorize(String(agent.score).padStart(3), ANSI.bold)
        : '   ';
      const scoreLabel = agent.score !== null ? `  score: ${score}` : '';

      lines.push(`  ${statusIcon}  ${name}  ${statusLabel}${scoreLabel}${msg}`);
    }

    const running = this.agents.filter((a) => a.status === 'running').length;
    const done = this.agents.filter((a) => a.status === 'done').length;
    const failed = this.agents.filter((a) => a.status === 'failed').length;
    const total = this.agents.length;
    const progress = total > 0 ? colorize(`${done}/${total}`, ANSI.bold) : colorize('--', ANSI.dim);
    lines.push(`  ${colorize('─'.repeat(42), ANSI.gray)}`);
    lines.push(`  ${ANSI.dim}Progress:${ANSI.reset} ${progress}  ${ANSI.dim}Running:${ANSI.reset} ${running}  ${ANSI.dim}Failed:${ANSI.reset} ${failed}`);

    if (this.statusLine) {
      lines.push(`  ${this.statusLine}`);
    }
    for (const tl of this.traceLines.slice(-3)) {
      lines.push(`  ${ANSI.dim}${tl.slice(0, 80)}${ANSI.reset}`);
    }
    lines.push('');

    for (const line of lines) {
      process.stdout.write(line + '\n');
    }
    this.renderedLines = lines.length;
  }

  /** Build a generic score table. Skill-specific interpretation comes from 99-summary report. */
  summary() {
    if (this.agents.length === 0) return null;

    const scored = this.agents
      .filter((a) => a.score !== null)
      .map((a) => ({ name: a.name, score: a.score }));

    if (scored.length === 0) return null;

    const sorted = [...scored].sort((a, b) => a.score - b.score);
    const avg = Math.round(sorted.reduce((s, a) => s + a.score, 0) / sorted.length);

    const result = { total: avg, scores: sorted };

    if (this.summaryReport) {
      result.skillSummary = this.summaryReport;
    }

    return result;
  }
}

// ── PTY helpers ──────────────────────────────────────────────────────

function stateLabel(s) {
  switch (s) {
    case AgentState.WAITING_TRUST: return 'trust';
    case AgentState.WAITING_PERMISSION: return 'permission';
    case AgentState.EXECUTING: return 'running';
    case AgentState.ERROR: return 'error';
    default: return 'idle';
  }
}

function autoAnswer(adapter, ptyProcess, traceText, currentState, lastAuto) {
  const detected = adapter.detectState
    ? adapter.detectState(traceText)
    : AgentState.IDLE;

  const now = Date.now();
  const cooldown = lastAuto && (now - lastAuto) < 3000;

  if (cooldown && detected === currentState) {
    return { state: detected, answered: false };
  }

  let answer = null;
  if (detected === AgentState.WAITING_TRUST) {
    answer = adapter.answerTrust(traceText);
  } else if (detected === AgentState.WAITING_PERMISSION) {
    answer = adapter.answerPermission(traceText);
  }

  if (answer) {
    try { ptyProcess.write(answer); } catch (_) { /* PTY closed */ }
    return { state: detected, answered: true };
  }

  return { state: detected, answered: false };
}

/** Scan a directory for immediate subdirectories (non-hidden). */
function scanSubdirs(dir) {
  try {
    return fs.readdirSync(dir).filter((entry) => {
      const full = path.join(dir, entry);
      return !entry.startsWith('.') && fs.statSync(full).isDirectory();
    });
  } catch (_) {
    return [];
  }
}

/**
 * Run a skill via PTY.
 *
 * @param {string} skillName   - skill name as registered
 * @param {string[]} args      - CLI arguments to forward to the skill
 * @param {object} options
 * @param {string} options.cli          - 'auto' | 'claude' | 'codex'
 * @param {string} options.cwd          - working directory
 * @param {string} options.outputDir    - from ait.yaml (e.g. '.adsense-lint')
 * @param {number} options.globalTimeout - from ait.yaml (seconds), converted to ms
 */
async function runSkill(skillName, args, options = {}) {
  const cliName = options.cli || 'auto';
  const runner = new AgentRunner();

  runner.render();
  runner.startSpinner();

  // ── Resolve adapter ──
  let adapter;
  if (cliName === 'auto') {
    const available = detectAll();
    if (available.length === 0) {
      runner.stopSpinner();
      console.log(colorize('\n  No supported AI CLI detected.', ANSI.red));
      console.log('');
      return null;
    }
    adapter = available[0];
  } else {
    adapter = getAdapter(cliName);
    if (!adapter) {
      runner.stopSpinner();
      console.log(colorize(`\n  Unknown CLI: ${cliName}`, ANSI.red));
      console.log('');
      return null;
    }
    const bin = adapter.detect();
    if (!bin) {
      runner.stopSpinner();
      console.log(colorize(`\n  ${adapter.displayName} not found in PATH.`, ANSI.red));
      console.log('');
      return null;
    }
    adapter.bin = bin;
  }

  const cwd = options.cwd || process.cwd();

  // ── Skill output directory (from ait.yaml, default '.ait-skill') ──
  const outputDirName = options.outputDir || '.ait-skill';
  const outputBase = path.join(cwd, outputDirName);

  // Snapshot existing session dirs so we discover only the new one
  const preExistingDirs = new Set();
  if (fs.existsSync(outputBase)) {
    try {
      for (const entry of fs.readdirSync(outputBase)) {
        if (entry.startsWith('session-')) preExistingDirs.add(entry);
      }
    } catch (_) {}
  }

  let sessionDir = null;
  let sessionLabel = 'waiting...';
  let lastNewAgentTime = 0;

  runner.statusLine = colorize(`  Session: ${sessionLabel}  CLI: ${adapter.displayName}`, ANSI.brightCyan);
  runner.render();

  // ── Spawn PTY ──
  const ptyProcess = adapter.spawn(adapter.bin, cwd);
  if (!ptyProcess) {
    runner.stopSpinner();
    runner.clearPanel();
    console.log(colorize(`\n  node-pty not available. Install with: npm i node-pty`, ANSI.yellow));
    console.log(`  Run manually: ${adapter.formatCommand(skillName, args)}`);
    console.log('');
    return null;
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    const globalTimeout = options.globalTimeout
      ? options.globalTimeout * 1000    // ait.yaml uses seconds
      : 600_000;                        // default 10 min
    const STABILIZATION_MS = 30_000;    // no new agents for 30s → skill is done
    const SUMMARY_GRACE_MS = 60_000;    // wait up to 60s for 99-summary after stabilization
    let resolved = false;
    let ptyExited = false;
    let reportCount = 0;
    let agentState = AgentState.IDLE;
    let lastAuto = null;
    let commandSent = false;
    let stabilizeStart = null;
    let exitSent = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      runner.stopSpinner();
      runner.render();
      resolve(runner.summary());
    };

    ptyProcess.onData((d) => {
      const plain = cleanOutput(d);
      const lines = plain.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length > 0) {
        runner.traceLines = [...runner.traceLines, ...lines].slice(-6);
      }
    });

    ptyProcess.onExit(() => {
      ptyExited = true;
    });

    // ── Monitor loop ──
    const check = setInterval(() => {
      if (resolved) { clearInterval(check); return; }

      const elapsed = Date.now() - startTime;
      const traceText = runner.traceLines.join('\n');

      // Phase 0: auto-answer trust prompts
      if (!ptyExited && !commandSent) {
        const result = autoAnswer(adapter, ptyProcess, traceText, agentState, lastAuto);
        if (result.answered) {
          lastAuto = Date.now();
          agentState = result.state;
          runner.statusLine = colorize(`  Auto-answering ${stateLabel(agentState)} prompt...`, ANSI.dim);
          runner.render();
        } else {
          agentState = result.state;
        }
      }

      // Phase 1: send skill command after trust is resolved
      if (!commandSent && !ptyExited && elapsed >= 5000) {
        const stillPrompting = agentState === AgentState.WAITING_TRUST
                            || agentState === AgentState.WAITING_PERMISSION;
        if (!stillPrompting || elapsed >= 12000) {
          commandSent = true;
          ptyProcess.write(adapter.formatCommand(skillName, args));
          agentState = AgentState.EXECUTING;
          runner.statusLine = colorize(`  ${adapter.displayName} — ${adapter.formatCommand(skillName, args).trim()}`, ANSI.dim);
          runner.render();
        }
      }

      // Phase 2: auto-answer runtime prompts
      if (!ptyExited && commandSent) {
        const result = autoAnswer(adapter, ptyProcess, traceText, agentState, lastAuto);
        if (result.answered) {
          lastAuto = Date.now();
          agentState = result.state;
          runner.statusLine = colorize(`  Auto-answering ${stateLabel(agentState)} prompt...`, ANSI.dim);
          runner.render();
        } else if (result.state !== AgentState.IDLE) {
          agentState = result.state;
        }
      }

      // ── Discover session dir created by the skill ──
      if (!sessionDir && fs.existsSync(outputBase)) {
        try {
          for (const entry of fs.readdirSync(outputBase)) {
            if (entry.startsWith('session-') && !preExistingDirs.has(entry)) {
              sessionDir = path.join(outputBase, entry);
              sessionLabel = entry;
            }
          }
        } catch (_) {}
      }
      if (sessionDir && sessionLabel !== path.basename(sessionDir)) {
        sessionLabel = path.basename(sessionDir);
        runner.statusLine = colorize(`  Session: ${sessionLabel}  CLI: ${adapter.displayName}`, ANSI.brightCyan);
      }

      // ── Dynamically discover agent dirs & poll for reports ──
      if (sessionDir && fs.existsSync(sessionDir)) {
        const dirIds = scanSubdirs(sessionDir);
        const preSyncIds = new Set(runner.agents.map((a) => a.id));

        for (const id of dirIds) {
          runner.syncAgent(id);
        }

        // Track new agent appearances for stabilization
        const newAppeared = dirIds.some((id) => !preSyncIds.has(id));
        if (newAppeared) {
          lastNewAgentTime = Date.now();
        }

        for (const agent of runner.agents) {
          if (agent.status === 'done' || agent.status === 'failed') continue;

          const reportPath = path.join(sessionDir, agent.id, 'report.json');
          if (fs.existsSync(reportPath)) {
            try {
              const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
              if (data && typeof data.score === 'number') {
                runner.setScore(agent.id, data.score);
                runner.setStatus(agent.id, data.status === 'failed' ? 'failed' : 'done', 'completed');
                reportCount++;
              }
            } catch (_) {
              if (agent.status !== 'running') {
                runner.setStatus(agent.id, 'running', 'detected...');
              }
            }
          } else if (reportCount > 0 && agent.status === 'waiting') {
            runner.setStatus(agent.id, 'running', 'pending...');
          }
        }

        // Try to load 99-summary report if it exists
        if (!runner.summaryReport) {
          const summaryPath = path.join(sessionDir, '99-summary', 'report.json');
          if (fs.existsSync(summaryPath)) {
            try {
              runner.summaryReport = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
            } catch (_) {}
          }
        }
      }

      runner.statusLine = colorize(
        `  ${adapter.displayName} — ${Math.floor(elapsed / 1000)}s — ${reportCount} reports`,
        ANSI.dim
      );

      const allDone = runner.agents.length > 0
        && runner.agents.every((a) => a.status === 'done' || a.status === 'failed');
      const timedOut = elapsed >= globalTimeout;

      // ── Completion: all agents done + stabilization period ──
      if (allDone && !timedOut) {
        if (!stabilizeStart) {
          stabilizeStart = Date.now();
        }
        const noNewAgents = (Date.now() - lastNewAgentTime) >= STABILIZATION_MS;

        if (noNewAgents && (Date.now() - stabilizeStart) >= STABILIZATION_MS) {
          if (!exitSent) {
            exitSent = true;
            runner.statusLine = colorize('  Complete — shutting down...', ANSI.brightGreen);
            runner.render();
            try { ptyProcess.write(adapter.formatCommand('exit', [])); } catch (_) {}
          }

          // Wait extra grace period for 99-summary to flush
          if (Date.now() - stabilizeStart >= STABILIZATION_MS + SUMMARY_GRACE_MS) {
            clearInterval(check);
            try { ptyProcess.kill(); } catch (_) {}
            finish();
          }
        } else if (!noNewAgents) {
          stabilizeStart = null; // reset — new agent appeared
        }
      }

      // ── Timeout ──
      if (timedOut) {
        clearInterval(check);
        for (const agent of runner.agents) {
          if (agent.status !== 'done' && agent.status !== 'failed') {
            runner.setStatus(agent.id, 'failed', 'timeout');
            runner.setScore(agent.id, 0);
          }
        }
        try { ptyProcess.write(adapter.formatCommand('exit', [])); } catch (_) {}
        setTimeout(() => { try { ptyProcess.kill(); } catch (_) {} }, 5000);
        finish();
      }

      // ── PTY exited early ──
      if (ptyExited && reportCount > 0) {
        const ptyAllDone = runner.agents.length > 0
          && runner.agents.every((a) => a.status === 'done' || a.status === 'failed');
        if (ptyAllDone) {
          clearInterval(check);
          finish();
        }
      }
    }, 1500);
  });
}

async function openCli(cliName = 'auto') {
  let adapter;
  if (cliName === 'auto') {
    const available = detectAll();
    if (available.length === 0) {
      console.log(colorize('\n  No supported AI CLI detected.', ANSI.red));
      console.log('');
      return;
    }
    if (available.length === 1) {
      adapter = available[0];
    } else {
      const { askCli } = require('./prompts.js');
      const choice = await askCli();
      adapter = available.find((a) => a.name === choice);
      if (!adapter) adapter = available[0];
    }
  } else {
    adapter = getAdapter(cliName);
    if (!adapter) {
      console.log(colorize(`\n  Unknown CLI: ${cliName}`, ANSI.red));
      console.log('');
      return;
    }
    const bin = adapter.detect();
    if (!bin) {
      console.log(colorize(`\n  ${adapter.displayName} not found in PATH.`, ANSI.red));
      console.log('');
      return;
    }
    adapter.bin = bin;
  }

  console.log(colorize(`\n  Launching ${adapter.displayName}...`, ANSI.brightCyan));
  console.log('');

  const ptyProcess = adapter.spawn(adapter.bin, process.cwd());
  if (!ptyProcess) {
    console.log(colorize('  node-pty not available.', ANSI.yellow));
    console.log('');
    return;
  }

  let traceText = '';
  ptyProcess.onData((d) => {
    traceText = (traceText + cleanOutput(d)).slice(-2000);
    const touched = autoAnswer(adapter, ptyProcess, traceText, null, null);
    if (touched.answered) {
      traceText = '';
    }
  });

  return new Promise((resolve) => {
    ptyProcess.onExit(() => {
      console.log('');
      resolve();
    });

    process.on('SIGINT', () => {
      try { ptyProcess.kill(); } catch (_) {}
      resolve();
    });
  });
}

module.exports = { AgentRunner, runSkill, openCli };
