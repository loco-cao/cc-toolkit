# CCT Architecture

## Overview

```
cct <verb> [target] [--flags]

cct run skills/my-skill --local        PTY 启动 → 仪表盘 → 审计
cct register gh:user/my-skill          注册一个 skill 仓库
cct update                             拉取所有已注册仓库
cct list [--brief]                     展示已注册的 skill
cct unregister skills/my-skill         移除注册
cct install                            交互选 skill + 平台 → 安装分发
cct open [--cli <name>]               直接打开 AI CLI 交互终端
cct help                              帮助 & 可用命令
```

## Layer Architecture

```
┌─────────────────────────────────────────────────┐
│                  bin/cct.js                       │  CLI Entry (Commander)
├──────────┬──────────┬──────────┬────────────────┤
│ registry │ installer│  runner  │    prompts     │  Core Modules
├──────────┴──────────┴──────────┴────────────────┤
│              lib/adapters/                        │  CLI Abstraction
│     claude.js                                    │
├─────────────────────────────────────────────────┤
│  lib/colors.js  lib/session.js  lib/config.js    │  Utilities
└─────────────────────────────────────────────────┘
```

## Module Responsibilities

### bin/cct.js
- Parse CLI args with Commander
- Route to the correct module
- Print help

### lib/registry.js
- Register: `gh:user/repo` → clone to `~/.cct/repos/<name>/`
- Update: `git pull` all registered repos
- List: show all registered skills with metadata
- Unregister: remove from registry, optionally delete local clone
- Read `cct.yaml` from each repo, build skill index
- Store registration in `~/.cct/registry.json`

### lib/installer.js
- Show checkbox list of registered skills
- Show platform selection (Claude Code)
- Copy skill files to platform-specific paths
- Uses adapters to know target paths

### lib/runner.js
- Read skill metadata from registry
- Parse argument-hint → generate interactive prompts
- Select CLI adapter
- Create session directory
- Spawn PTY process via adapter
- Auto-answer trust/permission prompts
- Poll for report.json → render dashboard
- Print summary

### lib/adapters/
Each adapter implements:
```
detect(): string | null          // find executable
spawn(bin, cwd): PtyProcess      // start PTY
answerTrust(output): string      // workspace trust reply
answerPermission(output): string // tool permission reply
formatCommand(skill, args): string
getInstallPaths(): object        // where to copy files
```

### lib/config.js
- Read/write `~/.cct/config.json`
- Default CLI preference
- Registry scope (global / project)

### lib/prompts.js
- Checkbox multi-select (for install)
- Select list (for CLI choice, scope choice)
- Text input with validation (for URL, custom args)
- Confirm yes/no

### lib/session.js
- Create timestamped session directories
- Cross-platform path handling

### lib/colors.js
- ANSI escape sequences
- Color helper functions
- Spinner frames

### lib/platform-paths.js
- Map platform names to OS-specific directory paths
- Handle Windows / macOS / Linux

## Data Flow: `cct run skills/my-skill --local`

```
User types: cct run skills/my-skill --local
  │
  ▼
bin/cct.js: parse args → skill=my-skill, mode=--local
  │
  ▼
registry.js: look up my-skill in registry.json
  │ found → read cct.yaml → get argument-hint, prompts, triggers
  │
  ▼
runner.js:
  ├─ Parse argument-hint → detect --local already given ✓
  ├─ No missing required params → skip prompts
  ├─ Detect CLI: claude ✓ → auto-select claude
  ├─ Create session dir: .my-skill/session-20260516-HHMMSS/
  ├─ adapter.claude.spawn() → PTY
  ├─ Auto-answer trust → "2\r"
  ├─ Send command → "/my-skill --local\r"
  ├─ Auto-answer permissions → "2\r"
  ├─ Poll session dir for report.json files
  ├─ Render dashboard (colors.js spinner + status)
  ├─ All 8 agents done → print summary
  └─ PTY cleanup
```

## Data Flow: `cct register gh:user/my-skill`

```
User types: cct register gh:user/my-skill
  │
  ▼
bin/cct.js: parse args → repo=gh:user/my-skill
  │
  ▼
registry.js:
  ├─ Expand gh:user/repo → https://github.com/user/repo.git
  ├─ Ask: global (~/.cct/repos/) or project (./.cct/repos/)?
  ├─ git clone to target path
  ├─ Validate cct.yaml exists in repo root
  ├─ Read cct.yaml → extract name, version, description
  ├─ Add entry to registry.json
  └─ Print: "Registered: my-skill v1.0.0"
```

## Skill Repository Specification

See [skill-repo-spec.md](skill-repo-spec.md)

## Configuration Files

### ~/.cct/config.json (global)
```json
{
  "default_cli": "auto",
  "cli_paths": {
    "claude": null
  },
  "registry_scope": "global"
}
```

### ~/.cct/registry.json (global registrations)
```json
{
  "registrations": [
    {
      "name": "my-skill",
      "version": "0.2.0",
      "source": "gh:lococao/my-skill",
      "local_path": "~/.cct/repos/my-skill",
      "installed_at": "2026-05-16T10:00:00Z",
      "installed_to": ["claude"]
    }
  ]
}
```

## Installation Paths

| Platform | Skills Path | Agents Path |
|----------|------------|-------------|
| Claude Code | `~/.claude/skills/` | `~/.claude/agents/` |
