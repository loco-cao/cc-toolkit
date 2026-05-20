#!/usr/bin/env node

const { program } = require('commander');
const { colorize, ANSI } = require('../lib/colors.js');
const { selectPlatforms, selectSkill, askScope, askConfirm } = require('../lib/prompts.js');
const { register, unregister, update, list, findSkill } = require('../lib/registry.js');
const { installSkill, uninstallSkill } = require('../lib/installer.js');
const { runSkill, openCli } = require('../lib/runner.js');

program
  .name('cct')
  .description('CC Toolkit — Universal CLI launcher for AI coding assistants')
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
        console.log(colorize('\n  No registered skills. Use "cct register gh:user/repo" first.', ANSI.yellow));
        console.log('');
        return;
      }

      const skillName = await selectSkill(registry.registrations);
      if (!skillName) return;

      console.log('');

      const { getInstallableAdapters } = require('../lib/adapters/index.js');
      const available = getInstallableAdapters().map((a) => a.name);

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
  .command('run <skill> [skillArgs...]')
  .description('Run a skill with PTY dashboard. Extra args are forwarded to the skill.')
  .option('--cli <name>', 'Force a specific CLI (claude, auto)')
  .allowUnknownOption()
  .action(async (skillPath, skillArgs, options) => {
    // Normalize skill name
    let skillName = skillPath;
    if (skillPath.startsWith('skills/')) {
      skillName = skillPath.slice(7);
    }

    const reg = findSkill(skillName);
    if (!reg) {
      console.log(colorize(`\n  Skill "${skillName}" not registered.`, ANSI.yellow));
      console.log(`  Try: cct register gh:user/${skillName}`);
      console.log('');
      return;
    }

    // Args to forward to the skill — everything the user typed after the skill name
    const args = skillArgs || [];

    console.log(`\n  ${colorize(reg.name, ANSI.bold)}  v${reg.version}  ${ANSI.dim}${reg.description || ''}${ANSI.reset}`);
    if (args.length > 0) {
      console.log(`  ${ANSI.dim}args: ${args.join(' ')}${ANSI.reset}`);
    }
    console.log('');

    const summary = await runSkill(skillName, args, {
      cli: options.cli || 'auto',
      cwd: process.cwd(),
      outputDir: reg.output_dir || null,
      globalTimeout: reg.global_timeout || null,
    });

    if (summary) {
      console.log(`\n  ${colorize('═'.repeat(50), ANSI.gray)}`);
      const avg = summary.total;
      console.log(`  ${ANSI.bold}Average score:${ANSI.reset} ${colorize(String(avg).padStart(3), ANSI.bold)}  (${summary.scores.length} agents)`);
      console.log(`  ${colorize('═'.repeat(50), ANSI.gray)}`);
      console.log(`  ${ANSI.dim}Agent          Score${ANSI.reset}`);
      for (const s of summary.scores) {
        console.log(`  ${s.name.padEnd(14)} ${colorize(String(s.score).padStart(4), ANSI.bold)}`);
      }

      // If skill produced a summary report, show its key data
      if (summary.skillReport) {
        console.log('');
        console.log(`  ${colorize('─'.repeat(50), ANSI.gray)}`);
        console.log(`  ${ANSI.bold}Skill report:${ANSI.reset}`);
        for (const [key, val] of Object.entries(summary.skillReport)) {
          const label = key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
          if (typeof val === 'object' && val !== null) {
            console.log(`  ${ANSI.dim}${label}:${ANSI.reset} ${JSON.stringify(val)}`);
          } else {
            console.log(`  ${ANSI.dim}${label}:${ANSI.reset} ${val}`);
          }
        }
      }
      console.log('');
    }
  });

// ── open ──

program
  .command('open')
  .description('Open an AI CLI terminal directly')
  .option('--cli <name>', 'Force a specific CLI (claude, auto)')
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
