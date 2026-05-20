# Skill Repository Specification v1.0

一个符合 CCT 规范的 GitHub 仓库必须遵循以下约定，以便 `cct register` 自动发现和安装。

## Repository Layout

```
<repo-name>/
├── cct.yaml                 # 必需：skill 元数据（仓库根目录）
├── claude/
│   ├── SKILL.md             # Claude Code 格式 skill
│   └── agents/              # 可选：子 agent 定义
│       ├── agent-a.md
│       └── agent-b.md
├── references/              # 可选：共享参考文件
│   ├── rules.md
│   └── template.md
├── workflows/               # 可选：工作流定义
│   └── full-audit.md
├── README.md
└── LICENSE
```

## cct.yaml Specification

### Required Fields

```yaml
name: my-skill                        # 唯一标识（kebab-case）
version: 0.2.0                        # semver
description: >-                       # 中文一行描述
  我的 skill 示例
argument-hint: "<url> [--auto] [--local]"  # 参数提示

targets:                              # 至少一个 CLI 目标
  claude:
    trigger: /my-skill                # 在 CLI 中触发的命令
    path: claude/SKILL.md             # 相对仓库根的 skill 文件路径
```

### Optional Fields

```yaml
prompts:                              # 交互式参数（从 argument-hint 推导）
  - name: mode
    type: select
    message: "选择审计模式"
    options:
      - label: 远程 URL
        value: "<url>"
      - label: 本地项目
        value: "--local"
  - name: target_url
    type: input
    message: "输入目标 URL"
    when:
      field: mode
      equals: "<url>"
    validate: "^https?://"

output_dir: .my-skill                  # 运行时输出目录（默认 .my-skill）
report_pattern: "*/report.json"        # 报告文件匹配模式
global_timeout: 600                    # 全局超时（秒），默认 600
agent_timeout: 120                     # 单 agent 超时（秒），默认 120
```

### argument-hint 语法

```
<required>    → 必填参数，cct 弹出输入框
[--optional]  → 可选参数，cct 弹出开关
<url>         → 特殊类型，cct 用 URL 验证
```

prompts 由 argument-hint 自动推导，也可手动覆盖。

### 多 CLI 触发命令差异

不同 CLI 下同一个 skill 的触发命令可能不同：

```yaml
targets:
  claude:
    trigger: /my-skill
```

## Validation Rules

`cct register` 会验证：

1. `cct.yaml` 存在于仓库根目录
2. `name` 字段存在且为 kebab-case
3. `version` 字段存在且为合法 semver
4. `targets` 至少包含一个 CLI 目标
5. 每个 target 的 `path` 指向的文件必须存在
6. `trigger` 以 `/` 开头

验证失败 → 拒绝注册，打印具体错误。

## Example: my-skill

仓库 `github.com/lococao/my-skill`：

```
my-skill/
├── cct.yaml
├── claude/
│   ├── SKILL.md
│   └── agents/
│       ├── agent-a.md
│       └── agent-b.md
├── references/
│   ├── rules.md
│   └── template.md
├── workflows/
│   └── workflow.md
├── README.md
└── LICENSE
```
