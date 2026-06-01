# CodeObservatory Requirements Specification

> Version: v1.0 | Date: 2026-06-01 | Author: Lobster Chief

---

## 1. Project Positioning

**CodeObservatory** is a desktop-level **code repository visual observatory** for developers. Its core objective is to make AI coding agent (Claude, Copilot, Cursor, Codex) file modification behaviors transparent, auditable, and traceable.

**Core Value Proposition**:

- **Visibility** — What AI changed, how much, and who is affected — all at a glance
- **Explorability** — 3D galaxy + depth control + in-degree/out-degree analysis, explore code like exploring the universe
- **Traceability** — Timeline + change records + commit hash, every step is traceable
- **Focusability** — Hot file ranking + node highlight linkage, quickly locate AI active zones

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Tauri 2 |
| Frontend Framework | React 19 + TypeScript |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS |
| 3D Visualization | Three.js + ForceGraph3D + React Three Fiber |
| Graph Algorithms | d3-force-3d + Graphology + ForceAtlas2 |
| State Management | React Hooks + localStorage |
| Local Storage | SQLite (Tauri backend) |
| Internationalization | i18next + react-i18next |
| UI Components | Radix UI + Lucide Icons + Framer Motion |

---

## 3. Core Feature Modules

### 3.1 Project Selector

**Description**: Users select local code repository directories with multi-project management support.

| Feature | Description |
|---------|-------------|
| Native Directory Selection | Invokes Tauri system dialog to select project directory |
| Recent Projects List | Records recently opened projects (up to 10) for quick reopening |
| Multi-Project Selection | Supports checking multiple projects for Galaxy Cluster visualization |
| Auto Initialization | Automatically creates `.observatory/` directory and SQLite database on first open |
| Project Isolation | Each project stores change records and configuration independently |

### 3.2 Dashboard

**Description**: Provides project change overview and key metrics.

| Metric | Description |
|--------|-------------|
| Total Changes | Cumulative total changes |
| Files Tracked | Number of unique tracked files |
| Watcher Status | File monitoring running state (Active / Idle) |
| Recent Changes | Latest 15 change records (type, filename, agent, time) |

**Design Specifications**:

- Stat numbers: Serif font (Georgia), 32px, precision instrument style
- Labels: 10px uppercase, strict spacing
- Layout: 3-column grid, staggered fade-in animation

### 3.3 Timeline

**Description**: Displays all change records in chronological format for tracing file evolution.

| Feature | Description |
|---------|-------------|
| 1px Rail | Minimalist timeline line |
| 5px Dot | Change event markers |
| Monospace Timestamps | Monospace font for precise time display |
| Change Types | Created (green) / Modified (blue) / Deleted (red) |
| Agent Identifier | Displays the AI Agent name that executed the change |
| Commit Hash | Associated Git commit hash (first 7 characters) |

### 3.4 3D Galaxy Graph

**Description**: Renders the project file structure as a cosmic galaxy-style 3D force-directed graph.

**Node System**:

| Node Type | Visual Representation | Color Rule |
|-----------|----------------------|------------|
| Directory | 📁 Planet | Gradient by depth: root gold → child warm yellow |
| TypeScript (.ts) | Star | Cyan #00e5ff |
| TSX (.tsx) | Star | Deep cyan #00d4ee |
| Rust (.rs) | Star | Red #ff6050 |
| Python (.py) | Star | Teal #00bcd4 |
| Markdown (.md) | Star | White #ffffff |
| Other Files | Star | Color mapped by extension |

**Link System**:

- Directory → child: thick line (0.8px), directional particle flow
- Other relationships: thin line (0.3px), semi-transparent

**Interaction Methods**:

| Operation | Effect |
|-----------|--------|
| Drag Rotate | 360° free rotation of viewport |
| Scroll Zoom | Distance zoom |
| Hover Node | Show filename tooltip, highlight connected nodes, dim others |
| Click Node | Camera focus + Inspector panel detail display |
| Click Background | Deselect |

**Visual Effects**:

- UnrealBloomPass glow post-processing
- 3-layer starfield background (far/mid/near particle layers)
- Deep space background color #000011

### 3.5 Multi-Project Galaxy Cluster

**Description**: Arranges multiple projects as independent galaxies in the same 3D space.

| Feature | Description |
|---------|-------------|
| Ring Layout | Multiple projects evenly distributed on circular orbit by angle |
| Adaptive Spacing | Ring radius dynamically adjusts with project count |
| Independent Namespace | Node IDs prefixed with project path to avoid conflicts |
| Unified Viewport | All galaxies share the same 3D scene |

### 3.6 File Watcher

**Description**: Real-time monitoring of file system changes in the project directory with automatic change recording.

| Feature | Description |
|---------|-------------|
| Background Running | Tauri Rust backend continuously monitors |
| Change Persistence | Detected changes automatically written to SQLite |
| Status Query | Frontend polls for Watcher running status |
| Change Types | created / modified / deleted |
| Polling Interval | Change data: 3 seconds, Status: 5 seconds |

### 3.7 Inspector

**Description**: Side panel displaying detailed file information after node click.

| Field | Description |
|-------|-------------|
| Filename | Node label |
| File Path | Full path |
| File Type | Directory / .extension |
| File Size | B / KB units |
| Connection Count | Number of edges connected to the node |

### 3.8 Settings Panel

**Description**: Adjusts Galaxy force-directed layout parameters.

| Parameter | Description |
|-----------|-------------|
| Alpha Decay | Force simulation decay rate |
| Velocity Decay | Velocity damping coefficient |
| Link Distance | Link target distance |
| Charge Strength | Node repulsion strength |

---

## 4. Enhanced Requirements (Based on MeetBlog Reference)

The following requirements are derived from analysis of MeetBlog (Chinese Blog Galaxy, https://meet-blog.buyixiao.xyz/), fusing its interaction patterns with CodeObservatory.

### 4.1 Network Topology Analysis

Borrowing MeetBlog's in-degree/out-degree concept to introduce quantified metrics for file dependency relationships.

| MeetBlog Concept | CodeObservatory Fusion Approach |
|------------------|----------------------------------|
| In-Degree | Reference count: how many other files import/require a given file |
| Out-Degree | Dependency count: how many other modules a file imports |
| Connection Count | Total associations: in-degree + out-degree, identifying hub files |
| Friend Chain Relationship | Cross-module coupling: cross-directory file dependency relationships |

**Implementation Effects**:

- Node size scales by in-degree (frequently referenced core files are larger and brighter)
- Edge thickness renders by dependency weight
- Inspector panel adds In-Degree / Out-Degree metrics

### 4.2 Depth Slider Control

Borrowing MeetBlog's crawl depth control to provide level adjustment for directory scanning.

| MeetBlog Concept | CodeObservatory Fusion Approach |
|------------------|----------------------------------|
| Exploration Depth 1-5 | Directory scan depth: controls Galaxy directory level display (default 4) |
| Smaller = faster, larger = more complete | Same principle: depth=2 shows only top structure, depth=6 shows all files |

**Implementation Effects**:

- Add depth slider (1-6) at Galaxy top
- Real-time adjustment of galaxy detail level
- Large repos can choose shallow overview, small repos can drill deep

### 4.3 Hot File Ranking

Borrowing MeetBlog's popular blog recommendation to provide quick identification of AI active modification zones for developers.

| MeetBlog Concept | CodeObservatory Fusion Approach |
|------------------|----------------------------------|
| Popular Blog | Hot File: sorted by change frequency, recently AI-frequently-modified files prioritized |
| Site-wide Clicks | Modification Count: total cumulative modifications |
| Crawl Depth | Impact Depth: how many downstream dependency layers a file's changes affect |

**Implementation Effects**:

- Sidebar or Dashboard adds "Hot Files Top 10" ranking board
- Ranking items are clickable, jumping to Galaxy and focusing on the corresponding node
- Supports filtering by time range (today / this week / this month / all)

### 4.4 Interaction Enhancement

| MeetBlog Operation | CodeObservatory Fusion Approach |
|--------------------|----------------------------------|
| Double-click to visit blog | Double-click to open file: invokes system default editor to open the corresponding file |

**Implementation**: Call system default program to open file via Tauri `shell.open()` API.

---

## 5. Design Specifications

### 5.1 Design Language: Precision Instrument

The interface should feel like a precision scientific instrument — restrained, precise, trustworthy. Beauty comes from precision, not decoration.

**Brand Personality**:

- **Precision** — Like a scientific instrument (microscope, telescope, spectrometer)
- **Restraint** — Confidence to say more with less; no decorative excess
- **Trustworthy** — Clarity born from deliberate choices, not trend-chasing
- **Calm Focus** — Reduces cognitive load, surfaces what matters

**Design References**: Carl Zeiss microscopes, Braun industrial design, IBM Selectric typewriter

### 5.2 Typography System

| Usage | Font |
|-------|------|
| Headings / Data | Georgia (Serif) |
| Body / UI | system-ui (Sans-serif) |
| Code / Timestamps | SF Mono / Fira Code (Monospace) |

### 5.3 Color System

| Element | Light Mode | Dark Mode |
|---------|-----------|-----------|
| Background | #fafafa | #0c0c10 |
| Border | #e5e7eb | #1c1c24 |
| Primary Text | #18181b | #e4e4e7 |
| Secondary Text | #9ca3af | #52525b |
| Accent | #06b6d4 (Cyan) | #06b6d4 |
| Success | Green scale | Green scale |
| Danger | Red scale | Red scale |

### 5.4 Spacing System

- Base grid: 4px
- Alignment: Asymmetric hierarchy

### 5.5 Motion Specifications

- Easing function: Exponential easing (quart-out / quart-in)
- Forbidden: bounce, spring elastic animations
- Entrance animation: stagger + fade-in

### 5.6 Anti-Patterns (Prohibited)

- ❌ Backdrop-blur glassmorphism effects
- ❌ Neon glow effects
- ❌ Gradient background colors
- ❌ Decorative particle effects
- ❌ Emoji / exclamation marks / playful microcopy

---

## 6. Data Models

### 6.1 ChangeRecord

```typescript
interface ChangeRecord {
  id: string;                    // Unique identifier
  timestamp: string;             // ISO 8601 timestamp
  kind: "created" | "modified" | "deleted";
  filePath: string;              // Full file path
  relativePath: string;          // Path relative to project root
  summary: string;               // Change summary
  agent?: string;                // AI Agent identifier
  commitHash?: string;           // Associated Git commit hash
}
```

### 6.2 FileNode

```typescript
interface FileNode {
  id: string;
  label: string;
  path: string;
  changeCount?: number;
  kind?: "dir" | "file";
  extension?: string;
  size?: number;                 // File size in bytes
  modified?: string;             // Last modification time ISO 8601
  hasChildren?: boolean;
  truncated?: boolean;
  nodeType?: 'star' | 'planet' | 'moon' | 'satellite' | 'dust';
  // Enhanced fields from fusion
  inDegree?: number;             // Reference count
  outDegree?: number;            // Dependency count
  changeFrequency?: number;      // Change frequency (last 30 days)
  impactDepth?: number;          // Impact depth
}
```

### 6.3 GraphData

```typescript
interface GraphData {
  nodes: FileNode[];
  edges: FileEdge[];
}

interface FileEdge {
  id: string;
  source: string;
  target: string;
  weight?: number;               // Dependency weight
  label?: string;                // Relationship type (import/require/include)
}
```

---

## 7. API Interface (Tauri Commands)

| Command | Parameters | Return | Description |
|---------|-----------|--------|-------------|
| `select_project` | — | `string \| null` | Opens system directory selection dialog |
| `init_project` | `projectPath` | `void` | Initializes .observatory directory and database |
| `check_observatory` | `projectPath` | `boolean` | Checks if project is initialized |
| `start_watching` | `projectPath` | `void` | Starts file monitoring |
| `stop_watching` | — | `void` | Stops file monitoring |
| `get_watcher_status` | — | `WatcherStatus` | Gets monitoring status |
| `get_changes` | `projectPath, limit?, offset?` | `ChangeRecord[]` | Gets change record list |
| `get_change_by_id` | `projectPath, changeId` | `ChangeRecord \| null` | Gets single change record |
| `build_graph` | `projectPath` | `GraphData` | Builds file relationship graph from change history |
| `scan_directory` | `projectPath, maxDepth?` | `GraphData` | Scans directory to build file tree graph |
| `get_file_changes` | `projectPath, filePath` | `ChangeRecord[]` | Gets change history for specific file |

---

## 8. Project Structure

```
CodeObservatory/
├── src/
│   ├── components/
│   │   ├── graph/           # 3D Galaxy components
│   │   │   ├── CosmicProjectGalaxy.tsx   # Multi-project galaxy cluster
│   │   │   ├── ProjectGalaxy.tsx         # Single project galaxy
│   │   │   ├── Inspector.tsx             # Node detail panel
│   │   │   ├── SettingsPanel.tsx         # Force-directed parameter settings
│   │   │   ├── BloomOverlay.tsx          # Glow post-processing
│   │   │   └── NebulaRings.tsx           # Nebula ring decoration
│   │   ├── layout/          # Layout components
│   │   │   ├── AppShell.tsx             # Main layout framework
│   │   │   ├── Sidebar.tsx              # Side navigation bar
│   │   │   └── TopBar.tsx               # Top toolbar
│   │   ├── project/         # Project management
│   │   │   └── ProjectSelector.tsx       # Project selector
│   │   └── ui/              # Common UI components
│   ├── hooks/               # React Hooks
│   │   ├── useObservatory.ts            # Core data hooks
│   │   └── useTheme.tsx                 # Theme management
│   ├── i18n/                # Internationalization
│   ├── lib/                 # Utility library
│   │   ├── api.ts                        # Tauri command wrappers
│   │   ├── types.ts                      # Type definitions
│   │   ├── utils.ts                      # Utility functions
│   │   ├── forceSimulation.ts            # Force simulation config
│   │   └── solarLayout.ts               # Solar system layout algorithm
│   ├── pages/               # Pages
│   │   ├── Dashboard.tsx                # Dashboard
│   │   ├── Timeline.tsx                 # Timeline
│   │   └── GraphPage.tsx                # Graph page
│   ├── App.tsx              # Application entry
│   └── main.tsx             # Render entry
├── src-tauri/               # Tauri Rust backend
│   └── src/
│       ├── commands/        # Command implementations
│       │   ├── changes.rs
│       │   ├── graph.rs
│       │   ├── project.rs
│       │   └── watcher.rs
│       ├── state.rs         # Global state
│       ├── lib.rs           # Library entry
│       └── main.rs          # Program entry
└── docs/                    # Project documentation
```

---

## 9. Change Log

| Version | Date | Key Changes |
|---------|------|-------------|
| v1.0 | 2026-06-01 | Initial version, integrated MeetBlog reference, defined complete requirements specification |
