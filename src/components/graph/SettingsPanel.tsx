// SettingsPanel — Obsidian-style collapsible right panel
// Controls: Appearance + Force parameters for the galaxy graph

import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Sliders } from "lucide-react";

interface GalaxySettings {
  nodeSize: number;
  edgeOpacity: number;
  bloomStrength: number;
  chargeStrength: number;
  linkDistance: number;
  linkStrength: number;
  centerGravity: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  settings: GalaxySettings;
  onChange: (s: GalaxySettings) => void;
}

// Simple slider component (no shadcn dependency needed)
function SliderControl({
  label, value, min, max, step, onChange, unit = "",
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; unit?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs" style={{ color: "#8070a0" }}>{label}</span>
        <span className="text-xs font-mono tabular-nums" style={{ color: "#a1a1aa" }}>{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #06b6d4 ${pct}%, #1c1c24 ${pct}%)`,
          accentColor: "#06b6d4",
        }}
      />
    </div>
  );
}

// Section header
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#71717a" }}>{title}</h3>
      {children}
    </div>
  );
}

export function SettingsPanel({ open, onClose, settings, onChange }: Props) {
  const set = (key: keyof GalaxySettings, value: number) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 280 }}
          animate={{ x: 0 }}
          exit={{ x: 280 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          className="absolute top-0 right-0 h-full w-[280px] z-30 flex flex-col overflow-y-auto"
          style={{
            background: "rgba(8, 4, 20, 0.97)",
            borderLeft: "1px solid rgba(100, 96, 255, 0.12)",
            backdropFilter: "blur(24px)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-12 shrink-0" style={{ borderBottom: "1px solid rgba(100,96,255,0.08)" }}>
            <div className="flex items-center gap-2">
              <Sliders size={14} color="#06b6d4" />
              <span className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>Galaxy Settings</span>
            </div>
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded transition-colors" style={{ color: "#52525b" }}>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 px-4 py-4">
            {/* ── Appearance ── */}
            <Section title="Appearance">
              <SliderControl label="Node Size" value={settings.nodeSize} min={0.3} max={3} step={0.1} onChange={(v) => set("nodeSize", v)} unit="x" />
              <SliderControl label="Edge Opacity" value={settings.edgeOpacity} min={0.02} max={0.5} step={0.01} onChange={(v) => set("edgeOpacity", v)} />
              <SliderControl label="Bloom Strength" value={settings.bloomStrength} min={0.3} max={3} step={0.1} onChange={(v) => set("bloomStrength", v)} />
            </Section>

            {/* ── Force ── */}
            <Section title="Force">
              <SliderControl label="Charge Strength" value={settings.chargeStrength} min={-500} max={-20} step={10} onChange={(v) => set("chargeStrength", v)} />
              <SliderControl label="Link Distance" value={settings.linkDistance} min={5} max={80} step={1} onChange={(v) => set("linkDistance", v)} unit="px" />
              <SliderControl label="Link Strength" value={settings.linkStrength} min={0.05} max={1} step={0.05} onChange={(v) => set("linkStrength", v)} />
              <SliderControl label="Center Gravity" value={settings.centerGravity} min={0.01} max={0.5} step={0.01} onChange={(v) => set("centerGravity", v)} />
            </Section>

            {/* ── Info ── */}
            <div className="mt-6 pt-4" style={{ borderTop: "1px solid rgba(100,96,255,0.06)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "#52525b" }}>
                Drag to rotate · Scroll to zoom<br />
                Click nodes to inspect · Drag nodes to reposition
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid rgba(100,96,255,0.08)" }}>
            <button
              onClick={() => onChange({
                nodeSize: 1, edgeOpacity: 0.15, bloomStrength: 1.5,
                chargeStrength: -150, linkDistance: 20, linkStrength: 0.3, centerGravity: 0.1,
              })}
              className="w-full py-1.5 rounded text-xs font-medium transition-colors"
              style={{ color: "#71717a", border: "1px solid rgba(100,96,255,0.1)" }}
            >
              Reset to Defaults
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
