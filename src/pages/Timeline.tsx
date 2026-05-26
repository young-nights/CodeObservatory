// Timeline — 1px rail · 5px dot · monospace timestamps
// Design: Precision Instrument

import { useChanges } from "@/hooks/useObservatory";
import type { ChangeRecord } from "@/lib/types";
import { formatTimestamp, getFileName, cn } from "@/lib/utils";
import { FileText, User, Hash } from "lucide-react";

interface TimelinePageProps {
  projectPath: string;
}

export function TimelinePage({ projectPath }: TimelinePageProps) {
  const { changes, loading } = useChanges(projectPath, 2000);

  return (
    <div style={{ padding: "var(--co-space-5)", maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div
        className="co-section-header co-animate-fade-in"
        style={{ padding: "0 0 var(--co-space-4) 0" }}
      >
        <h2 className="co-section-title">Timeline</h2>
        <span
          style={{
            fontSize: "var(--co-font-size-xs)",
            color: "var(--co-text-muted)",
            fontFamily: "var(--co-font-mono)",
          }}
        >
          {changes.length} entries
        </span>
      </div>

      {loading && changes.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--co-space-8) 0",
          }}
        >
          <p style={{ color: "var(--co-text-muted)", fontSize: "var(--co-font-size-xs)" }}>
            Loading changes...
          </p>
        </div>
      ) : changes.length === 0 ? (
        <div style={{ paddingTop: "var(--co-space-8)" }}>
          <div className="co-empty-state" style={{ height: "auto" }}>
            <div className="co-empty-icon">
              <FileText size={28} style={{ color: "var(--co-text-dim)" }} />
            </div>
            <p className="co-empty-text">No changes recorded yet</p>
          </div>
        </div>
      ) : (
        <div className="co-animate-fade-in co-stagger">
          {changes.map((change) => (
            <TimelineEntry key={change.id} change={change} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineEntry({ change }: { change: ChangeRecord }) {
  const kindClass: Record<string, string> = {
    created: "co-timeline-kind-created",
    modified: "co-timeline-kind-modified",
    deleted: "co-timeline-kind-deleted",
  };

  return (
    <div className="co-timeline-entry">
      {/* Rail + 5px dot */}
      <div className="co-timeline-rail" />

      {/* Content */}
      <div className="co-timeline-body">
        <div className="co-timeline-file">
          <FileText
            size={11}
            style={{ color: "var(--co-text-dim)" }}
            className="shrink-0"
          />
          <span className="co-timeline-file-name">
            {getFileName(change.relativePath)}
          </span>
        </div>

        <div className="co-timeline-file-path">
          {change.relativePath}
        </div>

        {change.summary && (
          <div className="co-timeline-summary">{change.summary}</div>
        )}

        <div className="co-timeline-meta">
          <span
            className={cn(
              "co-timeline-kind",
              kindClass[change.kind] || "co-timeline-kind-modified"
            )}
          >
            {change.kind}
          </span>

          {change.agent && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <User size={10} style={{ color: "var(--co-text-muted)" }} />
              {change.agent}
            </span>
          )}
          {change.commitHash && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <Hash size={10} style={{ color: "var(--co-text-dim)" }} />
              <span
                className="font-mono"
                style={{
                  fontSize: "9px",
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: "var(--co-bg-hover)",
                }}
              >
                {change.commitHash.slice(0, 7)}
              </span>
            </span>
          )}
          <span className="co-timeline-meta-time">
            {formatTimestamp(change.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}
