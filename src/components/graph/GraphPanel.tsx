// GraphPanel — Obsidian-style collapsible control panel
// Right-side overlay panel for graph appearance, force, search & filters

import { ChevronLeft, ChevronRight, Search, Play } from "lucide-react";

export type ColorScheme = "filetype" | "directory" | "time";

export interface GraphPanelProps {
  open: boolean;
  onToggle: () => void;

  // Search
  searchQuery: string;
  onSearchChange: (q: string) => void;

  // Filters
  showOnlyChanged: boolean;
  onShowOnlyChangedChange: (v: boolean) => void;
  showOrphans: boolean;
  onShowOrphansChange: (v: boolean) => void;

  // Color scheme
  colorScheme: ColorScheme;
  onColorSchemeChange: (v: ColorScheme) => void;

  // Appearance
  nodeSize: number;
  onNodeSizeChange: (v: number) => void;
  edgeThickness: number;
  onEdgeThicknessChange: (v: number) => void;
  textOpacity: number;
  onTextOpacityChange: (v: number) => void;

  // Force
  gravity: number;
  onGravityChange: (v: number) => void;
  repulsion: number;
  onRepulsionChange: (v: number) => void;
  attraction: number;
  onAttractionChange: (v: number) => void;
  edgeLength: number;
  onEdgeLengthChange: (v: number) => void;

  // Stats
  nodeCount: number;
  edgeCount: number;

  // Actions
  onAnimate: () => void;
}

// ── Sub-components ──

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="co-graph-panel-row">
      <label className="co-graph-panel-label">{label}</label>
      <div className="co-graph-panel-slider-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="co-graph-slider"
        />
        <span className="co-graph-panel-value">{value}</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="co-graph-panel-row co-graph-panel-row-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="co-graph-switch-input"
      />
      <span className="co-graph-switch" />
    </label>
  );
}

function RadioGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="co-graph-panel-section-label">{label}</div>
      {options.map((opt) => (
        <label key={opt.value} className="co-graph-panel-row co-graph-panel-row-radio">
          <input
            type="radio"
            name="colorScheme"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="co-graph-radio"
          />
          <span className="co-graph-radio-dot" />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <div className="co-graph-panel-section-title">{label}</div>;
}

// ── Main component ──

export function GraphPanel(props: GraphPanelProps) {
  const {
    open, onToggle,
    searchQuery, onSearchChange,
    showOnlyChanged, onShowOnlyChangedChange,
    showOrphans, onShowOrphansChange,
    colorScheme, onColorSchemeChange,
    nodeSize, onNodeSizeChange,
    edgeThickness, onEdgeThicknessChange,
    textOpacity, onTextOpacityChange,
    gravity, onGravityChange,
    repulsion, onRepulsionChange,
    attraction, onAttractionChange,
    edgeLength, onEdgeLengthChange,
    nodeCount, edgeCount,
    onAnimate,
  } = props;

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        className="co-graph-panel-toggle"
        style={{ right: open ? 288 : 8 }}
        onClick={onToggle}
        title={open ? "Close panel" : "Open panel"}
      >
        {open ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* Panel body — slides in from right */}
      <div className={`co-graph-panel ${open ? "co-graph-panel-open" : ""}`}>
        <div className="co-graph-panel-inner">
          {/* ── Section 1: Search & Filters ── */}
          <SectionTitle label="搜索 / 筛选" />

          <div className="co-graph-panel-search-wrap">
            <Search size={12} className="co-graph-panel-search-icon" />
            <input
              type="text"
              placeholder="搜索文件..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="co-graph-panel-search"
            />
          </div>

          <div className="co-graph-panel-filters">
            <ToggleRow
              label="标签过滤"
              checked={false}
              onChange={() => {}}
            />
            <ToggleRow
              label="仅显示变更文件"
              checked={showOnlyChanged}
              onChange={onShowOnlyChangedChange}
            />
            <ToggleRow
              label="孤立文件"
              checked={showOrphans}
              onChange={onShowOrphansChange}
            />
          </div>

          {/* ── Section 2: Color Groups ── */}
          <SectionTitle label="颜色分组" />
          <RadioGroup
            label=""
            options={[
              { value: "filetype" as const, label: "按文件类型" },
              { value: "directory" as const, label: "按目录层级" },
              { value: "time" as const, label: "按变更时间" },
            ]}
            value={colorScheme}
            onChange={onColorSchemeChange}
          />

          {/* ── Section 3: Appearance ── */}
          <SectionTitle label="外观" />

          <SliderRow
            label="节点大小"
            value={nodeSize}
            min={6}
            max={24}
            step={1}
            onChange={onNodeSizeChange}
          />
          <SliderRow
            label="连线粗细"
            value={edgeThickness}
            min={0.2}
            max={2}
            step={0.1}
            onChange={onEdgeThicknessChange}
          />
          <SliderRow
            label="文本透明度"
            value={textOpacity}
            min={0}
            max={1}
            step={0.05}
            onChange={onTextOpacityChange}
          />

          <button className="co-graph-panel-animate-btn" onClick={onAnimate}>
            <Play size={12} />
            播放动画
          </button>

          {/* ── Section 4: Force ── */}
          <SectionTitle label="力度" />

          <SliderRow
            label="图谱向心力"
            value={gravity}
            min={1}
            max={20}
            step={0.5}
            onChange={onGravityChange}
          />
          <SliderRow
            label="节点间排斥力"
            value={repulsion}
            min={1}
            max={20}
            step={0.5}
            onChange={onRepulsionChange}
          />
          <SliderRow
            label="相连节点吸引力"
            value={attraction}
            min={1}
            max={10}
            step={0.5}
            onChange={onAttractionChange}
          />
          <SliderRow
            label="连线长度"
            value={edgeLength}
            min={1}
            max={20}
            step={0.5}
            onChange={onEdgeLengthChange}
          />

          {/* ── Bottom stats ── */}
          <div className="co-graph-panel-stats">
            <span>{nodeCount} 节点</span>
            <span className="co-graph-panel-stats-sep">·</span>
            <span>{edgeCount} 连线</span>
          </div>
        </div>
      </div>
    </>
  );
}
