# CodeObservatory 需求规格说明书

> 版本：v1.0 | 日期：2026-06-01 | 作者：龙虾主管

---

## 一、项目定位

**CodeObservatory** 是一款面向开发者的桌面级 **代码仓库可视化观测台**，核心目标是让 AI 编程代理（Claude、Copilot、Cursor、Codex）的文件修改行为变得透明、可审计、可追溯。

**核心价值主张**：

- **可见性** — AI 改了什么、改了多少、影响了谁，一目了然
- **可探索** — 3D 星系 + 深度控制 + 入度/出度分析，像探索宇宙一样探索代码
- **可追溯** — Timeline + 变更记录 + commit hash，每一步都有迹可循
- **可聚焦** — 热点文件排行 + 节点高亮联动，快速定位 AI 活跃区域

---

## 二、技术栈

| 层级 | 技术选型 |
|------|----------|
| 桌面框架 | Tauri 2 |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| 样式方案 | Tailwind CSS |
| 3D 可视化 | Three.js + ForceGraph3D + React Three Fiber |
| 图算法 | d3-force-3d + Graphology + ForceAtlas2 |
| 状态管理 | React Hooks + localStorage |
| 本地存储 | SQLite（Tauri 后端） |
| 国际化 | i18next + react-i18next |
| UI 组件 | Radix UI + Lucide Icons + Framer Motion |

---

## 三、核心功能模块

### 3.1 Project Selector（项目选择器）

**功能描述**：用户选择本地代码仓库目录，支持多项目管理。

| 特性 | 描述 |
|------|------|
| 原生目录选择 | 调用 Tauri 系统对话框选择项目目录 |
| 最近项目列表 | 记录最近打开的项目（最多 10 个），快速重开 |
| 多项目勾选 | 支持勾选多个项目，用于 Galaxy Cluster 可视化 |
| 自动初始化 | 首次打开自动创建 `.observatory/` 目录和 SQLite 数据库 |
| 项目隔离 | 每个项目独立存储变更记录和配置，互不干扰 |

### 3.2 Dashboard（仪表盘）

**功能描述**：提供项目变更概览和关键指标。

| 指标 | 说明 |
|------|------|
| Total Changes | 累计变更总数 |
| Files Tracked | 被追踪的唯一文件数 |
| Watcher Status | 文件监控运行状态（Active / Idle） |
| Recent Changes | 最近 15 条变更记录（类型、文件名、Agent、时间） |

**设计规范**：

- 统计数字：Serif 字体（Georgia），32px，精密仪器风格
- 标签：10px 大写，间距严谨
- 布局：3 列网格，交错动画入场

### 3.3 Timeline（时间线）

**功能描述**：以时间轴形式展示所有变更记录，便于追溯文件演变。

| 特性 | 描述 |
|------|------|
| 1px 轨道 | 极简时间轴线 |
| 5px 圆点 | 变更事件标记 |
| Monospace 时间戳 | 等宽字体显示精确时间 |
| 变更类型 | Created（绿）/ Modified（蓝）/ Deleted（红） |
| Agent 标识 | 显示执行变更的 AI Agent 名称 |
| Commit Hash | 关联 Git 提交哈希（前 7 位） |

### 3.4 3D Galaxy Graph（3D 星系图）

**功能描述**：将项目文件结构渲染为宇宙星系风格的 3D 力导向图。

**节点系统**：

| 节点类型 | 视觉表现 | 颜色规则 |
|----------|----------|----------|
| 目录（Directory） | 📁 Planet | 按层级渐变：根目录金色 → 子目录暖黄 |
| TypeScript (.ts) | Star | 青色 #00e5ff |
| TSX (.tsx) | Star | 深青 #00d4ee |
| Rust (.rs) | Star | 红色 #ff6050 |
| Python (.py) | Star | 蓝青 #00bcd4 |
| Markdown (.md) | Star | 白色 #ffffff |
| 其他文件 | Star | 按扩展名映射颜色 |

**连线系统**：

- 目录→子项：粗线（0.8px），带方向粒子流动
- 其他关系：细线（0.3px），半透明

**交互方式**：

| 操作 | 效果 |
|------|------|
| 拖拽旋转 | 360° 自由旋转视角 |
| 滚轮缩放 | 远近缩放 |
| 悬浮节点 | 显示文件名 tooltip，高亮关联节点，其余节点变暗 |
| 点击节点 | 镜头聚焦 + Inspector 面板展示详情 |
| 点击空白 | 取消选择 |

**视觉效果**：

- UnrealBloomPass 辉光后处理
- 3 层星空背景（远/中/近三层粒子）
- 深空背景色 #000011

### 3.5 Multi-Project Galaxy Cluster（多项目星系集群）

**功能描述**：将多个项目以独立星系形式排布在同一 3D 空间中。

| 特性 | 描述 |
|------|------|
| 环形排布 | 多项目按角度均匀分布在环形轨道上 |
| 间距自适应 | 环半径随项目数量动态调整 |
| 独立命名空间 | 节点 ID 前缀项目路径，避免冲突 |
| 统一视口 | 所有星系共享同一 3D 场景 |

### 3.6 File Watcher（文件监控）

**功能描述**：实时监控项目目录的文件系统变化，自动记录变更。

| 特性 | 描述 |
|------|------|
| 后台运行 | Tauri Rust 后端持续监控 |
| 变更入库 | 检测到变化自动写入 SQLite |
| 状态查询 | 前端轮询获取 Watcher 运行状态 |
| 变更类型 | created / modified / deleted |
| 轮询间隔 | 变更数据 3 秒，状态 5 秒 |

### 3.7 Inspector（节点检查器）

**功能描述**：点击节点后展示文件详细信息的侧边面板。

| 字段 | 说明 |
|------|------|
| 文件名 | 节点标签 |
| 文件路径 | 完整路径 |
| 文件类型 | 目录 / .扩展名 |
| 文件大小 | B / KB 单位 |
| 连接数 | 与该节点相连的边数 |

### 3.8 Settings Panel（设置面板）

**功能描述**：调整 Galaxy 的力导向布局参数。

| 参数 | 说明 |
|------|------|
| Alpha Decay | 力模拟衰减速度 |
| Velocity Decay | 速度阻尼系数 |
| Link Distance | 连线目标距离 |
| Charge Strength | 节点排斥力强度 |

---

## 四、融合增强需求（基于 MeetBlog 参考）

以下需求来源于对 MeetBlog（中文博客星系，https://meet-blog.buyixiao.xyz/）的分析，将其交互模式与 CodeObservatory 融合。

### 4.1 网络拓扑分析

借鉴 MeetBlog 的入度/出度概念，为文件依赖关系引入量化指标。

| MeetBlog 概念 | CodeObservatory 融合方案 |
|---------------|--------------------------|
| 入度（In-Degree） | 被引用次数：一个文件被多少其他文件 import/require |
| 出度（Out-Degree） | 依赖数：一个文件 import 了多少其他模块 |
| 连接数 | 总关联数：入度 + 出度，识别枢纽文件 |
| 友链关系 | 模块间耦合：跨目录的文件依赖关系 |

**实现效果**：

- 节点大小按入度缩放（高频被引用的核心文件更大更亮）
- 边的粗细按依赖权重渲染
- Inspector 面板增加 In-Degree / Out-Degree 指标

### 4.2 深度滑块控制

借鉴 MeetBlog 的爬取深度控制，为目录扫描提供层级调节。

| MeetBlog 概念 | CodeObservatory 融合方案 |
|---------------|--------------------------|
| 探索深度 1-5 | 目录扫描深度：控制 Galaxy 展示的目录层级（当前默认 4 层） |
| 越小越快，越大越完整 | 同理：depth=2 只看顶层结构，depth=6 看到所有文件 |

**实现效果**：

- Galaxy 顶部增加深度滑块（1-6）
- 实时调节星系的细节层级
- 大仓库可选择浅层概览，小仓库可深入到底

### 4.3 热点文件排行

借鉴 MeetBlog 的热门博客推荐，为开发者提供 AI 活跃修改区域的快速定位。

| MeetBlog 概念 | CodeObservatory 融合方案 |
|---------------|--------------------------|
| 热门博客 | 热点文件：按变更频率排序，最近被 AI 频繁修改的文件置顶 |
| 全站点击 | 修改次数：累计被修改的总次数 |
| 爬取深度 | 影响深度：该文件的变更波及了几层下游依赖 |

**实现效果**：

- 侧边栏或 Dashboard 增加「热点文件 Top 10」排行榜
- 排行项可点击，跳转至 Galaxy 并聚焦对应节点
- 支持按时间范围筛选（今日/本周/本月/全部）

### 4.4 交互增强

| MeetBlog 操作 | CodeObservatory 融合方案 |
|---------------|--------------------------|
| 双击访问博客 | 双击打开文件：调用系统默认编辑器打开对应文件 |

**实现方式**：通过 Tauri `shell.open()` API 调用系统默认程序打开文件。

---

## 五、设计规范

### 5.1 设计语言：Precision Instrument（精密仪器）

界面应如同精密科学仪器般克制、精确、可信。美感来自精确，而非装饰。

**品牌个性**：

- **Precision** — 如科学仪器（显微镜、望远镜、光谱仪）
- **Restraint** — 以少胜多的自信，无装饰性冗余
- **Trustworthy** — 深思熟虑带来的清晰，而非追逐潮流
- **Calm Focus** — 降低认知负荷，只呈现重要信息

**设计参考**：Carl Zeiss 显微镜、Braun 工业设计、IBM Selectric 打字机

### 5.2 字体系统

| 用途 | 字体 |
|------|------|
| 标题/数据 | Georgia（Serif） |
| 正文/UI | system-ui（Sans-serif） |
| 代码/时间戳 | SF Mono / Fira Code（Monospace） |

### 5.3 色彩系统

| 元素 | 浅色模式 | 深色模式 |
|------|----------|----------|
| 背景 | #fafafa | #0c0c10 |
| 边框 | #e5e7eb | #1c1c24 |
| 主文本 | #18181b | #e4e4e7 |
| 次文本 | #9ca3af | #52525b |
| 强调色 | #06b6d4（Cyan） | #06b6d4 |
| 成功 | 绿色系 | 绿色系 |
| 危险 | 红色系 | 红色系 |

### 5.4 间距系统

- 基础网格：4px
- 对齐方式：不对称层级

### 5.5 动效规范

- 缓动函数：Exponential easing（quart-out / quart-in）
- 禁止：bounce、spring 弹性动画
- 入场动画：stagger 交错 + fade-in

### 5.6 反模式（禁止项）

- ❌ backdrop-blur 毛玻璃效果
- ❌ Neon 霓虹辉光
- ❌ 渐变色背景
- ❌ 粒子装饰效果
- ❌ Emoji / 感叹号 / 趣味微文案

---

## 六、数据模型

### 6.1 ChangeRecord（变更记录）

```typescript
interface ChangeRecord {
  id: string;                    // 唯一标识
  timestamp: string;             // ISO 8601 时间戳
  kind: "created" | "modified" | "deleted";
  filePath: string;              // 完整文件路径
  relativePath: string;          // 相对于项目根目录的路径
  summary: string;               // 变更摘要
  agent?: string;                // 执行变更的 AI Agent 标识
  commitHash?: string;           // 关联的 Git 提交哈希
}
```

### 6.2 FileNode（文件节点）

```typescript
interface FileNode {
  id: string;
  label: string;
  path: string;
  changeCount?: number;
  kind?: "dir" | "file";
  extension?: string;
  size?: number;                 // 文件大小（字节）
  modified?: string;             // 最后修改时间 ISO 8601
  hasChildren?: boolean;
  truncated?: boolean;
  nodeType?: 'star' | 'planet' | 'moon' | 'satellite' | 'dust';
  // 融合增强字段
  inDegree?: number;             // 被引用次数
  outDegree?: number;            // 依赖数
  changeFrequency?: number;      // 变更频率（近 30 天）
  impactDepth?: number;          // 影响深度
}
```

### 6.3 GraphData（图数据）

```typescript
interface GraphData {
  nodes: FileNode[];
  edges: FileEdge[];
}

interface FileEdge {
  id: string;
  source: string;
  target: string;
  weight?: number;               // 依赖权重
  label?: string;                // 关系类型（import/require/include）
}
```

---

## 七、API 接口（Tauri 命令）

| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `select_project` | — | `string \| null` | 弹出系统目录选择对话框 |
| `init_project` | `projectPath` | `void` | 初始化 .observatory 目录和数据库 |
| `check_observatory` | `projectPath` | `boolean` | 检查项目是否已初始化 |
| `start_watching` | `projectPath` | `void` | 启动文件监控 |
| `stop_watching` | — | `void` | 停止文件监控 |
| `get_watcher_status` | — | `WatcherStatus` | 获取监控状态 |
| `get_changes` | `projectPath, limit?, offset?` | `ChangeRecord[]` | 获取变更记录列表 |
| `get_change_by_id` | `projectPath, changeId` | `ChangeRecord \| null` | 获取单条变更记录 |
| `build_graph` | `projectPath` | `GraphData` | 从变更历史构建文件关系图 |
| `scan_directory` | `projectPath, maxDepth?` | `GraphData` | 扫描目录构建文件树图 |
| `get_file_changes` | `projectPath, filePath` | `ChangeRecord[]` | 获取指定文件的变更历史 |

---

## 八、项目结构

```
CodeObservatory/
├── src/
│   ├── components/
│   │   ├── graph/           # 3D Galaxy 相关组件
│   │   │   ├── CosmicProjectGalaxy.tsx   # 多项目星系集群
│   │   │   ├── ProjectGalaxy.tsx         # 单项目星系
│   │   │   ├── Inspector.tsx             # 节点详情面板
│   │   │   ├── SettingsPanel.tsx         # 力导向参数设置
│   │   │   ├── BloomOverlay.tsx          # 辉光后处理
│   │   │   └── NebulaRings.tsx           # 星云环装饰
│   │   ├── layout/          # 布局组件
│   │   │   ├── AppShell.tsx             # 主布局框架
│   │   │   ├── Sidebar.tsx              # 侧边导航栏
│   │   │   └── TopBar.tsx               # 顶部工具栏
│   │   ├── project/         # 项目管理
│   │   │   └── ProjectSelector.tsx       # 项目选择器
│   │   └── ui/              # 通用 UI 组件
│   ├── hooks/               # React Hooks
│   │   ├── useObservatory.ts            # 核心数据 Hook
│   │   └── useTheme.tsx                 # 主题管理
│   ├── i18n/                # 国际化
│   ├── lib/                 # 工具库
│   │   ├── api.ts                        # Tauri 命令封装
│   │   ├── types.ts                      # 类型定义
│   │   ├── utils.ts                      # 工具函数
│   │   ├── forceSimulation.ts            # 力模拟配置
│   │   └── solarLayout.ts               # 太阳系布局算法
│   ├── pages/               # 页面
│   │   ├── Dashboard.tsx                # 仪表盘
│   │   ├── Timeline.tsx                 # 时间线
│   │   └── GraphPage.tsx                # 图谱页
│   ├── App.tsx              # 应用入口
│   └── main.tsx             # 渲染入口
├── src-tauri/               # Tauri Rust 后端
│   └── src/
│       ├── commands/        # 命令实现
│       │   ├── changes.rs
│       │   ├── graph.rs
│       │   ├── project.rs
│       │   └── watcher.rs
│       ├── state.rs         # 全局状态
│       ├── lib.rs           # 库入口
│       └── main.rs          # 程序入口
└── docs/                    # 项目文档
```

---

## 九、变更记录

| 版本 | 日期 | 主要改动 |
|------|------|----------|
| v1.0 | 2026-06-01 | 初始版本，融合 MeetBlog 参考，定义完整需求规格 |
