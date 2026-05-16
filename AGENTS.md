# AGENTS.md

Skill definitions for AIT are stored in skill repositories, not in this project.

AIT is a **generic launcher** — it does not bundle any skills or hardcode agent knowledge. Skills live in their own GitHub repositories following the [skill-repo-spec](docs/skill-repo-spec.md). Each skill is independent and can be run without AIT.

## Currently Bundled Skills

None — install via `ait register gh:user/repo`.

## Adding a New Skill

1. Create a GitHub repo with an `ait.yaml` at its root (see [template](assets/templates/ait.yaml.hbs))
2. Register: `ait register gh:user/repo`
3. Install: `ait install`

## How AIT discovers skill agents

AIT does not know what agents a skill defines. At runtime:

1. The skill creates a session directory inside its `output_dir` (e.g. `.ait-skill/session-20260516-120000/`)
2. Each agent writes results to a subdirectory (e.g. `01-policy/report.json`)
3. AIT dynamically scans the session directory and discovers all agent subdirectories
4. AIT polls each discovered agent's `report.json` and updates the dashboard
5. When all agents complete and no new agents appear for 30s, AIT considers the skill done

## CLI Adapters

The adapters in `lib/adapters/` are not user-facing. They translate between AIT and each AI CLI (detect, spawn, auto-answer prompts, format commands).
