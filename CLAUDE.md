# CLAUDE.md

This file provides guidance to Claude Code when working with the AIT repository.

## Project Overview

AIT (AI Terminal) is a **universal, skill-agnostic CLI launcher** for AI coding assistants. Skills don't know AIT exists — they just follow the `ait.yaml` spec and run independently. AIT provides:

- Skill registry — `ait register gh:user/repo` to add skill repositories
- Multi-platform install — distribute skills to Claude Code, Codex, and others
- PTY-based runner — launch AI CLIs with auto-answer for trust/permission prompts
- Real-time dashboard — dynamic agent discovery, spinner, live score display
- Interactive prompts — argument-hint driven parameter collection

## Architecture

```
bin/ait.js              CLI entry (Commander)
lib/
  colors.js             ANSI escape sequences
  config.js             ~/.ait/config.json read/write
  platform-paths.js     Cross-platform path mapping (Windows/macOS/Linux)
  prompts.js            Interactive prompts (checkbox, select, input, confirm)
  registry.js           Skill repository registration & indexing
  installer.js          Copy skill files to CLI platform paths
  runner.js             PTY launch, auto-answer, dynamic dashboard, completion detection
  adapters/
    index.js            Adapter detection & factory
    claude.js           Claude Code PTY adapter
    codex.js            Codex CLI PTY adapter
assets/templates/
  ait.yaml.hbs          Template for new skill repositories
docs/
  architecture.md       Full architecture documentation
  skill-repo-spec.md    Skill repository specification
  cli-adapters.md       Adapter interface definition
```

## Key Design Decisions

- **Skills are independent** — AIT does not know what agents a skill has. It discovers them dynamically from the skill's output directory.
- One GitHub repo = one skill
- `ait.yaml` in repo root is the canonical skill descriptor and protocol contract
- Adapters encapsulate all CLI-specific behavior (detect, spawn, answer, format)
- Session directories are created by the skill, discovered by AIT at runtime
- Dashboard dynamically scans `<output_dir>/<session-*>/` for agent subdirectories
- Each agent writes a `report.json` with a `score` field; AIT polls these generically
- Completion detection: all discovered agents have reports + 30s stabilization (no new agents)
- After stabilization, 60s grace period waits for a `99-summary/report.json` if the skill produces one
- Registry scope (global/project) is user-selectable at register time
- Skill args are passed through transparently (`[skillArgs...]`) — AIT does not interpret them
