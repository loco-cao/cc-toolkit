# CLI Adapter Interface

## Interface Definition

```typescript
interface CliAdapter {
  /** 唯一标识 */
  name: string;

  /** 显示名称 */
  displayName: string;

  /** 在 PATH 中检测可执行文件，返回路径或 null */
  detect(): string | null;

  /** 获取版本号 */
  getVersion(bin: string): string;

  /** 启动 PTY 进程 */
  spawn(bin: string, cwd: string): PtyProcess;

  /** 识别 workspace trust 提示，返回应答字符串 */
  answerTrust(output: string): string | null;

  /** 识别工具权限提示，返回应答字符串 */
  answerPermission(output: string): string | null;

  /** 将 skill 的 trigger + args 格式化为 CLI 命令 */
  formatCommand(skill: SkillEntry, args: string[]): string;

  /** 返回该 CLI 的安装目标路径 */
  getInstallPaths(): { skills: string; agents: string };
}
```

## Claude Code Adapter

| Method | Implementation |
|--------|---------------|
| `name` | `"claude"` |
| `displayName` | `"Claude Code"` |
| `detect()` | `which claude` / `where claude`，优先 `.exe` |
| `getVersion()` | `claude --version` |
| `spawn()` | `pty.spawn(bin, [], { name: 'xterm-color', cols, rows, cwd, env })` |
| `answerTrust()` | 检测 `Yes, and don't ask again` + `Tab to amend` → 返回 `"2\r"` |
| `answerPermission()` | 同上逻辑，返回 `"2\r"` |
| `formatCommand()` | `/<trigger> <args>` → `/adsense-lint --local` |
| `getInstallPaths()` | `{ skills: "~/.claude/skills/", agents: "~/.claude/agents/" }` |

### Claude Code PTY 启动时序

```
spawn("claude", cwd)
  ↓ ~1500ms
answerTrust() → "2\r"          (workspace trust)
  ↓ ~3500ms
formatCommand() → "/skill\r"   (send skill command)
  ↓ 持续
answerPermission() → "2\r"    (auto-answer tool permission popups)
  ↓
monitor output / poll reports
  ↓ done
"/exit\r" → kill PTY
```

## Codex Adapter

| Method | Implementation |
|--------|---------------|
| `name` | `"codex"` |
| `displayName` | `"OpenAI Codex CLI"` |
| `detect()` | `which codex` / `where codex` |
| `getVersion()` | `codex --version` |
| `spawn()` | `pty.spawn(bin, [], { name: 'xterm-color', cols, rows, cwd, env })` |
| `answerTrust()` | 待调研（Codex 的信任提示格式） |
| `answerPermission()` | 待调研（Codex 的权限提示格式） |
| `formatCommand()` | 待调研（Codex 的 skill 触发语法） |
| `getInstallPaths()` | `{ skills: "~/.codex/skills/", agents: "~/.codex/agents/" }` |

> Codex adapter 在 Codex CLI 正式发布后补全具体交互细节。

## Adapter Detection

`lib/adapters/index.js` 提供：

```javascript
function detectAll(): CliAdapter[]           // 检测所有可用 CLI
function detect(name: string): CliAdapter   // 检测指定 CLI
function select(auto?: boolean): CliAdapter // 交互选择或自动选择
```
