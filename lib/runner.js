const fs = require('fs');
const path = require('path');
const { ANSI, colorize, STATUS, SPINNER_FRAMES } = require('./colors.js');
const { detectAll, getAdapter } = require('./adapters/index.js');
const { createSessionDirs } = require('./session.js');

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
    adapter = available[0]; // Prefer first available
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

  // Create session directory
  const cwd = options.cwd || process.cwd();
  const { sessionDir } = createSessionDirs(path.join(cwd, '.adsense-lint'));
  runner.sessionDir = sessionDir;

  runner.statusLine = colorize(`  Session: ${path.basename(sessionDir)}  CLI: ${adapter.displayName}`, ANSI.brightCyan);
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

    const done = () => {
      if (resolved) return;
      resolved = true;
      runner.stopSpinner();
      runner.render();
      resolve(runner.summary());
    };

    ptyProcess.onData((d) => {
      const plain = d.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      const lines = plain.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length > 0) {
        runner.traceLines = [...runner.traceLines, ...lines].slice(-4);
      }
    });

    ptyProcess.onExit(() => {
      ptyExited = true;
    });

    // Trust prompt
    setTimeout(() => {
      if (ptyExited || resolved) return;
      const answer = adapter.answerTrust(runner.traceLines.join(' '));
      if (answer) {
        ptyProcess.write(answer);
        runner.statusLine = colorize(`  Auto-answering trust prompt...`, ANSI.dim);
        runner.render();
      }
    }, 1500);

    // Send command
    setTimeout(() => {
      if (ptyExited || resolved) return;
      ptyProcess.write(adapter.formatCommand(skillName, args));
      runner.statusLine = colorize(`  ${adapter.displayName} — ${adapter.formatCommand(skillName, args).trim()}`, ANSI.dim);
      runner.render();
    }, 5000);

    // Monitor loop
    const check = setInterval(() => {
      if (resolved) { clearInterval(check); return; }

      const elapsed = Date.now() - startTime;

      // Auto-answer permission prompts
      if (!ptyExited) {
        const answer = adapter.answerPermission(runner.traceLines.join(' '));
        if (answer && (!runner._lastAuto || Date.now() - runner._lastAuto > 3000)) {
          runner._lastAuto = Date.now();
          ptyProcess.write(answer);
        }
      }

      // Poll for report files
      if (fs.existsSync(sessionDir)) {
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

        try { ptyProcess.write('/exit\r'); } catch (_) {}
        setTimeout(() => { try { ptyProcess.kill(); } catch (_) {} }, 5000);
        done();
      }

      if (ptyExited && bestCount > 0) {
        // Give a few more seconds for final reports
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

  // Auto-answer trust
  setTimeout(() => {
    ptyProcess.write('2\r');
  }, 1500);

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
