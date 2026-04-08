# AIHub 最终架构设计

---

## 一句话定义

**AIHub 是 AI 编程 Agent 的代理层 + 数据中心。用户通过 aihub 调用各种 Agent，所有数据统一存储、统一格式、多机实时同步。**

---

## 1. 系统全景

```
                         用户的各台机器
                              
  笔记本终端 1       笔记本终端 2       云服务器终端
  (项目 A)           (项目 B)           (项目 A)
       │                  │                  │
       ▼                  ▼                  ▼
  ┌─────────┐       ┌─────────┐       ┌─────────┐
  │ aihub   │       │ aihub   │       │ aihub   │
  │ CLI     │       │ CLI     │       │ CLI     │
  │(客户端) │       │(客户端) │       │(客户端) │
  └────┬────┘       └────┬────┘       └────┬────┘
       │                  │                  │
       │          HTTP / WebSocket           │
       └──────────┐       │       ┌──────────┘
                  ▼       ▼       ▼
            ┌───────────────────────────┐
            │                           │
            │      aihub server         │
            │      (数据中心)            │
            │                           │
            │  ~/.aihub-server/         │
            │  ├── projects/            │
            │  │   ├── hermes-gateway/  │
            │  │   ├── my-blog/         │
            │  │   └── ...              │
            │  ├── global/              │
            │  └── db/                  │
            │                           │
            │  REST API                 │
            │  :8642                    │
            └───────────────────────────┘
```

---

## 2. 两个进程，各司其职

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  aihub server (常驻后台)                                     │
│  ─────────────────────                                      │
│  职责: 存数据、提供 API、多客户端同步                         │
│  运行: 某台机器上，或 Docker                                  │
│  端口: 8642                                                  │
│                                                             │
│  API:                                                       │
│    GET    /projects                    列出项目              │
│    POST   /projects                    注册项目              │
│                                                             │
│    GET    /projects/:id/rules          获取规则              │
│    PUT    /projects/:id/rules/:file    更新规则              │
│                                                             │
│    GET    /projects/:id/context        获取上下文            │
│    PUT    /projects/:id/context/:file  更新上下文            │
│                                                             │
│    GET    /projects/:id/memory         列出记忆              │
│    GET    /projects/:id/memory/search?q=xxx  搜索记忆        │
│    POST   /projects/:id/memory         写入记忆              │
│    DELETE /projects/:id/memory/:id     删除记忆              │
│                                                             │
│    GET    /projects/:id/sessions       列出会话              │
│    POST   /projects/:id/sessions       创建会话              │
│    PUT    /projects/:id/sessions/:id   更新会话              │
│                                                             │
│    GET    /projects/:id/mcp            获取 MCP 配置         │
│    PUT    /projects/:id/mcp            更新 MCP 配置         │
│                                                             │
│    POST   /projects/:id/export/:agent  导出为 Agent 格式     │
│    POST   /projects/:id/import/:agent  从 Agent 格式导入     │
│                                                             │
│    GET    /global/rules                全局规则              │
│    GET    /global/memory               全局记忆              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  aihub CLI (按需运行)                                        │
│  ────────────────────                                       │
│  职责: 用户交互、调用 Agent、注入上下文                       │
│  运行: 用户哪台机器用就在哪台跑                               │
│  数据: 不持有数据，全部通过 API 读写 server                   │
│                                                             │
│  命令:                                                      │
│    aihub server start          启动 server (首次)           │
│    aihub server status         查看 server 状态             │
│                                                             │
│    aihub init                  注册当前项目到 server         │
│    aihub chat [task] [--agent] 代理层: 注入 → Agent → 回收  │
│    aihub status                状态总览                      │
│                                                             │
│    aihub memory list/search/add/delete                      │
│    aihub sessions list/show                                 │
│    aihub rules list/add/edit                                │
│                                                             │
│    aihub import <agent>        从 Agent 原生格式导入         │
│    aihub export [--agent xxx]  导出为 Agent 原生格式         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 数据模型 (Server 端存储)

```
~/.aihub-server/
│
├── db/
│   └── aihub.db                        SQLite 主数据库
│       ├── table: projects             项目注册表
│       ├── table: memories             所有项目的记忆
│       ├── table: sessions             所有会话记录
│       └── table: session_segments     会话段落
│
├── projects/
│   ├── hermes-gateway/
│   │   ├── rules/                      Markdown 文件
│   │   │   ├── coding.md
│   │   │   └── security.md
│   │   ├── context/                    Markdown 文件
│   │   │   ├── overview.md
│   │   │   └── decisions.md
│   │   └── mcp/
│   │       └── servers.json            MCP 配置
│   │
│   └── my-blog/
│       ├── rules/
│       ├── context/
│       └── mcp/
│
└── global/
    ├── rules/                          全局规则 (所有项目生效)
    │   └── preferences.md
    └── context/
        └── user-preferences.md         个人偏好
```

### 为什么这样分

```
Markdown 文件 (rules/, context/)
  → 人要读、要编辑
  → 文件系统存储最直观
  → server 通过文件 API 读写

SQLite 数据库 (memories, sessions)
  → 机器生成，高频变更
  → 需要搜索、过滤、分页
  → 结构化查询效率高
  → 并发安全 (SQLite WAL mode)
```

---

## 4. 数据库 Schema

```sql
-- 项目注册表
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,           -- "hermes-gateway"
  path        TEXT,                       -- "/Users/foxyi/code/hermes-gateway"
  description TEXT,
  created     TEXT NOT NULL               -- ISO datetime
);

-- 记忆
CREATE TABLE memories (
  id            TEXT PRIMARY KEY,          -- nanoid
  project_id    TEXT NOT NULL,             -- 关联项目 (或 "global")
  content       TEXT NOT NULL,
  type          TEXT NOT NULL,             -- decision | learned | warning | context
  tags          TEXT NOT NULL DEFAULT '[]',-- JSON array
  source_agent  TEXT NOT NULL,             -- claude | codex | manual
  source_session TEXT,                     -- session id
  created       TEXT NOT NULL,
  updated       TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 会话
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  task        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active', -- active | completed
  created     TEXT NOT NULL,
  ended       TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 会话段落
CREATE TABLE session_segments (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  agent         TEXT NOT NULL,              -- claude | codex | aider
  started       TEXT NOT NULL,
  ended         TEXT,
  git_changes   TEXT,                       -- JSON: {modified, created, deleted}
  handoff       TEXT,                       -- 交接信息
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

---

## 5. `aihub chat` 完整流程 (修正版)

```
$ aihub chat "重构 auth 模块" --agent claude

│
▼
┌────────────────────────────────────────────────────┐
│ 1. 连接 Server                                      │
│                                                    │
│ GET http://server:8642/health                      │
│ → 连不上? 报错: "先 aihub server start"             │
└──────────────┬─────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────┐
│ 2. 确认项目                                         │
│                                                    │
│ 用当前目录路径/名称查找项目                          │
│ GET /projects?path=/Users/foxyi/code/hermes        │
│ → 没找到? 自动注册: POST /projects                  │
└──────────────┬─────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────┐
│ 3. 从 Server 拉取数据                               │
│                                                    │
│ GET /projects/hermes/rules          → rules        │
│ GET /projects/hermes/context        → context      │
│ GET /projects/hermes/memory/search?q=auth → memory │
│ GET /global/rules                   → global rules │
│                                                    │
│ 全部通过 API 获取，本地不持有任何数据                │
└──────────────┬─────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────┐
│ 4. 翻译 + 注入                                      │
│                                                    │
│ Export Translator (Claude):                        │
│   global rules + project rules                     │
│     + context + recent memory                      │
│     → 组装为 CLAUDE.md 格式                         │
│     → 写入项目目录的 CLAUDE.md                      │
│                                                    │
│ MCP:                                               │
│   GET /projects/hermes/mcp                         │
│   → 过滤 scope: "claude"                           │
│   → 写入 .claude/mcp.json                          │
└──────────────┬─────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────┐
│ 5. 记录 Git 快照                                    │
│                                                    │
│ git diff --name-only HEAD                          │
│ git status --porcelain                             │
│ → 保存为 before_snapshot                            │
└──────────────┬─────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────┐
│ 6. 在 Server 创建会话                               │
│                                                    │
│ POST /projects/hermes/sessions                     │
│   { task: "重构 auth", agent: "claude" }           │
│ → session_id                                       │
└──────────────┬─────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────┐
│ 7. 启动 Agent (stdio: inherit)                     │
│                                                    │
│ ┌────────────────────────────────────────────────┐ │
│ │                                                │ │
│ │   Claude Code 完整 TUI                         │ │
│ │   用户正常交互                                  │ │
│ │   聊多久聊多久                                  │ │
│ │                                                │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ Agent 退出                                         │
└──────────────┬─────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────┐
│ 8. 回收阶段                                        │
│                                                    │
│ a) 清理注入文件                                     │
│    恢复 CLAUDE.md (从备份)                          │
│    恢复 .claude/mcp.json (从备份)                   │
│                                                    │
│ b) 计算文件变更                                     │
│    git diff (对比 step 5 快照)                     │
│    → { modified: [...], created: [...] }           │
│                                                    │
│ c) 解析 Agent 日志 (尽力而为)                       │
│    读取 ~/.claude/projects/*/sessions/ 最新文件    │
│    提取决策、学到的知识                              │
│                                                    │
│ d) 写入 Server                                     │
│    POST /projects/hermes/memory  (提取的记忆)      │
│    PUT /projects/hermes/sessions/:id (更新会话)    │
│    → 包含 git_changes + segment 信息               │
└──────────────┬─────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────┐
│ 9. 下一步                                           │
│                                                    │
│ Session paused. (was: claude)                      │
│   /switch <agent>  → 回到 Step 3 (重新拉取+翻译)  │
│   /done            → 继续往下                       │
└──────────────┬─────────────────────────────────────┘
               │ /done
               ▼
┌────────────────────────────────────────────────────┐
│ 10. 结束                                            │
│                                                    │
│ PUT /projects/hermes/sessions/:id                  │
│   { status: "completed" }                          │
│                                                    │
│ ✅ Session archived. 5 memories saved.              │
└────────────────────────────────────────────────────┘
```

---

## 6. Agent 切换 (热切换) 流程

```
Agent 退出 → 用户选择 /switch codex

┌────────────────────────────────────────────┐
│ 1. 回收上一段                               │
│                                            │
│ git diff → 文件变更                         │
│ Agent 日志 → 提取记忆和摘要                  │
│ POST /memory (保存记忆)                     │
│ PUT /sessions/:id (更新 segment)            │
│   git_changes: { modified: [...] }         │
│   handoff: "改了 auth.ts, 选了 Result 模式" │
└──────────────┬─────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────┐
│ 2. 重新从 Server 拉取                       │
│                                            │
│ GET /rules    → 规则 (不变)                 │
│ GET /context  → 上下文 (不变)               │
│ GET /memory   → 记忆 (多了刚刚提取的几条!)  │
│ GET /sessions/:id → 拿到 handoff 信息       │
│                                            │
│ 新 Agent 自动获得上一段的成果               │
│ 因为记忆已经写入 Server 了                   │
└──────────────┬─────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────┐
│ 3. 翻译为新 Agent 格式 + 注入               │
│                                            │
│ Export Translator (Codex):                 │
│   rules + context + memory + handoff       │
│   → AGENTS.md                              │
│                                            │
│ 启动 Codex (stdio: inherit)                │
└────────────────────────────────────────────┘

关键: 切换不需要特殊的"交接"机制
     因为上一段的记忆已经在 Server 里了
     新 Agent 拉取时自然就拿到了
```

---

## 7. 翻译层 (Import / Export)

```
          Import (外部 → Server)                Export (Server → 外部)

  CLAUDE.md ─┐                              ┌─▶ CLAUDE.md
  .claude/   │  ┌────────────┐              │   .claude/mcp.json
  mcp.json ──┤  │  Import    │  ┌────────┐  │   .claude/commands/
  .claude/   │  │  Translator│  │        │  │
  commands/ ─┘  │            │  │ Server │  │
                │  解析      │─▶│  API   │──┤
  .cursorrules─┐│  分类      │  │        │  │
  .cursor/   ──┤│  存储      │  │ 统一   │  │  ┌────────────┐
  mcp.json   ──┤│            │  │ 源格式 │──┤  │  Export     │
               │└────────────┘  │        │  │  │  Translator │
  AGENTS.md ───┘                └────────┘  │  │            │
                                            │  │  组装      │
                                            └─▶│  格式化    │
                                               │  写文件    │
                                               └────────────┘
                                                    │
                                               ┌────┼────┐
                                               ▼    ▼    ▼
                                          .cursor  AGENTS .windsurf
                                          rules    .md    rules

  每个 Agent 有一对 Import/Export Translator
  数据在 Server 里只有一份，是 AIHub 的源格式
```

### 翻译对照表

```
┌──────────────────┬─────────────┬──────────────┬───────────┬──────────────┐
│ AIHub 源数据      │ Claude      │ Cursor       │ Codex     │ Copilot      │
├──────────────────┼─────────────┼──────────────┼───────────┼──────────────┤
│ rules/*.md       │ CLAUDE.md   │ .cursorrules │ AGENTS.md │ copilot-     │
│                  │ (拼接)      │ 或 .cursor/  │ (拼接)    │ instructions │
│                  │             │ rules/*.mdc  │           │ .md          │
├──────────────────┼─────────────┼──────────────┼───────────┼──────────────┤
│ context/*.md     │ CLAUDE.md   │ .cursorrules │ AGENTS.md │ 同上         │
│                  │ (追加)      │ (追加)       │ (追加)    │ (追加)       │
├──────────────────┼─────────────┼──────────────┼───────────┼──────────────┤
│ memory           │ CLAUDE.md   │ .cursorrules │ AGENTS.md │ 不支持       │
│ (最近 N 条)      │ (追加)      │ (追加)       │ (追加)    │              │
├──────────────────┼─────────────┼──────────────┼───────────┼──────────────┤
│ mcp/servers.json │ .claude/    │ .cursor/     │ 不支持    │ .vscode/     │
│                  │ mcp.json    │ mcp.json     │           │ settings     │
├──────────────────┼─────────────┼──────────────┼───────────┼──────────────┤
│ workflows/*.md   │ .claude/    │ .cursor/     │ 不支持    │ 不支持       │
│                  │ commands/   │ prompts/     │           │              │
└──────────────────┴─────────────┴──────────────┴───────────┴──────────────┘
```

---

## 8. 记忆采集流程

```
Agent 退出后，三个数据来源:

来源 1: git diff (100% 可靠)
───────────────────────────
  对比 Agent 启动前的快照
  得到: 修改/新增/删除了哪些文件
  → POST /memory
    "Files modified: auth.ts (+45-12), errors.ts (new)"

来源 2: Agent 日志解析 (尽力而为)
────────────────────────────────
  Claude: ~/.claude/projects/<hash>/sessions/
  读最新的 session JSON，解析 messages
  提取: 决策、发现的问题、学到的知识
  → POST /memory (多条)
  失败也不报错，跳过

来源 3: MCP Server (未来)
─────────────────────────
  Agent 运行时主动调用 remember()
  实时写入 Server
  需要: aihub 同时启动一个 MCP Server
  → 后续版本实现
```

---

## 9. 并发控制

```
场景 1: 同项目同机器多会话
─────────────────────────
  CLI 层面: PID-based lockfile (项目维度)
  第二个会话启动时检测到 lock → 提示等待或退出

场景 2: 同项目多机器
────────────────────
  Server 端处理: sessions 表加 status 字段
  POST /sessions 时检查有无 active session
  有 → 返回警告 (但不阻止，不同机器可能改不同文件)

场景 3: 多项目
──────────────
  完全不冲突，各项目独立
```

---

## 10. 项目结构 (代码)

```
aihub/
├── package.json
├── tsconfig.json
│
├── bin/
│   └── aihub.ts                    CLI 入口
│
├── src/
│   ├── server/                     ═══ Server 端 ═══
│   │   ├── index.ts                HTTP server (Express/Fastify)
│   │   ├── routes/
│   │   │   ├── projects.ts         /projects API
│   │   │   ├── rules.ts            /rules API
│   │   │   ├── context.ts          /context API
│   │   │   ├── memory.ts           /memory API
│   │   │   ├── sessions.ts         /sessions API
│   │   │   └── mcp.ts              /mcp API
│   │   ├── db.ts                   SQLite 初始化 + 查询
│   │   └── store.ts                文件存储 (rules/context markdown)
│   │
│   ├── client/                     ═══ Client SDK ═══
│   │   └── api.ts                  封装 HTTP 调用 Server API
│   │
│   ├── translators/                ═══ 翻译层 ═══
│   │   ├── types.ts                统一数据类型
│   │   ├── import/
│   │   │   ├── base.ts             ImportTranslator 接口
│   │   │   ├── claude.ts           CLAUDE.md → AIHub
│   │   │   ├── cursor.ts           .cursorrules → AIHub
│   │   │   └── codex.ts            AGENTS.md → AIHub
│   │   └── export/
│   │       ├── base.ts             ExportTranslator 接口
│   │       ├── claude.ts           AIHub → CLAUDE.md
│   │       ├── cursor.ts           AIHub → .cursorrules
│   │       ├── codex.ts            AIHub → AGENTS.md
│   │       ├── copilot.ts          AIHub → copilot-instructions
│   │       └── windsurf.ts         AIHub → .windsurfrules
│   │
│   ├── drivers/                    ═══ Agent 驱动 ═══
│   │   ├── base.ts                 AgentDriver 接口
│   │   ├── claude.ts               Claude Code 驱动
│   │   ├── codex.ts                Codex 驱动
│   │   ├── aider.ts                Aider 驱动
│   │   └── registry.ts             驱动注册中心
│   │
│   ├── core/                       ═══ 核心逻辑 ═══
│   │   ├── context-builder.ts      上下文组装 (调 API + 翻译)
│   │   ├── git-changes.ts          git diff 检测
│   │   ├── agent-log-parser.ts     Agent 日志解析
│   │   ├── handoff.ts              交接信息生成
│   │   └── lockfile.ts             会话锁
│   │
│   ├── commands/                   ═══ CLI 命令 ═══
│   │   ├── server.ts               aihub server start/stop/status
│   │   ├── chat.ts                 aihub chat (核心)
│   │   ├── init.ts                 aihub init
│   │   ├── memory.ts               aihub memory list/search/add
│   │   ├── sessions.ts             aihub sessions list/show
│   │   ├── status.ts               aihub status
│   │   ├── import.ts               aihub import <agent>
│   │   └── export.ts               aihub export [--agent]
│   │
│   └── utils/
│       ├── config.ts               客户端配置 (server URL 等)
│       └── logger.ts               终端输出
│
└── tests/
```

---

## 11. 技术栈

```
Server:
  HTTP 框架    Fastify (轻量、快)
  数据库       SQLite (better-sqlite3, WAL mode)
  文件存储     本地文件系统 (rules/context markdown)

Client (CLI):
  CLI 框架     Commander.js
  HTTP 客户端  内置 fetch (Node 20+)
  进程管理     child_process (spawn, inherit)
  Git          simple-git
  终端         chalk + ora

共享:
  语言         TypeScript (strict)
  构建         tsc
  ID 生成      nanoid
  配置         js-yaml
  Markdown     gray-matter
```

---

## 12. 实施阶段

```
Phase 1: Server + 基础 API
  → server 启动
  → projects/rules/context/memory CRUD API
  → SQLite 存储

Phase 2: CLI 对接 Server
  → aihub init (注册项目)
  → aihub memory/status (通过 API)
  → aihub server start/stop

Phase 3: Export 翻译层
  → AIHub → CLAUDE.md / AGENTS.md / .cursorrules
  → aihub export 命令

Phase 4: aihub chat (代理层核心)
  → 从 Server 拉数据 → 翻译注入 → Agent → 回收 → 写回 Server

Phase 5: Import 翻译层 + 记忆采集
  → Agent 原生格式 → AIHub
  → git diff + Agent 日志解析

Phase 6: 完善
  → 并发控制 (lockfile)
  → MCP 配置管理
  → 热切换优化
```
