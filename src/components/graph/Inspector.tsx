// Inspector — Right-side slide-out panel for node details
// Shows file metadata when a galaxy node is selected

import { X, File, Folder, Hash } from "lucide-react";
import type { LayoutNode } from "@/components/graph/CosmicGalaxy";

interface InspectorProps {
  node: LayoutNode | null;
  onClose: () => void;
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Inspector({ node, onClose }: InspectorProps) {
  if (!node) {
    return (
      <div className="co-inspector">
        <div className="co-inspector-header">
          <span className="co-inspector-title">Inspector</span>
          <button onClick={onClose} className="co-inspector-close-btn" title="Close">
            <X size={14} />
          </button>
        </div>
        <div className="co-inspector-body">
          <div className="co-inspector-empty">
            <div className="co-inspector-empty-icon">
              <Hash size={32} opacity={0.3} />
            </div>
            <p>Select a node in the galaxy to inspect its details.</p>
          </div>
        </div>
      </div>
    );
  }

  const isDir = node.kind === "dir";
  const icon = isDir ? (
    <Folder size={16} style={{ color: "var(--cosmic-accent)" }} />
  ) : (
    <File size={16} style={{ color: "var(--cosmic-text-dim)" }} />
  );

  return (
    <div className="co-inspector">
      {/* Header */}
      <div className="co-inspector-header">
        <span className="co-inspector-title truncate flex items-center gap-2">
          {icon}
          {node.label}
        </span>
        <button onClick={onClose} className="co-inspector-close-btn" title="Close">
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="co-inspector-body">
        {/* Kind */}
        <div className="co-inspector-row">
          <span className="co-inspector-label">Type</span>
          <span className="co-inspector-value" style={{ textTransform: "capitalize" }}>
            {isDir ? "Directory" : node.extension ? `.${node.extension} File` : "File"}
          </span>
        </div>

        {/* Full path */}
        <div className="co-inspector-row">
          <span className="co-inspector-label">Path</span>
          <span className="co-inspector-value-mono">{node.path}</span>
        </div>

        {/* Depth */}
        <div className="co-inspector-row">
          <span className="co-inspector-label">Depth</span>
          <span className="co-inspector-value">
            {node.depth === 0 ? "Root" : `Level ${node.depth}`}
          </span>
        </div>

        {/* File size (files only) */}
        {!isDir && (
          <div className="co-inspector-row">
            <span className="co-inspector-label">Size</span>
            <span className="co-inspector-value">
              {formatSize(node.sizeBytes)}
            </span>
          </div>
        )}

        {/* Last modified */}
        <div className="co-inspector-row">
          <span className="co-inspector-label">Modified</span>
          <span className="co-inspector-value">
            {formatDate(node.modified)}
          </span>
        </div>

        {/* Change count */}
        {node.changeCount > 0 && (
          <div className="co-inspector-row">
            <span className="co-inspector-label">Changes</span>
            <span className="co-inspector-value" style={{ color: "var(--cosmic-accent)" }}>
              {node.changeCount} recorded
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
