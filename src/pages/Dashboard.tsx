// Dashboard — Precision Instrument
// serif stat numbers 32px · labels 10px uppercase · 3-column grid

import { useChanges, useWatcher } from "@/hooks/useObservatory";
import type { ChangeRecord } from "@/lib/types";
import { getFileName, relativeTime, cn } from "@/lib/utils";
import {
  FileText,
  GitCommit,
  Clock,
} from "lucide-react";

interface DashboardPageProps {
  projectPath: string;
}

export function DashboardPage({ projectPath }: DashboardPageProps) {
  const { changes, loading } = useChanges(projectPath);
  const status = useWatcher();
  const recentChanges = changes.slice(0, 15);
  const stats = computeStats(changes);

  return (
    <div style={{ padding: "var(--co-space-5)", maxWidth: 960, margin: "0 auto" }}>
      {/* Section header */}
      <div
        className="co-section-header co-animate-fade-in"
        style={{ padding: "0 0 var(--co-space-4) 0" }}
      >
        <h2 className="co-section-title">Dashboard</h2>
      </div>

      {/* Stats — 3-column grid, serif numbers */}
      {stats.total > 0 || loading ? (
        <div className="co-stat-grid co-stagger">
          <StatCard
            icon={<GitCommit size={16} />}
            label="Total Changes"
            value={stats.total}
            variant="default"
          />
          <StatCard
            icon={<FileText size={16} />}
            label="Files Tracked"
            value={stats.uniqueFiles}
            variant="success"
          />
          <StatCard
            icon={<Clock size={16} />}
            label="Watcher"
            value={status?.running ? "Active" : "Idle"}
            variant={status?.running ? "success" : "default"}
            valueStyle={{
              fontSize: "14px",
              fontFamily: "var(--co-font-sans)",
              color: status?.running ? "var(--co-success)" : "var(--co-text-muted)",
            }}
          />
        </div>
      ) : null}

      {/* Recent changes — compact, hover translateX(2px) */}
      <div className="co-animate-fade-in" style={{ marginTop: "var(--co-space-4)" }}>
        <div
          className="co-card"
          style={{ border: "none", background: "transparent" }}
        >
          {/* Header */}
          <div
            className="co-card-header"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "var(--co-space-2)",
            }}
          >
            <h3
              style={{
                fontFamily: "var(--co-font-serif)",
                fontSize: "var(--co-font-size-lg)",
                color: "var(--co-text)",
              }}
            >
              Recent Changes
            </h3>
          </div>

          {/* Content */}
          <div style={{ padding: 0 }}>
            {loading && changes.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "var(--co-space-8) 0",
                }}
              >
                <p
                  style={{ color: "var(--co-text-muted)", fontSize: "var(--co-font-size-xs)" }}
                >
                  Loading...
                </p>
              </div>
            ) : recentChanges.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "var(--co-space-8) 0",
                }}
              >
                <FileText
                  size={24}
                  style={{ color: "var(--co-text-dim)", opacity: 0.3, marginBottom: "var(--co-space-2)" }}
                />
                <p style={{ color: "var(--co-text-muted)", fontSize: "var(--co-font-size-xs)" }}>
                  No changes recorded yet
                </p>
              </div>
            ) : (
              <div
                className="co-stagger"
                style={{
                  borderTop: "1px solid var(--co-border)",
                }}
              >
                {recentChanges.map((change) => (
                  <ChangeRow key={change.id} change={change} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({
  icon,
  label,
  value,
  variant,
  valueStyle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  variant: "default" | "success" | "warning";
  valueStyle?: React.CSSProperties;
}) {
  const iconClass =
    variant === "success"
      ? "co-stat-icon-success"
      : variant === "warning"
        ? "co-stat-icon-warning"
        : "co-stat-icon-default";

  return (
    <div className="co-stat-card">
      <div className={cn("co-stat-icon", iconClass)}>{icon}</div>
      <div className="min-w-0">
        <p className="co-stat-value" style={valueStyle}>
          {value}
        </p>
        <p className="co-stat-label">{label}</p>
      </div>
    </div>
  );
}

/* ── Change Row — hover translateX(2px) ── */
function ChangeRow({ change }: { change: ChangeRecord }) {
  const kindRowClass = `co-change-row co-change-row-kind-${change.kind}`;
  const kindBadgeClass: Record<string, string> = {
    created: "co-badge co-badge-success",
    modified: "co-badge co-badge-default",
    deleted: "co-badge co-badge-danger",
  };

  return (
    <div className={kindRowClass}>
      <span
        className={cn(
          "text-[10px] font-medium shrink-0",
          kindBadgeClass[change.kind] || "co-badge co-badge-secondary"
        )}
      >
        {change.kind}
      </span>
      <span className="co-change-row-file">
        {getFileName(change.relativePath)}
      </span>
      {change.agent && (
        <span className="co-change-row-agent">{change.agent}</span>
      )}
      <span className="co-change-row-time">
        {relativeTime(change.timestamp)}
      </span>
    </div>
  );
}

function computeStats(changes: ChangeRecord[]) {
  const fileSet = new Set(changes.map((c) => c.relativePath));
  return {
    total: changes.length,
    uniqueFiles: fileSet.size,
  };
}
