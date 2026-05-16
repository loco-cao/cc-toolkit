# CLAUDE.md

This file provides guidance to Claude Code when working with the AIT repository.

## Project Overview

AIT (AI Terminal) is a universal CLI launcher for AI coding assistants. It provides:

- Skill registry — `ait register gh:user/repo` to add skill repositories
- Multi-platform install — distribute skills to Claude Code, Codex, and others
- PTY-based runner — launch AI CLIs with auto-answer for trust/permission prompts
- Real-time dashboard — spinner animation, status per agent, live score display
- Interactive prompts — argument-hint driven parameter collection

## Architecture

```
bin/ait.js              CLI entry (Commander)
lib/
  colors.js             ANSI escape sequences
  config.js             ~/.ait/config.json read/write
  platform-paths.js     Cross-platform path mapping (Windows/macOS/Linux)
  prompts.js            Interactive prompts (checkbox, select, input, confirm)
  session.js            Session directory creation
  registry.js           Skill repository registration & indexing
  installer.js          Copy skill files to CLI platform paths
  runner.js             PTY launch, dashboard, report polling, summary
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

- One GitHub repo = one skill
- `ait.yaml` in repo root is the canonical skill descriptor
- Adapters encapsulate all CLI-specific behavior (detect, spawn, answer, format)
- Dashboard polls for report.json files — CLI-agnostic
- Registry scope (global/project) is user-selectable at register time
