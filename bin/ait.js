#!/usr/bin/env node

const { program } = require('commander');
const { colorize, ANSI } = require('../lib/colors.js');
const { printBanner, selectPlatforms, selectSkill, askScope, askCli, askUrl, askConfirm } = require('../lib/prompts.js');
const { register, unregister, update, list, findSkill } = require('../lib/registry.js');
const { installSkill, uninstallSkill } = require('../lib/installer.js');
const { runSkill, openCli } = require('../lib/runner.js');
const { detectAll } = require('../lib/adapters/index.js');
const path = require('path');

program
  .name('ait')
  .description('AI Terminal — Universal CLI launcher for AI coding assistants')
  .version(require('../package.json').version);

// ── register ──

program
  .command('register <repo>')
  .description('Register a skill repository (gh:user/repo)')
  .action(async (repo) => {
    try {
      const scope = await askScope();
      console.log('');
      register(repo, scope);
    } catch (err) {
      if (err.name === 'AbortPromptError') {
        console.log('\nCancelled.');
      } else {
        console.log(colorize(`\n  Error: ${err.message}`, ANSI.red));
      }
    }
    console.log('');
  });

// ── unregister ──

program
  .command('unregister <name>')
  .description('Remove a skill registration')
  .action(async (name) => {
    try {
      const confirmed = await askConfirm(`Remove "${name}" from registry?`);
      if (confirmed) {
        unregister(name);
      } else {
        console.log('  Cancelled.');
      }
    } catch (err) {
      if (err.name === 'AbortPromptError') {
        console.log('\nCancelled.');
      } else {
        console.log(colorize(`\n  Error: ${err.message}`, ANSI.red));
      }
    }
    console.log('');
  });

// ── update ──

program
  .command('update')
  .description('Pull latest from all registered skill repos')
  .action(() => {
    update();
  });

// ── list ──

program
  .command('list')
  .description('Show registered skills')
  .action(() => {
    list();
  });

// ── install ──

program
  .command('install')
  .description('Install a registered skill to AI CLI platforms')
  .action(async () => {
    try {
      const registry = require('../lib/config.js').loadRegistry();
      if (registry.registrations.length === 0) {
        console.log(colorize('\n  No registered skills. Use "ait register gh:user/repo" first.', ANSI.yellow));
        console.log('');
        return;
      }

      const skillName = await selectSkill(registry.registrations);
      if (!skillName) return;

      console.log('');

      const available = [];
      try { available.push('claude'); } catch (_) {}
      try { available.push('codex'); } catch (_) {}

      const platforms = await selectPlatforms(available);
      if (platforms.length === 0) {
        console.log('  Cancelled.');
        console.log('');
        return;
      }

      console.log('');
      installSkill(skillName, platforms);
    } catch (err) {
      if (err.name === 'AbortPromptError') {
        console.log('\nCancelled.');
      } else {
        console.log(colorize(`\n  Error: ${err.message}`, ANSI.red));
      }
    }
    console.log('');
  });

// ── run ──

program
  .command('run [skill]')
  .description('Run a skill with PTY dashboard')
  .option('--cli <name>', 'Force a specific CLI (claude, codex, auto)')
  .option('--local', 'Local project audit')
  .option('--url <url>', 'Remote URL audit')
  .option('--timeout <ms>', 'Global timeout in ms')
  .action(async (skillPath, options) => {
    if (!skillPath) {
      console.log(colorize('\n  Usage: ait run skills/<name> [--local | --url <url>]', ANSI.bold));
      console.log('');
      return;
    }

    // Normalize skill name
    let skillName = skillPath;
    if (skillPath.startsWith('skills/')) {
      skillName = skillPath.slice(7);
    }

    const reg = findSkill(skillName);
    if (!reg) {
      console.log(colorize(`\n  Skill "${skillName}" not registered.`, ANSI.yellow));
      console.log(`  Try: ait register gh:user/${skillName}`);
      console.log('');
      return;
    }

    // Build args
    const args = [];
    if (options.local) args.push('--local');
    if (options.url) args.push(options.url);

    console.log(`\n  ${colorize(reg.name, ANSI.bold)}  v${reg.version}  ${ANSI.dim}${reg.description || ''}${ANSI.reset}`);
    console.log('');

    const summary = await runSkill(skillName, args, {
      cli: options.cli || 'auto',
      cwd: process.cwd(),
      timeout: options.timeout ? parseInt(options.timeout) : undefined,
    });

    if (summary) {
      const gradeColor = summary.grade === '不合格' ? ANSI.brightRed
        : summary.grade === '基本满足' ? ANSI.brightYellow
        : summary.grade === '待提升' ? ANSI.brightCyan
        : ANSI.brightGreen;
      const riskColor = summary.risk.includes('HIGH') ? ANSI.brightRed : ANSI.yellow;

      console.log(`\n  ${colorize('═'.repeat(62), ANSI.gray)}`);
      console.log(`  ${ANSI.bold}Score:${ANSI.reset} ${colorize(String(summary.total).padStart(3), ANSI.bold)}  Grade: ${colorize(summary.grade, gradeColor)}  Risk: ${colorize(summary.risk, riskColor)}`);
      if (summary.veto) {
        console.log(`  ${colorize('! Policy veto — score <60 forces failing grade', ANSI.brightRed)}`);
      }
      console.log(`  ${colorize('═'.repeat(62), ANSI.gray)}`);
      console.log(`  ${ANSI.dim}Agent         Score   Priority${ANSI.reset}`);
      for (const s of summary.scores) {
        const pColor = s.priority === 'Critical' ? ANSI.brightRed
          : s.priority === 'High' ? ANSI.brightYellow
          : s.priority === 'Medium' ? ANSI.brightCyan
          : ANSI.dim;
        console.log(`  ${s.name.padEnd(12)} ${colorize(String(s.score).padStart(4), ANSI.bold)}  ${colorize(s.priority.padEnd(8), pColor)}`);
      }
      console.log('');
    }
  });

// ── open ──

program
  .command('open')
  .description('Open an AI CLI terminal directly')
  .option('--cli <name>', 'Force a specific CLI (claude, codex, auto)')
  .action(async (options) => {
    await openCli(options.cli || 'auto');
  });

// ── help (override for better formatting) ──

program
  .command('help')
  .description('Show help')
  .action(() => {
    program.help();
  });

// Default: show help
program
  .action(() => {
    program.help();
  });

program.parse();
