// Dashboard page — co-theme design system
// Layout/spacing: Tailwind. Colors/effects: co-* CSS classes.
// No framer-motion; animated with co-animate-* and co-stagger.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChanges, useWatcher } from "@/hooks/useObservatory";
import type { ChangeRecord } from "@/lib/types";
import { getFileName, relativeTime, cn } from "@/lib/utils";
import {
  FileText,
  GitCommit,
  Clock,
  AlertCircle,
  Activity,
  TrendingUp,
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
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Page title */}
      <div className="co-section-header co-animate-fade-in" style={{ padding: "0" }}>
        <div className="flex items-center gap-3">
          <Activity size={22} color="var(--co-accent)" />
          <h2 className="co-section-title" style={{ fontSize: "20px" }}>Dashboard</h2>
        </div>
      </div>

      {/* Stats cards */}
      <div className="co-stat-grid co-stagger">
        {stats.total > 0 || loading ? (
          <>
            <StatCard
              icon={<GitCommit size={20} />}
              label="Total Changes"
              value={stats.total}
              color="blue"
            />
            <StatCard
              icon={<FileText size={20} />}
              label="Files Tracked"
              value={stats.uniqueFiles}
              color="green"
            />
            <StatCard
              icon={<Clock size={20} />}
              label="Watcher"
              value={status?.running ? "Active" : "Idle"}
              color={status?.running ? "green" : "purple"}
              valueStyle={status?.running ? { color: "var(--co-success)" } : { color: "var(--co-text-muted)" }}
              trend={status?.running ? "up" : "down"}
            />
            <StatCard
              icon={<AlertCircle size={20} />}
              label="Detected"
              value={String(status?.changesDetected ?? 0)}
              color="amber"
            />
          </>
        ) : null}
      </div>

      {/* Recent changes */}
      <div className="co-animate-fade-in">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={16} color="var(--co-text-muted)" />
              Recent Changes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[420px]">
              {loading && changes.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p style={{ color: "var(--co-text-muted)" }} className="text-sm animate-pulse">
                    Loading...
                  </p>
                </div>
              ) : recentChanges.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <FileText
                    size={28}
                    color="var(--co-text-dim)"
                    className="mb-3 opacity-30"
                  />
                  <p style={{ color: "var(--co-text-muted)" }} className="text-sm">
                    No changes recorded yet
                  </p>
                  <p style={{ color: "var(--co-text-dim)" }} className="text-xs mt-1">
                    Start editing files in your project
                  </p>
                </div>
              ) : (
                <div className="co-stagger divide-y" style={{ borderColor: "var(--co-border)" }}>
                  {recentChanges.map((change) => (
                    <ChangeRow key={change.id} change={change} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  trend,
  valueStyle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: "blue" | "green" | "amber" | "purple";
  trend?: "up" | "down" | null;
  valueStyle?: React.CSSProperties;
}) {
  const iconClass = cn("co-stat-icon", `co-stat-icon-${color}`);

  return (
    <div className="co-stat-card">
      <div className={iconClass}>{icon}</div>
      <div className="min-w-0">
        <p className="co-stat-value" style={valueStyle}>
          {value}
        </p>
        <p className="co-stat-label">{label}</p>
      </div>
      {trend && (
        <div className="ml-auto">
          <span
            className={cn(
              "h-2 w-2 rounded-full inline-block",
              trend === "up" ? "co-status-dot-online" : "co-status-dot-offline"
            )}
          />
        </div>
      )}
    </div>
  );
}

function ChangeRow({ change }: { change: ChangeRecord }) {
  const kindBadge: Record<string, string> = {
    created: "co-badge co-badge-success",
    modified: "co-badge co-badge-default",
    deleted: "co-badge co-badge-danger",
  };

  return (
    <div className="co-change-item">
      <span className={cn("text-[10px] font-medium shrink-0", kindBadge[change.kind] || "co-badge co-badge-secondary")}>
        {change.kind}
      </span>
      <span className="co-change-file flex-1 truncate">
        {getFileName(change.relativePath)}
      </span>
      {change.agent && (
        <span className="co-badge co-badge-secondary text-[10px] font-normal shrink-0">
          {change.agent}
        </span>
      )}
      <span className="co-change-time shrink-0">
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
