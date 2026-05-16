const { checkbox, select, input, confirm } = require('@inquirer/prompts');
const { ANSI, colorize } = require('./colors.js');

function printBanner() {
  console.log('');
  console.log(`  ${colorize('╔══════════════════════════════════════════════════════╗', ANSI.cyan)}`);
  console.log(`  ${colorize('║', ANSI.cyan)}     ${ANSI.bold}AIT — AI Terminal · Universal Skill Launcher${ANSI.reset}        ${colorize('║', ANSI.cyan)}`);
  console.log(`  ${colorize('╚══════════════════════════════════════════════════════╝', ANSI.cyan)}`);
  console.log('');
}

async function selectPlatforms(available) {
  printBanner();

  const choices = [];
  if (available.includes('claude')) {
    choices.push({
      name: ` ${colorize('Claude Code', ANSI.brightCyan)}  → ~/.claude/skills/ + ~/.claude/agents/`,
      value: 'claude',
      checked: true,
    });
  }
  if (available.includes('codex')) {
    choices.push({
      name: ` ${colorize('Codex CLI', ANSI.brightBlue)}   → ~/.codex/skills/ + ~/.codex/agents/`,
      value: 'codex',
    });
  }

  if (choices.length === 0) {
    console.log(`  ${colorize('No supported AI CLIs detected.', ANSI.yellow)}`);
    console.log('');
    return [];
  }

  const platforms = await checkbox({
    message: 'Select platforms to install to (Space to toggle, Enter to confirm):',
    choices,
    loop: false,
    pageSize: 10,
    validate: (selected) => selected.length > 0 || 'Select at least one platform.',
  });

  return platforms;
}

async function selectSkill(registrations) {
  if (registrations.length === 0) {
    console.log(`  ${colorize('No registered skills. Use "ait register gh:user/repo" first.', ANSI.yellow)}`);
    console.log('');
    return null;
  }

  const choices = registrations.map((reg) => ({
    name: ` ${colorize(reg.name, ANSI.bold)} ${ANSI.dim}v${reg.version}${ANSI.reset} — ${reg.description || ''}`,
    value: reg.name,
  }));

  return select({
    message: 'Select a skill:',
    choices,
    loop: false,
    pageSize: 15,
  });
}

async function askScope() {
  return select({
    message: 'Where should this registration live?',
    choices: [
      {
        name: ` ${colorize('Global', ANSI.brightCyan)}  → ~/.ait/repos/  (available everywhere)`,
        value: 'global',
      },
      {
        name: ` ${colorize('Project', ANSI.brightBlue)} → ./.ait/repos/  (this project only)`,
        value: 'project',
      },
    ],
    loop: false,
  });
}

async function askCli() {
  return select({
    message: 'Choose AI CLI:',
    choices: [
      { name: ` ${colorize('Claude Code', ANSI.brightCyan)}`, value: 'claude' },
      { name: ` ${colorize('Codex CLI', ANSI.brightBlue)}`, value: 'codex' },
    ],
    loop: false,
  });
}

async function askUrl() {
  return input({
    message: 'Enter target URL:',
    validate: (value) => /^https?:\/\/.+/.test(value) || 'Must start with http:// or https://',
  });
}

async function askConfirm(message) {
  return confirm({
    message,
    default: false,
  });
}

module.exports = {
  printBanner,
  selectPlatforms,
  selectSkill,
  askScope,
  askCli,
  askUrl,
  askConfirm,
};
