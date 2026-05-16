# AIT — AI Terminal

Universal CLI launcher for AI coding assistants. Register skill repositories, install to any supported CLI, and run with a live PTY dashboard.

## Install

```bash
npm install -g ai-terminal
```

## Quick Start

```bash
# Register a skill repository
ait register gh:lococao/adsense-lint

# Install to your AI CLI
ait install

# Run a skill
ait run skills/adsense-lint --local
```

## Commands

| Command | Description |
|---------|-------------|
| `ait register <repo>` | Register a skill repo (`gh:user/repo`) |
| `ait update` | Pull latest from all registered repos |
| `ait list` | Show registered skills |
| `ait unregister <name>` | Remove a registration |
| `ait install` | Interactive install to AI CLI platforms |
| `ait run <skill> [args]` | Launch skill with PTY dashboard |
| `ait open [--cli <name>]` | Open an AI CLI terminal directly |
| `ait help` | Show help |

## Supported CLI Backends

- Claude Code
- Codex (coming soon)

## Skill Repository Spec

See [docs/skill-repo-spec.md](docs/skill-repo-spec.md)
