# AIT — AI Terminal

**一条命令，让 skill 跑在所有 AI CLI 上。**

AI 编程助手（Claude Code、Codex 等）各自有一套 skill/agent 机制，但格式不互通、安装路径各异、运行时还需要手动确认信任和权限。AIT 在它们之上加了一层通用适配：

- **统一注册** —— 一个 GitHub 仓库就是一个 skill，`ait register` 一键登记
- **跨平台安装** —— `ait.yaml` 里声明各 CLI 的安装映射，一条命令复制到 Claude Code、Codex 等对应目录
- **无人值守运行** —— PTY 终端 + 状态机自动应答信任/权限提示，带实时仪表盘

## 安装

```bash
npm install -g ai-terminal
```

## 快速开始

```bash
# 注册一个 skill 仓库
ait register gh:lococao/adsense-lint

# 安装到你的 AI CLI
ait install

# 运行一个 skill
ait run skills/adsense-lint --local
```

## 命令

| 命令 | 说明 |
|---------|-------------|
| `ait register <仓库>` | 注册一个 skill 仓库（`gh:用户/仓库名`） |
| `ait update` | 拉取所有已注册仓库的最新版本 |
| `ait list` | 显示已注册的 skill 列表 |
| `ait unregister <名称>` | 移除一个注册 |
| `ait install` | 交互式选择目标 CLI 平台并安装 |
| `ait run <skill> [参数]` | 通过 PTY 仪表盘启动 skill |
| `ait open [--cli <名称>]` | 直接打开一个 AI CLI 终端 |
| `ait help` | 显示帮助 |

## 支持的 CLI 后端

| CLI | 状态 |
|-----|------|
| Claude Code | 完整支持 |
| OpenAI Codex | 适配完成，待 Codex CLI 正式发布后验证 |

## Skill 仓库规范

详见 [docs/skill-repo-spec.md](docs/skill-repo-spec.md)
