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

  /** PTY 状态检测 — 从输出文本判断当前 Agent 状态 */
  detectState(output: string): AgentState;

  /** 识别 workspace trust 提示，返回应答字符串 */
  answerTrust(output: string): string | null;

  /** 识别工具权限提示，返回应答字符串 */
  answerPermission(output: string): string | null;

  /** 将 skill 的 trigger + args 格式化为 CLI 命令 */
  formatCommand(skillName: string, args: string[]): string;

  /** 返回该 CLI 的安装目标路径 */
  getInstallPaths(): { skills: string; agents: string };
}
```

## AgentState 枚举

```typescript
enum AgentState {
  IDLE,                // 空闲，无提示
  WAITING_TRUST,       // 等待信任确认
  WAITING_PERMISSION,  // 等待权限审批
  EXECUTING,           // 正在执行任务
  ERROR,               // 出错
}
```

## 共享自动化模块 (`lib/adapters/automation.js`)

提供跨 CLI 的通用基础设施：

| 导出 | 说明 |
|------|------|
| `AgentState` | 状态枚举 |
| `cleanOutput(output)` | 剥离 ANSI 转义序列和控制字符 |
| `DEFAULT_TRUST_PATTERNS` | 通用 trust 提示匹配模式列表 |
| `DEFAULT_PERMISSION_PATTERNS` | 通用 permission 提示匹配模式列表 |
| `createAnswerer(patterns, reply)` | 工厂函数：从模式列表 + 应答字符串创建 answer 函数 |
| `createStateDetector(trustPats, permPats)` | 工厂函数：从两组模式创建 detectState 函数 |

每个适配器在自己的 CLI 特定模式基础上附加默认模式，构建 answerTrust / answerPermission / detectState。

## Claude Code Adapter

| Method | Implementation |
|--------|---------------|
| `name` | `"claude"` |
| `displayName` | `"Claude Code"` |
| `detect()` | `which claude` / `where claude`，优先 `.exe` |
| `getVersion()` | `claude --version` |
| `spawn()` | `pty.spawn(bin, [], { name: 'xterm-color', cols, rows, cwd, env })` |
| `detectState()` | 匹配 trust 关键词 → `WAITING_TRUST`，权限关键词 → `WAITING_PERMISSION`，否则 `IDLE` |
| `answerTrust()` | 匹配 Claire Code 信任对话框 + 通用 trust 模式 → 返回 `"2\r"`（选择 "Yes, don't ask again"） |
| `answerPermission()` | 同上逻辑，返回 `"2\r"` |
| `formatCommand()` | `/<skillName> <args>\r` → `/my-skill --local\r` |
| `getInstallPaths()` | `{ skills: "~/.claude/skills/", agents: "~/.claude/agents/" }` |

### Claude Code PTY 启动时序

```
spawn("claude", cwd)
  ↓ 持续轮询
detectState() → WAITING_TRUST  → answerTrust() → "2\r"
detectState() → WAITING_PERMISSION → answerPermission() → "2\r"
  ↓ ~5000ms (trust 已解决)
formatCommand() → "/skill\r"
  ↓ 持续
detectState() → WAITING_PERMISSION → answerPermission() → "2\r"
  ↓
monitor output / poll reports
  ↓ done
formatCommand("exit") → kill PTY
```

## Adapter Detection

`lib/adapters/index.js` 提供：

```javascript
function detectAll(): CliAdapter[]           // 检测所有可用 CLI
function getAdapter(name: string): CliAdapter  // 按名称获取适配器
function getInstallableAdapters(): CliAdapter[] // 所有可安装的适配器（不要求 CLI 已安装）
```

## 设计原则

### PTY + Prompt Automation（非 API Automation）

CCT 之与 Agent CLI 的交互基于 **终端自动化**，而非结构化 API：

```
spawn(agent cli)
  ↓
读取 stdout
  ↓
detectState() 判断当前状态
  ↓
answerTrust / answerPermission 自动回复 stdin
```

### Heuristic Matching（非精确匹配）

Agent CLI 的提示文案可能随版本变化。所有模式匹配采用：

- `toLowerCase()` 标准化
- `includes()` 子串匹配
- 通用默认模式 + CLI 特定模式组合
- 避免精确字符串比较
