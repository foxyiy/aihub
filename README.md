# AIHub

**AI 编程 Agent 的统一代理层 — 一份数据，所有 Agent，到处运行。**

---

## 这是什么

你用 Claude Code 写了半天代码，积累了一堆上下文和决策记录。现在想切到 CodeBuddy 继续——但 CodeBuddy 什么都不知道。

AIHub 解决这个问题。它是一个代理层，坐在你和所有 AI Agent 之间：

```
你 → AIHub → Claude Code / CodeBuddy / Codex / Aider / ...
        │
        └── 统一存储：规则、记忆、上下文、会话历史
```

- **一份数据**：所有 Agent 共享同一套规则、记忆和项目上下文
- **无缝切换**：Claude 积累的知识，CodeBuddy 直接就知道
- **零侵入**：Agent 的交互体验完全不变，颜色、快捷键、TUI 全部正常
- **多机互通**：本地和服务器连同一个 AIHub Server，数据实时共享

## 架构

```
笔记本                             云服务器
┌────────────────┐                ┌────────────────┐
│ aihub CLI      │                │ aihub CLI      │
│ + Claude Code  │                │ + CodeBuddy    │
│ + CodeBuddy    │                │ + Codex        │
└───────┬────────┘                └───────┬────────┘
        │            HTTP API             │
        └───────────┐    ┌────────────────┘
                    ▼    ▼
              ┌──────────────┐
              │ AIHub Server │
              │              │
              │ 规则 · 记忆   │
              │ 上下文 · 会话 │
              └──────────────┘
```

**Server** 持有所有数据，**CLI** 是无状态客户端。数据全在你自己的机器上，不上传任何外部服务。

## 快速开始

### 安装

```bash
git clone git@github.com:foxyiy/aihub.git
cd aihub
npm install
npm run build
npm link
```

### 启动 Server

```bash
# 前台运行（开发/测试）
aihub server start -f

# 后台运行
aihub server start
```

Server 默认跑在 `http://0.0.0.0:8642`。

### 注册项目

```bash
cd /path/to/your/project
aihub init
```

### 添加记忆

```bash
aihub memory add "数据库选了 PostgreSQL，因为需要 JSONB" -t "db,architecture" --type decision
aihub memory add "auth 模块使用 middleware 模式" -t "auth" --type decision
aihub memory add "不要修改 legacy/ 目录的代码" --type warning
```

### 使用 Agent

```bash
# 通过 AIHub 启动 Agent（自动注入上下文和记忆）
aihub chat "重构 auth 模块" --agent codebuddy
aihub chat "写测试" --agent claude-internal

# Agent 退出后，文件变更自动记录为记忆
# 想换个 Agent 继续上次的工作：
aihub chat --switch claude-internal
```

### 查看状态

```bash
aihub status

  AIHub — my-project
  ─────────────────────────────────
  📋 Rules:     2 files
  📝 Context:   1 files
  🧠 Memories:  12 entries
  💬 Sessions:  5 recent
  🤖 Agents:    Claude Code Internal, CodeBuddy
  🖥  Server:    running
```

### 导出到 Agent 原生格式

```bash
# 从 AIHub 数据生成所有 Agent 的配置文件
aihub export

# 生成：CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules, copilot-instructions.md

# 只生成某个 Agent 的
aihub export --agent claude

# 预览不写入
aihub export --dry-run
```

## 多机使用

在你的服务器上启动 Server：

```bash
ssh your-server "cd ~/aihub && node dist/src/server/run.js 8642"
```

本地配置连接远程 Server：

```bash
echo 'serverUrl: "http://your-server-ip:8642"' > ~/.aihub-client.yaml
```

之后所有 `aihub` 命令自动连远端，本地和服务器共享同一份数据。

## 全部命令

```bash
aihub server start [-f]          # 启动 Server（-f 前台）
aihub server status              # 检查 Server 状态

aihub init                       # 注册当前项目
aihub status                     # 状态总览

aihub chat [task] --agent <name> # 代理层启动 Agent
aihub chat --switch <name>       # 换 Agent 继续上次工作

aihub memory list                # 列出记忆
aihub memory search <query>      # 搜索记忆
aihub memory add <content>       # 添加记忆
aihub memory delete <id>         # 删除记忆

aihub sessions list              # 列出会话历史
aihub sessions show <id>         # 查看会话详情

aihub export [--agent <name>]    # 导出为 Agent 原生格式
```

## 支持的 Agent

| Agent | CLI 命令 | 上下文注入方式 |
|-------|---------|--------------|
| Claude Code | `claude` | `--append-system-prompt` |
| Claude Code Internal | `claude-internal` | `--append-system-prompt` |
| CodeBuddy | `codebuddy` | `--append-system-prompt` |
| OpenAI Codex | `codex` | 写入 AGENTS.md |
| Aider | `aider` | `--message` |

添加新 Agent 只需在 `src/drivers/` 下新增一个文件，实现 `detect/prepare/run/cleanup` 四个方法。

## 工作原理

```
aihub chat "重构 auth" --agent codebuddy

  1. 连接 Server，拉取 rules + context + memory
  2. 翻译为 Agent 能理解的格式
  3. 通过 --append-system-prompt 注入上下文
  4. stdio: inherit — Agent 完全接管终端
  5. Agent 退出后，git diff 检测文件变更
  6. 变更信息存入 Server 作为记忆
  7. 会话归档
```

**关键设计：** Agent 运行时 AIHub 完全不干预。Agent 拿到真实终端，体验跟直接使用一样。AIHub 只在启动前（注入上下文）和退出后（回收数据）做事。

## 数据存储

所有数据在 Server 端的 `~/.aihub-server/`：

```
~/.aihub-server/
├── db/aihub.db              # SQLite — 记忆、会话
├── projects/
│   └── my-project/
│       ├── rules/*.md       # 编码规范（Markdown）
│       ├── context/*.md     # 项目知识（Markdown）
│       └── mcp/servers.json # MCP 工具配置
└── global/
    ├── rules/               # 全局规则
    └── context/             # 全局上下文
```

- 人写的（规则、上下文）用 **Markdown** — 可读性优先
- 机器生成的（记忆、会话）用 **SQLite** — 查询效率优先
- 项目代码仓库里**不留任何 AIHub 数据**

## 未来规划

### 近期

- [ ] **Import 翻译层** — 从 Agent 原生格式（CLAUDE.md, .cursorrules）自动导入到 AIHub
- [ ] **Agent 日志解析** — Agent 退出后自动从 Claude/CodeBuddy 的会话日志提取记忆
- [ ] **MCP Server 模式** — 提供 MCP Server，Agent 运行时可主动调用 `remember()`/`recall()`
- [ ] **Token 鉴权** — Server API 加认证，安全暴露到公网

### 中期

- [ ] **语义搜索** — 记忆向量化，recall 从关键词匹配升级为语义匹配
- [ ] **IDE Agent 支持** — 通过 MCP 接入 Cursor、Copilot 等 IDE 内置 Agent
- [ ] **团队共享** — 多人连同一个 Server，共享项目规则和记忆
- [ ] **Web Dashboard** — 浏览器管理记忆、规则、会话历史

### 远期

- [ ] **AIConfig Spec** — 推动 `.aiconfig/` 成为 AI Agent 配置的行业标准
- [ ] **配置市场** — 社区分享和复用项目配置模板
- [ ] **企业版** — 组织级配置继承、RBAC 权限控制、审计日志

## 技术栈

| 组件 | 技术 |
|------|------|
| Server | Fastify + SQLite (better-sqlite3) |
| CLI | Commander.js |
| 语言 | TypeScript (strict mode) |
| 进程管理 | Node.js child_process (stdio: inherit) |
| 配置 | YAML (js-yaml) + Markdown (gray-matter) |

## License

MIT
