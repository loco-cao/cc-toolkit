# AGENTS.md

Agent definitions for AIT are stored in skill repositories, not in this project.

This project provides the CLI tooling, not the skills themselves. Skills live in their own GitHub repositories following the [skill-repo-spec](docs/skill-repo-spec.md).

## Currently Supported Agents

None bundled — install via `ait register gh:user/repo`.

## Adding a New Agent

1. Create a GitHub repo following the skill-repo-spec
2. Register: `ait register gh:user/repo`
3. Install: `ait install`

## CLI Adapter Agents

The adapters in `lib/adapters/` are not user-facing agents. They are internal abstractions that translate between `ait` and each AI CLI.
