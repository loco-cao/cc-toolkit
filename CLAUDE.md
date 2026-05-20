# CLAUDE.md

This file provides guidance to Claude Code when working with the CCT repository.

## Project Overview

CCT (CC Toolkit) is a **universal, skill-agnostic CLI launcher** for AI coding assistants. Skills don't know CCT exists — they just follow the `cct.yaml` spec and run independently. CCT provides:

- Skill registry — `cct register gh:user/repo` to add skill repositories
- Multi-platform install — distribute skills to Claude Code and others
- PTY-based runner — launch AI CLIs with auto-answer for trust/permission prompts
- Real-time dashboard — dynamic agent discovery, spinner, live score display
- Interactive prompts — argument-hint driven parameter collection

## Architecture

```
bin/cct.js              CLI entry (Commander)
lib/
  colors.js             ANSI escape sequences
  config.js             ~/.cct/config.json read/write
  platform-paths.js     Cross-platform path mapping (Windows/macOS/Linux)
  prompts.js            Interactive prompts (checkbox, select, input, confirm)
  registry.js           Skill repository registration & indexing
  installer.js          Copy skill files to CLI platform paths
  runner.js             PTY launch, auto-answer, dynamic dashboard, completion detection
  adapters/
    index.js            Adapter detection & factory
    claude.js           Claude Code PTY adapter
assets/templates/
  cct.yaml.hbs          Template for new skill repositories
docs/
  architecture.md       Full architecture documentation
  skill-repo-spec.md    Skill repository specification
  cli-adapters.md       Adapter interface definition
```

## Key Design Decisions

- **Skills are independent** — CCT does not know what agents a skill has. It discovers them dynamically from the skill's output directory.
- One GitHub repo = one skill
- `cct.yaml` in repo root is the canonical skill descriptor and protocol contract
- Adapters encapsulate all CLI-specific behavior (detect, spawn, answer, format)
- Session directories are created by the skill, discovered by CCT at runtime
- Dashboard dynamically scans `<output_dir>/<session-*>/` for agent subdirectories
- Each agent writes a `report.json` with a `score` field; CCT polls these generically
- Completion detection: all discovered agents have reports + 30s stabilization (no new agents)
- After stabilization, 60s grace period waits for a `99-summary/report.json` if the skill produces one
- Registry scope (global/project) is user-selectable at register time
- Skill args are passed through transparently (`[skillArgs...]`) — CCT does not interpret them
