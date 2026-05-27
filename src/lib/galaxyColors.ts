// galaxyColors.ts — Color scheme management for the galaxy visualization
// Provides theme-aware color schemes and preset palettes

export interface ColorScheme {
  root: string;
  dir1: string;
  dir2: string;
  defaultFile: string;
  dust: string;
  edgeRoot: string;
  edgeDir: string;
  edgeFile: string;
  rootEmissive: number;
  rootHalo: readonly [string, string, string];
  file: Record<string, string>;
  bg: string;
  ui: {
    bg: string;
    card: string;
    border: string;
    text: string;
    dim: string;
    muted: string;
  };
}

export interface ColorPreset {
  name: string;
  root: string;
  folder1: string;
  folder2: string;
  fileDefault: string;
  dust: string;
  edgeRoot: string;
  edgeDir: string;
  edgeFile: string;
}

export const COLOR_PRESETS: Record<string, ColorPreset> = {
  cosmic: {
    name: "Cosmic",
    root: "#e0f0ff", folder1: "#67e8f9", folder2: "#e879f9",
    fileDefault: "#c4b5fd", dust: "#f0c060",
    edgeRoot: "#6366f1", edgeDir: "#8b5cf6", edgeFile: "#facc15",
  },
  nebula: {
    name: "Nebula",
    root: "#fff0e0", folder1: "#ff8c42", folder2: "#ff6b9d",
    fileDefault: "#ffb347", dust: "#ffd700",
    edgeRoot: "#ff6b35", edgeDir: "#ff477e", edgeFile: "#ffa500",
  },
  aurora: {
    name: "Aurora",
    root: "#e0ffe0", folder1: "#4ade80", folder2: "#2dd4bf",
    fileDefault: "#86efac", dust: "#a3e635",
    edgeRoot: "#16a34a", edgeDir: "#0d9488", edgeFile: "#65a30d",
  },
  sunset: {
    name: "Sunset",
    root: "#ffe0e0", folder1: "#fb923c", folder2: "#f472b6",
    fileDefault: "#fdba74", dust: "#fbbf24",
    edgeRoot: "#ea580c", edgeDir: "#db2777", edgeFile: "#d97706",
  },
  monochrome: {
    name: "Mono",
    root: "#ffffff", folder1: "#a1a1aa", folder2: "#71717a",
    fileDefault: "#d4d4d8", dust: "#a1a1aa",
    edgeRoot: "#e4e4e7", edgeDir: "#a1a1aa", edgeFile: "#71717a",
  },
};

// Dark theme base colors
const DARK_BASE: Omit<ColorScheme, "root" | "dir1" | "dir2" | "defaultFile" | "dust" | "edgeRoot" | "edgeDir" | "edgeFile"> = {
  rootEmissive: 8,
  rootHalo: ["#80b0ff", "#c4b5fd", "#e879f9"] as const,
  file: {
    ts: "#67e8f9", tsx: "#67e8f9", js: "#67e8f9", jsx: "#67e8f9",
    rs: "#e879f9",
    md: "#c084fc", mdx: "#c084fc",
    json: "#facc15", toml: "#facc15", yaml: "#facc15", yml: "#facc15",
    css: "#4ade80", scss: "#4ade80", less: "#4ade80",
    html: "#fb923c", htm: "#fb923c",
    py: "#2dd4bf",
    c: "#94a3b8", h: "#94a3b8", cpp: "#94a3b8", cc: "#94a3b8", hpp: "#94a3b8",
    go: "#60b0d0",
  },
  bg: "#05050f",
  ui: { bg: "#08080c", card: "rgba(8,4,20,0.97)", border: "rgba(99,102,241,0.12)", text: "#e0e7ff", dim: "#a1a1aa", muted: "#71717a" },
};

// Light theme base colors
const LIGHT_BASE: Omit<ColorScheme, "root" | "dir1" | "dir2" | "defaultFile" | "dust" | "edgeRoot" | "edgeDir" | "edgeFile"> = {
  rootEmissive: 3,
  rootHalo: ["#6366f1", "#7c3aed", "#a78bfa"] as const,
  file: {
    ts: "#0284c7", tsx: "#0369a1", js: "#0284c7", jsx: "#0369a1",
    rs: "#7c3aed",
    md: "#7c3aed", mdx: "#7c3aed",
    json: "#ca8a04", toml: "#ca8a04", yaml: "#ca8a04", yml: "#ca8a04",
    css: "#16a34a", scss: "#15803d", less: "#15803d",
    html: "#ea580c", htm: "#ea580c",
    py: "#0d9488",
    c: "#64748b", h: "#64748b", cpp: "#64748b", cc: "#64748b", hpp: "#64748b",
    go: "#0891b2",
  },
  bg: "#f8fafc",
  ui: { bg: "#ffffff", card: "rgba(255,255,255,0.95)", border: "rgba(0,0,0,0.08)", text: "#1e293b", dim: "#64748b", muted: "#94a3b8" },
};

/**
 * Build a complete ColorScheme by merging theme base with preset overrides.
 */
export function getColorScheme(isDark: boolean, presetName: string): ColorScheme {
  const base = isDark ? DARK_BASE : LIGHT_BASE;
  const preset = COLOR_PRESETS[presetName] || COLOR_PRESETS.cosmic;
  return {
    ...base,
    root: preset.root,
    dir1: preset.folder1,
    dir2: preset.folder2,
    defaultFile: preset.fileDefault,
    dust: preset.dust,
    edgeRoot: preset.edgeRoot,
    edgeDir: preset.edgeDir,
    edgeFile: preset.edgeFile,
  };
}
