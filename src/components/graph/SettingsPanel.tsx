// SettingsPanel — Obsidian-style collapsible right-floating settings sidebar
// Glass-morphism, accordion groups, slider controls, lucide-react icons

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
  Gauge,
  Ellipsis,
} from "lucide-react";

// ══════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════
export interface GalaxySettings {
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

const DEFAULTS: GalaxySettings = {
  nodeSize: 1, edgeOpacity: 0.15, bloomStrength: 1.5,
  chargeStrength: -150, linkDistance: 20, linkStrength: 0.3, centerGravity: 0.1,
};

// ══════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block mb-3.5">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-medium" style={{ color: "#a1a1aa" }}>
          {label}
        </span>
        <span
          className="text-xs tabular-nums"
          style={{ color: "#e4e4e7", fontFamily: "ui-monospace, monospace" }}
        >
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #3b82f6 ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
          accentColor: "#3b82f6",
        }}
      />
    </label>
  );
}

function AccordionGroup({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: typeof Settings;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 py-2.5 px-1 rounded-md text-left transition-colors"
        style={{ color: expanded ? "#e4e4e7" : "#71717a" }}
        onMouseEnter={(e) => {
          if (!expanded) e.currentTarget.style.color = "#a1a1aa";
        }}
        onMouseLeave={(e) => {
          if (!expanded) e.currentTarget.style.color = "#71717a";
        }}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Icon size={13} />
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
            className="overflow-hidden"
          >
            <div className="pl-5 pr-1 pt-1 pb-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════

export function SettingsPanel({ open, onClose, settings, onChange }: Props) {
  const [panelExpanded, setPanelExpanded] = useState(true);
  const set = (key: keyof GalaxySettings, val: number) =>
    onChange({ ...settings, [key]: val });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          className="absolute top-3 right-3 z-40 flex flex-col overflow-hidden rounded-xl shadow-2xl"
          style={{
            width: 280,
            maxHeight: "calc(100vh - 100px)",
            background: "rgba(9, 9, 11, 0.95)",
            border: "1px solid rgba(63, 63, 70, 0.5)",
            backdropFilter: "blur(24px)",
          }}
        >
          {/* ── Header Bar ── */}
          <button
            onClick={() => setPanelExpanded((v) => !v)}
            className="flex items-center justify-between px-4 h-11 shrink-0 transition-colors"
            style={{
              borderBottom: panelExpanded
                ? "1px solid rgba(63, 63, 70, 0.3)"
                : "none",
              color: "#e4e4e7",
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center w-6 h-6 rounded-md"
                style={{ background: "rgba(59, 130, 246, 0.15)" }}
              >
                <Settings size={13} color="#3b82f6" />
              </div>
              <span className="text-sm font-semibold tracking-tight">Settings</span>
            </div>
            <div className="flex items-center gap-1">
              {panelExpanded ? (
                <ChevronDown size={15} style={{ color: "#71717a" }} />
              ) : (
                <ChevronRight size={15} style={{ color: "#71717a" }} />
              )}
            </div>
          </button>

          {/* ── Content ── */}
          <AnimatePresence initial={false}>
            {panelExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-y-auto overflow-x-hidden"
              >
                <div className="px-3 py-3">
                  {/* ── Appearance ── */}
                  <AccordionGroup title="Appearance" icon={Sparkles} defaultOpen={true}>
                    <SliderControl
                      label="Node Size"
                      value={settings.nodeSize}
                      min={0.3}
                      max={3}
                      step={0.1}
                      onChange={(v) => set("nodeSize", v)}
                      unit="×"
                    />
                    <SliderControl
                      label="Edge Opacity"
                      value={settings.edgeOpacity}
                      min={0.02}
                      max={0.5}
                      step={0.01}
                      onChange={(v) => set("edgeOpacity", v)}
                    />
                    <SliderControl
                      label="Bloom Intensity"
                      value={settings.bloomStrength}
                      min={0.3}
                      max={3}
                      step={0.1}
                      onChange={(v) => set("bloomStrength", v)}
                    />
                  </AccordionGroup>

                  {/* ── Force ── */}
                  <AccordionGroup title="Force" icon={SlidersHorizontal}>
                    <SliderControl
                      label="Charge"
                      value={settings.chargeStrength}
                      min={-500}
                      max={-20}
                      step={10}
                      onChange={(v) => set("chargeStrength", v)}
                    />
                    <SliderControl
                      label="Link Distance"
                      value={settings.linkDistance}
                      min={5}
                      max={80}
                      step={1}
                      onChange={(v) => set("linkDistance", v)}
                      unit="px"
                    />
                    <SliderControl
                      label="Link Strength"
                      value={settings.linkStrength}
                      min={0.05}
                      max={1}
                      step={0.05}
                      onChange={(v) => set("linkStrength", v)}
                    />
                    <SliderControl
                      label="Center Gravity"
                      value={settings.centerGravity}
                      min={0.01}
                      max={0.5}
                      step={0.01}
                      onChange={(v) => set("centerGravity", v)}
                    />
                  </AccordionGroup>

                  {/* ── Other ── */}
                  <AccordionGroup title="Other" icon={Ellipsis}>
                    <div className="text-xs leading-relaxed" style={{ color: "#71717a" }}>
                      <p className="mb-2">Drag nodes to reposition them in the galaxy.</p>
                      <p className="mb-2">Scroll to zoom in/out of the cosmic view.</p>
                      <p>Click any star to inspect its details.</p>
                    </div>
                  </AccordionGroup>

                  {/* ── Reset ── */}
                  <div
                    className="mt-2 pt-3"
                    style={{ borderTop: "1px solid rgba(63, 63, 70, 0.2)" }}
                  >
                    <button
                      onClick={() => onChange({ ...DEFAULTS })}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all"
                      style={{
                        color: "#71717a",
                        border: "1px solid rgba(63, 63, 70, 0.4)",
                        background: "rgba(255, 255, 255, 0.02)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#a1a1aa";
                        e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.3)";
                        e.currentTarget.style.background = "rgba(59, 130, 246, 0.06)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#71717a";
                        e.currentTarget.style.borderColor = "rgba(63, 63, 70, 0.4)";
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                      }}
                    >
                      <RotateCcw size={11} />
                      Reset to Defaults
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Footer ── */}
          <div
            className="flex items-center justify-between px-4 py-2 shrink-0"
            style={{
              borderTop: "1px solid rgba(63, 63, 70, 0.2)",
              fontSize: 10,
              color: "#52525b",
            }}
          >
            <span className="flex items-center gap-1">
              <Gauge size={10} />
              Real-time preview
            </span>
            <button
              onClick={onClose}
              className="hover:underline"
              style={{ color: "#3b82f6" }}
            >
              Close
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { DEFAULTS };
