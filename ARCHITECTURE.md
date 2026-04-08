# AIHub 系统架构与流程

## 1. 系统全景架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                            用户                                          │
│                                                                         │
│   本地终端 1          本地终端 2          远程服务器终端                    │
│   (项目 A)            (项目 B)            (项目 A)                       │
│                                                                         │
└─────┬──────────────────┬──────────────────┬─────────────────────────────┘
      │                  │                  │
      ▼                  ▼                  ▼
┌─────────────┐  ┌─────────────┐   ┌─────────────┐
│  aihub CLI  │  │  aihub CLI  │   │  aihub CLI  │
│  (实例 1)   │  │  (实例 2)   │   │  (实例 3)   │
└──────┬──────┘  └──────┬──────┘   └──────┬──────┘
       │                │                 │
       ▼                ▼                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                         AIHub Core Engine                                 │
│                                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────────────┐  │
│  │ Context    │  │ Memory     │  │ Session    │  │ Handoff           │  │
│  │ Builder    │  │ Engine     │  │ Manager    │  │ Generator         │  │
│  │            │  │            │  │            │  │                   │  │
│  │ 组装注入   │  │ SQLite     │  │ JSON 文件  │  │ git diff          │  │
│  │ 上下文     │  │ 读写记忆   │  │ 会话跟踪   │  │ + Agent 日志解析  │  │
│  └────────────┘  └────────────┘  └────────────┘  └───────────────────┘  │
│                                                                          │
│  ┌────────────┐  ┌────────────────────────────────────────────────────┐  │
│  │ Projector  │  │ Agent Driver Layer                                 │  │
│  │            │  │                                                    │  │
│  │ 投影生成:  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │  │
│  │ .aihub/    │  │  │ Claude   │  │ Codex    │  │ Aider    │ ...    │  │
│  │  → 各Agent │  │  │ Driver   │  │ Driver   │  │ Driver   │        │  │
│  │    原生文件 │  │  └──────────┘  └──────────┘  └──────────┘        │  │
│  └────────────┘  └────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                           数据层                                          │
│                                                                          │
│  项目级 .aihub/ ─────────────────────────  全局 ~/.aihub/                 │
│  ┌────────────────────────────────┐       ┌────────────────────────┐     │
│  │ config.yaml    项目配置        │       │ config.yaml  全局配置  │     │
│  │ rules/         编码规范 [人写]  │       │ rules/       全局规则  │     │
│  │ context/       项目知识 [人写]  │       │ memory/      跨项目记忆│     │
│  │ memory/        项目记忆 [自动]  │       └────────────────────────┘     │
│  │   memories.db  SQLite           │                                     │
│  │ sessions/      会话历史 [自动]  │                                     │
│  │   *.json                        │                                     │
│  │ .state/        内部状态         │                                     │
│  │   chat.lock    会话锁           │                                     │
│  │   last-git-snapshot.json        │                                     │
│  └────────────────────────────────┘                                     │
│                                                                          │
│  同步层                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  本地 .aihub/ ◀═══ Git / Server / Cloud ═══▶ 远端 .aihub/       │    │
│  │                                                                  │    │
│  │  同步内容: rules/, context/, memory/, sessions/                  │    │
│  │  不同步:   .state/ (本机专有)                                    │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  投影文件 (自动生成，不是数据源)                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  CLAUDE.md  │  AGENTS.md  │  .cursorrules  │  .windsurfrules    │    │
│  │  (Claude)   │  (Codex)    │  (Cursor)      │  (Windsurf)       │    │
│  │             │             │  copilot-instructions.md (Copilot)  │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心数据流向

```
数据只有一份，在 .aihub/。其他一切都是它的"投影"或"消费者"。

                    ┌─────────────────────┐
                    │                     │
     ┌──── 人写 ──▶│    .aihub/          │◀── 自动写入 ────┐
     │              │                     │                 │
     │              │  rules/    [人写]   │                 │
     │              │  context/  [人写]   │                 │
     │              │  memory/   [自动]   │                 │
     │              │  sessions/ [自动]   │                 │
     │              │                     │                 │
     │              └──────────┬──────────┘                 │
     │                         │                            │
     │              ┌──────────┼──────────┐                 │
     │              │          │          │                 │
     │              ▼          ▼          ▼                 │
     │         ┌─────────┐ ┌─────┐ ┌──────────┐           │
     │         │投影文件  │ │注入 │ │ 远端同步  │           │
     │         │生成      │ │Agent│ │          │           │
     │         │         │ │上下文│ │ Git/     │           │
     │         │CLAUDE.md│ │     │ │ Server   │           │
     │         │AGENTS.md│ │     │ │          │           │
     │         │.cursor  │ │     │ │          │           │
     │         │rules    │ │     │ │          │           │
     │         └─────────┘ └──┬──┘ └──────────┘           │
     │                        │                            │
     │                        ▼                            │
     │              ┌──────────────────┐                   │
     │              │   Agent 运行     │                   │
     │              │   (Claude/Codex) │                   │
     │              │   stdio:inherit  │                   │
     │              └────────┬─────────┘                   │
     │                       │                             │
     │                       ▼                             │
     │              ┌──────────────────┐                   │
     │              │   Agent 退出     │                   │
     │              └────────┬─────────┘                   │
     │                       │                             │
     │            ┌──────────┼──────────┐                  │
     │            ▼          ▼          ▼                  │
     │     ┌──────────┐ ┌────────┐ ┌──────────┐           │
     │     │ git diff │ │ Agent  │ │ 用户输入 │           │
     │     │ 文件变更 │ │ 日志   │ │ (可选)   │           │
     │     └─────┬────┘ └───┬────┘ └────┬─────┘           │
     │           │          │           │                  │
     │           └──────────┼───────────┘                  │
     │                      ▼                              │
     │           ┌───────────────────┐                     │
     │           │  Handoff Generator│                     │
     │           │  + Memory Extract │────────────────────┘
     │           └───────────────────┘
     │               记忆写入 .aihub/memory/
     │               会话写入 .aihub/sessions/
     │
     └── 用户修改规则/上下文 → 循环继续
```

---

## 3. `aihub chat` 完整流程

```
$ aihub chat "重构 auth 模块" --agent claude


│ START
▼
┌──────────────────────────────────┐
│ 1. 检查环境                       │
│                                  │
│ .aihub/ 存在?                    │──── No ──▶ 报错: 先 aihub init
│ chat.lock 被占?                  │──── Yes ─▶ 报错: 已有活跃会话
│ claude CLI 已安装?               │──── No ──▶ 报错: Agent 未安装
└────────────┬─────────────────────┘
             │ All OK
             ▼
┌──────────────────────────────────┐
│ 2. 创建会话 + 锁定               │
│                                  │
│ 写入 chat.lock (PID + agent)     │
│ 创建 Session 对象                │
│ 记录 git snapshot (当前状态)     │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 3. 组装上下文                     │
│                                  │
│ 读取 .aihub/rules/*.md           │
│ 读取 .aihub/context/*.md         │
│ 搜索相关 memory (按 task 匹配)   │
│ 如果是切换: 追加 handoff 信息     │
│                                  │
│ 拼接为一个字符串                  │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 4. 注入上下文                     │
│                                  │
│ 备份原 CLAUDE.md (如果存在)       │
│ 写入新 CLAUDE.md:                │
│   [rules]                        │
│   [context]                      │
│   [memories]                     │
│   [handoff] (如果有)             │
│   ---                            │
│   [原始 CLAUDE.md] (如果有)      │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 5. 启动 Agent                    │
│                                  │
│ spawn("claude", args, {          │
│   stdio: "inherit"     ◀── 关键  │
│ })                               │
│                                  │
│ Agent 拥有终端                    │
│ 用户直接跟 Agent 交互             │
│ aihub 进程等待                    │
│                                  │
│ ┌──────────────────────────────┐ │
│ │                              │ │
│ │     Claude Code TUI          │ │
│ │     完整交互体验              │ │
│ │     颜色/快捷键/一切正常      │ │
│ │                              │ │
│ │     用户聊多久聊多久          │ │
│ │     用户自己退出 (/exit)      │ │
│ │                              │ │
│ └──────────────────────────────┘ │
│                                  │
│ Agent 进程退出                    │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 6. 回收阶段                      │
│                                  │
│ a) 恢复 CLAUDE.md (从备份)       │
│                                  │
│ b) 计算文件变更:                  │
│    git diff (对比 step 2 快照)   │
│    → modified: [auth.ts, ...]    │
│    → created:  [errors.ts]       │
│    → deleted:  []                │
│                                  │
│ c) 解析 Agent 日志 (尽力而为):   │
│    读取 Claude session 文件      │
│    提取: 决策、学到的知识、警告   │
│                                  │
│ d) 写入记忆:                     │
│    memory.add("选择 Result 模式") │
│    memory.add("改了 auth.ts...")  │
│                                  │
│ e) 更新 Session:                 │
│    记录当前 segment 结束         │
│    保存文件变更列表               │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 7. 下一步?                       │
│                                  │
│ Session paused. (was: claude)    │
│   /switch <agent>                │
│   /done                          │
│                                  │
│ ┌──────────────┐  ┌───────────┐ │
│ │ /switch codex│  │   /done   │ │
│ └──────┬───────┘  └─────┬─────┘ │
│        │                │       │
│        ▼                ▼       │
│   回到 Step 3       继续往下    │
│   (新 Agent)                    │
└────────────┬─────────────────────┘
             │ /done
             ▼
┌──────────────────────────────────┐
│ 8. 结束                          │
│                                  │
│ 标记 Session 为 completed        │
│ 删除 chat.lock                   │
│ 输出统计:                         │
│   "Session abc archived"         │
│   "5 memories extracted"         │
│                                  │
│ END                              │
└──────────────────────────────────┘
```

---

## 4. Agent 切换 (热切换) 流程

```
                              /switch codex
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │  生成 Handoff                  │
                    │                              │
                    │  数据来源 1: git diff         │
                    │  "modified: auth.ts (+45-12) │
                    │   created: errors.ts"        │
                    │                              │
                    │  数据来源 2: Agent 日志       │
                    │  "决定用 Result<T,E> 模式    │
                    │   middleware 统一错误处理"    │
                    │                              │
                    │  数据来源 3: 用户补充 (可选)  │
                    │  "回车跳过或输入补充信息"     │
                    │                              │
                    │  → 组装 handoff 文本          │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │  重建上下文                    │
                    │                              │
                    │  rules (不变)                 │
                    │  + context (不变)             │
                    │  + memory (可能多了几条)      │
                    │  + handoff (新增)             │
                    │                              │
                    │  注入 AGENTS.md               │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │  启动 Codex                   │
                    │  stdio: "inherit"             │
                    │                              │
                    │  Codex 读到 AGENTS.md:        │
                    │  "=== PROJECT RULES ===       │
                    │   ...                        │
                    │   === HANDOFF ===             │
                    │   上一个 Agent (Claude) 做了: │
                    │   改了 auth.ts, errors.ts     │
                    │   选择了 Result 模式          │
                    │   ..."                        │
                    │                              │
                    │  Codex 基于这些信息继续工作   │
                    └──────────────────────────────┘
```

---

## 5. 记忆采集流程

```
Agent 退出
    │
    ▼
┌────────────────────────────────────────────────┐
│              记忆采集 Pipeline                   │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ 来源 1: git diff (100% 可靠)             │  │
│  │                                          │  │
│  │ git diff --stat                          │  │
│  │ → auth.ts      | 45 ++++---              │  │
│  │ → middleware.ts |  8 ++-                  │  │
│  │ → errors.ts    | 32 ++++++ (new)         │  │
│  │                                          │  │
│  │ 生成记忆:                                │  │
│  │ "Files modified by claude: auth.ts       │  │
│  │  (+45-12), middleware.ts (+8-3).         │  │
│  │  New file: errors.ts"                    │  │
│  │                                          │  │
│  │ type: "learned", tags: ["files"]         │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ 来源 2: Agent 日志解析 (尽力而为)        │  │
│  │                                          │  │
│  │ Claude:                                  │  │
│  │   ~/.claude/projects/<hash>/sessions/    │  │
│  │   最近的 session JSON                    │  │
│  │   解析 messages 数组                     │  │
│  │   提取 assistant 消息中的关键内容        │  │
│  │                                          │  │
│  │ Codex:                                   │  │
│  │   ~/.codex/sessions/ (待确认路径)        │  │
│  │                                          │  │
│  │ 生成记忆:                                │  │
│  │ "Decided to use Result<T,E> pattern"     │  │
│  │ type: "decision", tags: ["auth"]         │  │
│  │                                          │  │
│  │ 如果解析失败 → 跳过, 不报错              │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ 来源 3: MCP remember() (未来)            │  │
│  │                                          │  │
│  │ Agent 运行时主动调用:                    │  │
│  │ remember("选择 PG 因为需要 JSONB")       │  │
│  │                                          │  │
│  │ 实时写入 memory.db                       │  │
│  │ (需要先实现 MCP Server)                  │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  所有来源的记忆 → 去重 → 写入 memory.db       │
│                                                │
└────────────────────────────────────────────────┘
```

---

## 6. 多机同步流程

```
本地笔记本                              云服务器
┌──────────────────┐                   ┌──────────────────┐
│                  │                   │                  │
│ project/.aihub/  │                   │ project/.aihub/  │
│ ├── rules/       │                   │ ├── rules/       │
│ ├── context/     │                   │ ├── context/     │
│ ├── memory/      │                   │ ├── memory/      │
│ └── sessions/    │                   │ └── sessions/    │
│                  │                   │                  │
│  aihub sync push │                   │  aihub sync pull │
│        │         │                   │        ▲         │
└────────┼─────────┘                   └────────┼─────────┘
         │                                      │
         ▼                                      │
┌──────────────────────────────────────────────────────────┐
│                      同步通道                             │
│                                                          │
│  方式 A: Git                                             │
│  .aihub/ 本身是个 git repo                               │
│  push/pull 就是 git push/pull                            │
│                                                          │
│  方式 B: rsync / scp                                     │
│  直接文件同步                                             │
│                                                          │
│  方式 C: 自建 Server (WebSocket)                         │
│  实时双向同步                                             │
│                                                          │
│  方式 D: 云服务 (我们托管)                                │
│  零运维                                                  │
│                                                          │
│  同步内容:                                               │
│    ✅ rules/     (编码规范)                               │
│    ✅ context/   (项目知识)                               │
│    ✅ memory/    (记忆 — 需要 SQLite merge 或 JSON 导出) │
│    ✅ sessions/  (会话历史)                               │
│    ❌ .state/    (不同步 — 本机专有)                      │
│                                                          │
│  SQLite 同步难点:                                        │
│    SQLite 是二进制文件, git 无法 merge                    │
│    解法: 导出为 JSON → 同步 → 导入                       │
│    或: memory/ 直接用 JSON 文件而非 SQLite                │
│                                                          │
└──────────────────────────────────────────────────────────┘

同步后触发:
  aihub sync pull
    → .aihub/ 更新了
    → 重新生成投影文件 (CLAUDE.md 等)
    → 下次 Agent 启动时读到最新数据
```

---

## 7. 并发控制

```
同一项目多会话问题:

┌─────────────────────────────────────────────────────┐
│                                                     │
│  终端 1: aihub chat --agent claude                  │
│                                                     │
│    ① 检查 .aihub/.state/chat.lock                  │
│    ② 不存在 → 创建 lock:                            │
│       { pid: 1234, agent: "claude",                 │
│         started: "2026-04-08T10:00:00Z" }           │
│    ③ 正常运行                                       │
│                                                     │
│  终端 2: aihub chat --agent codex                   │
│                                                     │
│    ① 检查 .aihub/.state/chat.lock                  │
│    ② 存在! 检查 PID 1234 是否还活着                 │
│       ├── PID 存活 → 提示:                          │
│       │   "⚠️ 已有活跃会话 (claude, PID 1234)       │
│       │    a) 等它结束                               │
│       │    b) 强制解锁 (可能冲突)                    │
│       │    c) 退出"                                  │
│       │                                             │
│       └── PID 已死 → 清理残留 lock → 正常启动       │
│                                                     │
│  会话结束时:                                         │
│    删除 chat.lock                                   │
│                                                     │
│  异常退出 (kill -9):                                 │
│    lock 残留 → 下次启动检测 PID 是否存活 → 自动清理  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 8. 组件依赖图

```
                        bin/aihub.ts
                            │
                   Commander 命令注册
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
        commands/       commands/      commands/
        chat.ts        memory.ts      generate.ts
        (核心)         session.ts      status.ts
             │          init.ts
             │
     ┌───────┼───────┬──────────┬──────────┐
     ▼       ▼       ▼          ▼          ▼
  core/   core/    core/     core/      drivers/
  hub.ts  memory  session  context-    registry
          .ts     .ts      builder.ts    │
                             │       ┌───┼────┐
                             │       ▼   ▼    ▼
                             │    claude codex aider
                             │    .ts   .ts   .ts
                             │
                    core/memory-extractor.ts
                    core/handoff-generator.ts (新增)
                    core/git-changes.ts (新增)
                    core/agent-log-parser.ts (新增)
                             │
                     ┌───────┼───────┐
                     ▼       ▼       ▼
                  utils/   utils/   utils/
                  config   logger   hash
                  .ts      .ts      .ts


数据流:
  hub.ts ──读取──▶ .aihub/{rules,context,config}
  memory.ts ──读写──▶ .aihub/memory/memories.db
  session.ts ──读写──▶ .aihub/sessions/*.json
  git-changes.ts ──读取──▶ git diff / git status
  agent-log-parser.ts ──读取──▶ ~/.claude/projects/*/sessions/
  projector/generate.ts ──写入──▶ CLAUDE.md, AGENTS.md, ...
```

---

## 9. 技术栈总览

```
┌──────────────────────────────────────────────────────┐
│  Runtime        Node.js >= 20                        │
│  Language       TypeScript (strict mode)             │
│  Build          tsc                                  │
│  CLI            Commander.js                         │
│  Memory Store   SQLite (better-sqlite3)              │
│  Session Store  JSON files                           │
│  Config         YAML (js-yaml)                       │
│  Git            simple-git                           │
│  Process        Node child_process (spawn, inherit)  │
│  ID Gen         nanoid                               │
│  Terminal       chalk (color) + ora (spinner)        │
│  File Watch     chokidar (投影自动生成, 后续)        │
│  Markdown       gray-matter (frontmatter 解析)       │
│  Lock           自实现 (PID-based lockfile)          │
└──────────────────────────────────────────────────────┘
```

---

## 10. 还需要新增的模块

```
当前已实现:
  ✅ bin/aihub.ts
  ✅ core/hub.ts, memory.ts, session.ts
  ✅ core/context-builder.ts, memory-extractor.ts
  ✅ drivers/base.ts, claude.ts, codex.ts, aider.ts, registry.ts
  ✅ commands/chat.ts, init.ts, memory.ts, session.ts, status.ts, generate.ts
  ✅ utils/config.ts, logger.ts

需要新增:
  ❌ core/git-changes.ts         Agent 前后的 git diff 检测
  ❌ core/agent-log-parser.ts    Agent 日志文件解析
  ❌ core/handoff-generator.ts   切换时的交接信息组装
  ❌ core/lockfile.ts            会话锁管理
  ❌ sync/git.ts                 Git 同步
```
