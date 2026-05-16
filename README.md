# AIT — AI Terminal

**一条命令，让 skill 跑在所有 AI CLI 上。**

AI 编程助手（Claude Code、Codex 等）各自有一套 skill/agent 机制，但格式不互通、安装路径各异、运行时还需要手动确认信任和权限。AIT 在它们之上加了一层通用适配：

- **统一注册** —— 一个 GitHub 仓库就是一个 skill，`ait register` 一键登记
- **跨平台安装** —— `ait.yaml` 里声明各 CLI 的安装映射，一条命令复制到 Claude Code、Codex 等对应目录
- **无人值守运行** —— PTY 终端 + 状态机自动应答信任/权限提示，带实时仪表盘
- **Skill 无关** —— AIT 不知道 skill 内部有几个 agent、叫什么名字。它动态发现 session 目录下的 agent，轮询 `report.json`，通用展示结果

## 安装

```bash
npm install -g @lococao/ai-terminal
```

## 快速开始

```bash
# 注册一个 skill 仓库
ait register gh:loco-cao/skill-adsense-lint

# 安装到你的 AI CLI
ait install

# 运行一个 skill（参数直接透传）
ait run adsense-lint --local
ait run adsense-lint --url https://example.com
```

## 命令

| 命令 | 说明 |
|---------|-------------|
| `ait register <仓库>` | 注册一个 skill 仓库（`gh:用户/仓库名` 或本地路径） |
| `ait update` | 拉取所有已注册仓库的最新版本 |
| `ait list` | 显示已注册的 skill 列表 |
| `ait unregister <名称>` | 移除一个注册 |
| `ait install` | 交互式选择目标 CLI 平台并安装 |
| `ait run <skill> [参数...]` | 通过 PTY 仪表盘启动 skill，参数透传给 skill |
| `ait open [--cli <名称>]` | 直接打开一个 AI CLI 终端 |
| `ait help` | 显示帮助 |

## 设计原则

**Skill 不知道 AIT 存在，可以独立运行。** AIT 只是一个通用 launcher。

Skill 通过 `ait.yaml` 声明协议：

```yaml
# ait.yaml — skill 仓库根目录
name: my-skill
version: 0.1.0
description: 我的 skill

targets:
  claude:
    trigger: /my-skill
    path: claude/SKILL.md

# AIT 协议
output_dir: .ait-skill       # skill 输出目录（AIT 从这里发现 session）
report_pattern: "*/report.json"  # agent 报告文件的 glob
global_timeout: 600              # 全局超时（秒）
agent_timeout: 120               # 单 agent 超时（秒，预留）
```

AIT 运行时：
1. 启动 CLI，发送 skill 命令
2. 在 `output_dir` 下发现新的 `session-*` 目录
3. 动态扫描 session 下的所有子目录（agent）
4. 轮询每个 agent 的 `report.json` → 更新仪表盘
5. 所有 agent 完成后等待 30s 稳定期，再等 60s 收集 summary → 退出
6. 通用展示：agent 名、分数、skill 报告（如有）

详细规范见 [docs/skill-repo-spec.md](docs/skill-repo-spec.md)

## 支持的 CLI 后端

| CLI | 状态 |
|-----|------|
| Claude Code | 完整支持 |
| OpenAI Codex | 适配完成，待 Codex CLI 正式发布后验证 |
