# AGENTS.md

Skill definitions for CCT are stored in skill repositories, not in this project.

CCT is a **generic launcher** — it does not bundle any skills or hardcode agent knowledge. Skills live in their own GitHub repositories following the [skill-repo-spec](docs/skill-repo-spec.md). Each skill is independent and can be run without CCT.

## Currently Bundled Skills

None — install via `cct register gh:user/repo`.

## Adding a New Skill

1. Create a GitHub repo with a `cct.yaml` at its root (see [template](assets/templates/cct.yaml.hbs))
2. Register: `cct register gh:user/repo`
3. Install: `cct install`

## How CCT discovers skill agents

CCT does not know what agents a skill defines. At runtime:

1. The skill creates a session directory inside its `output_dir` (e.g. `.cct-skill/session-20260516-120000/`)
2. Each agent writes results to a subdirectory (e.g. `01-policy/report.json`)
3. CCT dynamically scans the session directory and discovers all agent subdirectories
4. CCT polls each discovered agent's `report.json` and updates the dashboard
5. When all agents complete and no new agents appear for 30s, CCT considers the skill done

## CLI Adapters

The adapters in `lib/adapters/` are not user-facing. They translate between CCT and each AI CLI (detect, spawn, auto-answer prompts, format commands).
