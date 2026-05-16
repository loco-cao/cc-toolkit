const fs = require('fs');
const path = require('path');
const { ANSI, colorize, STATUS, SPINNER_FRAMES } = require('./colors.js');
const { detectAll, getAdapter } = require('./adapters/index.js');
const { AgentState, cleanOutput } = require('./adapters/automation.js');
// session dirs are created by the skill, not by ai-terminal
// ai-terminal discovers them dynamically

const AGENTS = [
  { id: '01-policy', name: 'Policy' },
  { id: '02-eeat', name: 'E-E-A-T' },
  { id: '03-content', name: 'Content' },
  { id: '04-cookie', name: 'Cookie' },
  { id: '05-traffic', name: 'Traffic' },
  { id: '06-adplacement', name: 'AdPlacement' },
  { id: '07-tech', name: 'Tech' },
  { id: '08-legal', name: 'Legal' },
];

const AGENT_COLORS = {
  '01-policy': ANSI.red,
  '02-eeat': ANSI.cyan,
  '03-content': ANSI.green,
  '04-cookie': ANSI.yellow,
  '05-traffic': ANSI.blue,
  '06-adplacement': ANSI.magenta,
  '07-tech': ANSI.brightCyan,
  '08-legal': ANSI.brightGreen,
};

class AgentRunner {
  constructor() {
    this.agents = AGENTS.map((e) => ({
      ...e,
      status: 'waiting',
      message: '',
      score: null,
    }));
    this.spinnerIdx = 0;
    this.renderedLines = 0;
    this.interval = null;
    this.statusLine = null;
    this.traceLines = [];
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
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.spinnerIdx = (this.spinnerIdx + 1) % SPINNER_FRAMES.length;
      this.render();
    }, 80);
  }

  stopSpinner() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
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

    const header = `${ANSI.bold}AIT — Skill Audit${ANSI.reset}`;
    lines.push('');
    lines.push(`  ${header}`);
    lines.push(`  ${colorize('═'.repeat(42), ANSI.gray)}`);

    for (const agent of this.agents) {
      const color = AGENT_COLORS[agent.id] || ANSI.white;
      const name = colorize(agent.name.padEnd(12), color);
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
    const progress = colorize(`${done}/${this.agents.length}`, ANSI.bold);
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

  summary() {
    const scores = this.agents
      .filter((a) => a.score !== null)
      .map((a) => ({ name: a.name, score: a.score }));

    if (scores.length === 0) return null;

    const weights = {
      Policy: 0.22, 'E-E-A-T': 0.17, Content: 0.15, Cookie: 0.13,
      AdPlacement: 0.10, Traffic: 0.08, Tech: 0.08, Legal: 0.07,
    };

    const weightedSum = scores.reduce((s, a) => s + a.score * (weights[a.name] || 0), 0);
    const totalWeight = scores.reduce((s, a) => s + (weights[a.name] || 0), 0);
    const total = Math.round(weightedSum / totalWeight);

    const policy = this.agents.find((a) => a.id === '01-policy');
    const veto = policy && policy.score !== null && policy.score < 60;

    let grade, risk;
    if (veto) {
      grade = '不合格'; risk = 'HIGH (Policy veto)';
    } else if (total >= 95) {
      grade = '优秀'; risk = 'LOW';
    } else if (total >= 90) {
      grade = '待提升'; risk = 'LOW';
    } else if (total >= 80) {
      grade = '基本满足'; risk = 'MEDIUM';
    } else {
      grade = '不合格'; risk = 'HIGH';
    }

    const sorted = [...scores].sort((a, b) => a.score - b.score);
    const priorities = sorted.map((s) => ({
      ...s,
      priority: s.score < 60 ? 'Critical' : s.score < 80 ? 'High' : s.score < 90 ? 'Medium' : 'Low',
    }));

    return { total, grade, risk, scores: priorities, veto };
  }
}

// ── PTY session helpers ────────────────────────────────────────────

function stateLabel(s) {
  switch (s) {
    case AgentState.WAITING_TRUST: return 'trust';
    case AgentState.WAITING_PERMISSION: return 'permission';
    case AgentState.EXECUTING: return 'running';
    case AgentState.ERROR: return 'error';
    default: return 'idle';
  }
}

/**
 * Run one auto-answer cycle. Returns the new state after handling.
 * Cooldown (minInterval) prevents spamming the same answer.
 */
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

async function runSkill(skillName, args, options = {}) {
  const cliName = options.cli || 'auto';
  const runner = new AgentRunner();

  // Show initial dashboard
  for (const agent of runner.agents) {
    runner.setStatus(agent.id, 'waiting', '');
  }
  runner.render();
  runner.startSpinner();

  // Detect or choose CLI
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

  // Snapshot existing session dirs so we can discover the new one the skill creates
  const cwd = options.cwd || process.cwd();
  const adsenseLintDir = path.join(cwd, '.adsense-lint');
  const preExistingDirs = new Set();
  if (fs.existsSync(adsenseLintDir)) {
    try {
      for (const entry of fs.readdirSync(adsenseLintDir)) {
        if (entry.startsWith('session-')) {
          preExistingDirs.add(entry);
        }
      }
    } catch (_) {}
  }
  let sessionDir = null;
  let sessionLabel = 'waiting...';

  runner.statusLine = colorize(`  Session: ${sessionLabel}  CLI: ${adapter.displayName}`, ANSI.brightCyan);
  runner.render();

  // Spawn PTY
  const ptyProcess = adapter.spawn(adapter.bin, cwd);
  if (!ptyProcess) {
    runner.stopSpinner();
    runner.clearPanel();
    console.log(colorize(`\n  node-pty not available. Install with: npm i node-pty`, ANSI.yellow));
    console.log(`  Run manually in ${adapter.displayName}: ${adapter.formatCommand(skillName, args)}`);
    console.log('');
    return null;
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    const globalTimeout = options.timeout || 600_000;
    let resolved = false;
    let ptyExited = false;
    let bestCount = 0;
    let agentState = AgentState.IDLE;
    let lastAuto = null;
    let commandSent = false;

    const done = () => {
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

    // Monitor loop — single interval handles trust, permission, and reports
    const check = setInterval(() => {
      if (resolved) { clearInterval(check); return; }

      const elapsed = Date.now() - startTime;
      const traceText = runner.traceLines.join('\n');

      // ── Phase 0: auto-answer trust prompts (continuous, not one-shot) ──
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

      // ── Phase 1: send the skill command after trust is resolved ──
      if (!commandSent && !ptyExited && elapsed >= 5000) {
        // If still in trust/prompt, give more time; otherwise send command
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

      // ── Phase 2: auto-answer runtime permission prompts ──
      if (!ptyExited && commandSent) {
        const result = autoAnswer(adapter, ptyProcess, traceText, agentState, lastAuto);
        if (result.answered) {
          lastAuto = Date.now();
          agentState = result.state;
          runner.statusLine = colorize(`  Auto-answering ${stateLabel(agentState)} prompt...`, ANSI.dim);
          runner.render();
        } else if (result.state !== AgentState.IDLE) {
          agentState = result.state;
        } else if (agentState !== AgentState.EXECUTING) {
          // CLI is busy (no prompt detected) — treat as executing
        }
      }

      // ── Discover session dir created by the skill ──
      if (!sessionDir && fs.existsSync(adsenseLintDir)) {
        try {
          for (const entry of fs.readdirSync(adsenseLintDir)) {
            if (entry.startsWith('session-') && !preExistingDirs.has(entry)) {
              sessionDir = path.join(adsenseLintDir, entry);
              runner.sessionDir = sessionDir;
              sessionLabel = entry;
            }
          }
        } catch (_) {}
      }
      // Update status line once session is discovered
      if (sessionDir && sessionLabel !== path.basename(sessionDir)) {
        sessionLabel = path.basename(sessionDir);
        runner.statusLine = colorize(`  Session: ${sessionLabel}  CLI: ${adapter.displayName}`, ANSI.brightCyan);
      }

      // ── Poll for report files ──
      if (sessionDir && fs.existsSync(sessionDir)) {
        for (const agent of runner.agents) {
          if (agent.status === 'done' || agent.status === 'failed') continue;

          const reportPath = path.join(sessionDir, agent.id, 'report.json');
          if (fs.existsSync(reportPath)) {
            try {
              const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
              if (data && typeof data.score === 'number') {
                runner.setScore(agent.id, data.score);
                runner.setStatus(agent.id, data.status === 'failed' ? 'failed' : 'done', 'completed');
                bestCount++;
              }
            } catch (_) {
              if (agent.status !== 'running') {
                runner.setStatus(agent.id, 'running', 'detected...');
              }
            }
          } else if (bestCount > 0 && agent.status === 'waiting') {
            runner.setStatus(agent.id, 'running', 'pending...');
          }
        }
      }

      runner.statusLine = colorize(
        `  ${adapter.displayName} — ${Math.floor(elapsed / 1000)}s — ${bestCount}/${runner.agents.length} reports`,
        ANSI.dim
      );

      const allDone = runner.agents.every((a) => a.status === 'done' || a.status === 'failed');
      const timedOut = elapsed >= globalTimeout;

      if (allDone || timedOut) {
        clearInterval(check);

        if (timedOut && !allDone) {
          for (const agent of runner.agents) {
            if (agent.status !== 'done' && agent.status !== 'failed') {
              runner.setStatus(agent.id, 'failed', 'timeout');
              runner.setScore(agent.id, 0);
            }
          }
        }

        try { ptyProcess.write(adapter.formatCommand('exit', [])); } catch (_) {}
        setTimeout(() => { try { ptyProcess.kill(); } catch (_) {} }, 5000);
        done();
      }

      if (ptyExited && bestCount > 0) {
        if (elapsed > startTime + 5000) {
          const allDone = runner.agents.every((a) => a.status === 'done' || a.status === 'failed');
          if (allDone) {
            clearInterval(check);
            done();
          }
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

  // Continuous trust/permission auto-answer for interactive sessions
  let traceText = '';
  ptyProcess.onData((d) => {
    traceText = (traceText + cleanOutput(d)).slice(-2000);
    const touched = autoAnswer(adapter, ptyProcess, traceText, null, null);
    if (touched.answered) {
      // Reset trace after answering to avoid re-triggering
      traceText = '';
    }
  });

  // Keep alive until user exits
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
