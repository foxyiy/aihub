# AIHub

**跨 AI Agent 的统一代理层 — 统一数据管理，无缝切换 Agent，多机实时同步。**

---

## 项目概述

AIHub 是 AI 编程助手（Claude Code、CodeBuddy、Codex、Aider 等）的统一代理层。它解决多 Agent 并行使用时的核心痛点：

- **数据孤岛**：各 Agent 独立维护配置和上下文，无法互通
- **上下文断裂**：切换 Agent 时，之前积累的知识和决策丢失
- **重复配置**：编码规范需要在每个 Agent 各写一份（CLAUDE.md、.cursorrules、AGENTS.md...）
- **多机割裂**：本地和服务器的 Agent 无法共享数据

### 核心能力

| 能力 | 说明 |
|------|------|
| **统一数据管理** | 规则、记忆、上下文、会话历史集中存储于 AIHub Server，所有 Agent 共享 |
| **跨 Agent 记忆** | Agent A 产生的知识和决策，Agent B 自动获取 |
| **格式翻译** | 一份源数据自动翻译为各 Agent 的原生格式（CLAUDE.md、AGENTS.md、.cursorrules 等） |
| **多机同步** | 多台机器的 CLI 连接同一个 Server，数据实时互通 |
| **零侵入** | Agent 运行时完全接管终端，交互体验无损 |

## 系统架构

```
  本地机器                                远程服务器
  ┌───────────────────┐                  ┌───────────────────┐
  │  aihub CLI        │                  │  aihub CLI        │
  │  + Claude Code    │                  │  + CodeBuddy      │
  │  + CodeBuddy      │                  │  + Codex          │
  └─────────┬─────────┘                  └─────────┬─────────┘
            │              REST API                 │
            └──────────┐         ┌──────────────────┘
                       ▼         ▼
                 ┌─────────────────────┐
                 │    AIHub Server     │
                 │                     │
                 │  Rules · Memory     │
                 │  Context · Sessions │
                 │  MCP Configs        │
                 └─────────────────────┘
```

- **Server**：常驻后台进程，持有全部数据，提供 REST API
- **CLI**：无状态客户端，通过 API 与 Server 交互，调用底层 Agent

## 安装

```bash
git clone git@github.com:foxyiy/aihub.git
cd aihub
npm install
npm run build
npm link
```

## 使用方式

### 1. 启动 Server

```bash
# 前台运行
aihub server start -f

# 后台运行
aihub server start

# 检查状态
aihub server status
```

Server 默认监听 `0.0.0.0:8642`。

### 2. 注册项目

```bash
cd /path/to/your/project
aihub init
```

### 3. 管理数据

```bash
# 添加记忆
aihub memory add "项目使用 PostgreSQL 数据库" -t "db,architecture" --type decision
aihub memory add "auth 模块采用 middleware 模式" -t "auth" --type decision

# 查看记忆
aihub memory list
aihub memory search "auth"

# 查看项目状态
aihub status
```

### 4. 通过代理层使用 Agent

```bash
# 启动 Agent（自动注入规则、上下文和记忆）
aihub chat "重构 auth 模块" --agent codebuddy
aihub chat "编写单元测试" --agent claude-internal

# 切换 Agent 继续上一次任务
aihub chat --switch claude-internal
```

### 5. 导出为 Agent 原生格式

```bash
# 导出到所有支持的 Agent 格式
aihub export

# 指定 Agent
aihub export --agent claude

# 预览（不写入文件）
aihub export --dry-run
```

生成文件：`CLAUDE.md`、`AGENTS.md`、`.cursorrules`、`.windsurfrules`、`.github/copilot-instructions.md`

### 6. 多机同步

远程服务器启动 Server：

```bash
ssh your-server "cd ~/aihub && node dist/src/server/run.js 8642"
```

本地客户端指向远程 Server：

```bash
echo 'serverUrl: "http://your-server-ip:8642"' > ~/.aihub-client.yaml
```

配置完成后，所有 `aihub` 命令自动连接远端 Server。

## 命令参考

| 命令 | 说明 |
|------|------|
| `aihub server start [-f]` | 启动 Server（`-f` 前台运行） |
| `aihub server status` | 检查 Server 运行状态 |
| `aihub init` | 注册当前项目到 Server |
| `aihub status` | 显示项目状态总览 |
| `aihub chat [task] --agent <name>` | 通过代理层启动 Agent |
| `aihub chat --switch <name>` | 切换 Agent 继续上一次任务 |
| `aihub memory list` | 列出项目记忆 |
| `aihub memory search <query>` | 搜索记忆 |
| `aihub memory add <content> [-t tags] [--type type]` | 添加记忆 |
| `aihub memory delete <id>` | 删除记忆 |
| `aihub sessions list` | 列出会话历史 |
| `aihub sessions show <id>` | 查看会话详情 |
| `aihub export [--agent name] [--dry-run]` | 导出为 Agent 原生配置文件 |

## 支持的 Agent

| Agent | 命令 | 上下文注入方式 |
|-------|------|--------------|
| Claude Code | `claude` | `--append-system-prompt` |
| Claude Code Internal | `claude-internal` | `--append-system-prompt` |
| CodeBuddy | `codebuddy` | `--append-system-prompt` |
| OpenAI Codex | `codex` | AGENTS.md 文件注入 |
| Aider | `aider` | `--message` 参数注入 |

扩展支持新 Agent：在 `src/drivers/` 下新增 Driver 文件，实现 `detect`、`prepare`、`run`、`cleanup` 四个接口方法即可。

## 工作原理

```
aihub chat "task" --agent codebuddy

  1. 连接 Server，拉取项目的 rules、context、memory
  2. 通过翻译层转换为目标 Agent 可理解的格式
  3. 通过 --append-system-prompt 注入上下文（不修改任何项目文件）
  4. Agent 以 stdio: inherit 模式启动，完全接管终端
  5. Agent 退出后，通过 git diff 检测文件变更
  6. 变更信息自动存入 Server 作为记忆
  7. 会话记录归档
```

## 数据存储

Server 端数据目录 `~/.aihub-server/`：

```
~/.aihub-server/
├── db/aihub.db                  # SQLite（记忆、会话等结构化数据）
├── projects/
│   └── <project-name>/
│       ├── rules/*.md           # 编码规范（Markdown）
│       ├── context/*.md         # 项目上下文（Markdown）
│       └── mcp/servers.json     # MCP 工具配置
└── global/
    ├── rules/*.md               # 全局规则（所有项目生效）
    └── context/*.md             # 全局上下文
```

- 人工维护的数据（规则、上下文）使用 Markdown 格式
- 自动生成的数据（记忆、会话）使用 SQLite 存储
- 所有数据存储于用户自有服务器，不依赖任何第三方云服务

## 规划

### 近期

- [ ] Import 翻译层：从 Agent 原生格式自动导入到 AIHub
- [ ] Agent 日志解析：从 Claude/CodeBuddy 的会话日志中自动提取记忆
- [ ] MCP Server 模式：提供 MCP 接口，支持 Agent 运行时主动读写记忆
- [ ] API 鉴权：Server 端增加 Token 认证

### 中期

- [ ] 语义搜索：基于向量化实现记忆的语义匹配
- [ ] IDE Agent 支持：通过 MCP 协议接入 Cursor、Copilot 等 IDE 内置 Agent
- [ ] 团队协作：多用户共享 Server，协同管理项目知识
- [ ] Web 管理界面：浏览器端管理规则、记忆和会话

### 远期

- [ ] AIConfig 标准规范：推动 AI Agent 配置格式的行业标准化
- [ ] 配置模板市场：社区共享和复用项目配置
- [ ] 企业版：组织级配置继承、权限控制、审计日志

## 技术栈

| 组件 | 技术选型 |
|------|---------|
| Server | Fastify + SQLite (better-sqlite3, WAL mode) |
| CLI | Commander.js |
| 语言 | TypeScript (strict mode) |
| 构建 | tsc |
| 进程管理 | Node.js child_process (stdio: inherit) |
| 配置格式 | YAML (js-yaml) + Markdown (gray-matter) |

## License

MIT
