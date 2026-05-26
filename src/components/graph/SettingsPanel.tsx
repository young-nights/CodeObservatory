// SettingsPanel — Obsidian-style accordion right panel
// Collapsible sections: Appearance + Force controls

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronDown, Sliders, RotateCcw } from "lucide-react";

interface GalaxySettings {
  nodeSize: number; edgeOpacity: number; bloomStrength: number;
  chargeStrength: number; linkDistance: number; linkStrength: number; centerGravity: number;
}

interface Props {
  open: boolean; onClose: () => void;
  settings: GalaxySettings; onChange: (s: GalaxySettings) => void;
}

function SliderRow({ label, value, min, max, step, onChange, unit = "" }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block mb-3">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs" style={{ color: "#8070a0" }}>{label}</span>
        <span className="text-xs tabular-nums" style={{ color: "#a1a1aa", fontFamily: "monospace" }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, #06b6d4 ${pct}%, rgba(255,255,255,0.06) ${pct}%)`, accentColor: "#06b6d4" }} />
    </label>
  );
}

function AccordionSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 py-2 text-left transition-colors"
        style={{ color: open ? "#a1a1aa" : "#71717a" }}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="pb-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SettingsPanel({ open, onClose, settings, onChange }: Props) {
  const set = (key: keyof GalaxySettings, v: number) => onChange({ ...settings, [key]: v });

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ x: 280 }} animate={{ x: 0 }} exit={{ x: 280 }} transition={{ duration: 0.2, ease: [0.25,1,0.5,1] }}
          className="absolute top-0 right-0 h-full w-[280px] z-30 flex flex-col overflow-y-auto"
          style={{ background: "rgba(8,4,20,0.97)", borderLeft: "1px solid rgba(100,96,255,0.12)", backdropFilter: "blur(24px)" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-11 shrink-0" style={{ borderBottom: "1px solid rgba(100,96,255,0.08)" }}>
            <div className="flex items-center gap-2"><Sliders size={14} color="#06b6d4" /><span className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>Galaxy</span></div>
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded" style={{ color: "#52525b" }}><ChevronRight size={16} /></button>
          </div>

          <div className="flex-1 px-4 py-3">
            <AccordionSection title="Appearance" defaultOpen={true}>
              <SliderRow label="Node Size" value={settings.nodeSize} min={0.3} max={3} step={0.1} onChange={v => set("nodeSize", v)} unit="x" />
              <SliderRow label="Edge Opacity" value={settings.edgeOpacity} min={0.02} max={0.5} step={0.01} onChange={v => set("edgeOpacity", v)} />
              <SliderRow label="Bloom" value={settings.bloomStrength} min={0.3} max={3} step={0.1} onChange={v => set("bloomStrength", v)} />
            </AccordionSection>

            <AccordionSection title="Force" defaultOpen={false}>
              <SliderRow label="Charge" value={settings.chargeStrength} min={-500} max={-20} step={10} onChange={v => set("chargeStrength", v)} />
              <SliderRow label="Link Distance" value={settings.linkDistance} min={5} max={80} step={1} onChange={v => set("linkDistance", v)} unit="px" />
              <SliderRow label="Link Strength" value={settings.linkStrength} min={0.05} max={1} step={0.05} onChange={v => set("linkStrength", v)} />
              <SliderRow label="Center Gravity" value={settings.centerGravity} min={0.01} max={0.5} step={0.01} onChange={v => set("centerGravity", v)} />
            </AccordionSection>

            <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(100,96,255,0.06)" }}>
              <p className="text-xs leading-relaxed mb-3" style={{ color: "#52525b" }}>Drag · Scroll · Click nodes</p>
              <button onClick={() => onChange({ nodeSize: 1, edgeOpacity: 0.15, bloomStrength: 1.5, chargeStrength: -150, linkDistance: 20, linkStrength: 0.3, centerGravity: 0.1 })} 
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-colors"
                style={{ color: "#71717a", border: "1px solid rgba(100,96,255,0.1)" }}>
                <RotateCcw size={11} /> Reset Defaults
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
