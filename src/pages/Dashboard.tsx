// Dashboard page - overview of project status

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/base";
import { useChanges, useWatcher } from "@/hooks/useObservatory";
import type { ChangeRecord } from "@/lib/types";
import { getChangeKindColor, getFileName, relativeTime } from "@/lib/utils";
import { FileText, GitCommit, Clock, AlertCircle } from "lucide-react";

interface DashboardPageProps {
  projectPath: string;
}

export function DashboardPage({ projectPath }: DashboardPageProps) {
  const { changes, loading } = useChanges(projectPath);
  const status = useWatcher();

  const recentChanges = changes.slice(0, 10);

  const stats = computeStats(changes);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold">Dashboard</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<GitCommit size={20} />}
          label="Total Changes"
          value={stats.total}
        />
        <StatCard
          icon={<FileText size={20} />}
          label="Files Tracked"
          value={stats.uniqueFiles}
        />
        <StatCard
          icon={<Clock size={20} />}
          label="Watcher"
          value={status?.running ? "Active" : "Idle"}
        />
        <StatCard
          icon={<AlertCircle size={20} />}
          label="Changes Detected"
          value={String(status?.changesDetected ?? 0)}
        />
      </div>

      {/* Recent changes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Changes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && changes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : recentChanges.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No changes recorded yet. Start editing files in your project.
            </p>
          ) : (
            <div className="space-y-1">
              {recentChanges.map((change) => (
                <ChangeRow key={change.id} change={change} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ChangeRow({ change }: { change: ChangeRecord }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/50 transition-colors">
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded ${getChangeKindColor(change.kind)}`}
      >
        {change.kind}
      </span>
      <span className="text-sm flex-1 truncate">{getFileName(change.relativePath)}</span>
      {change.agent && (
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {change.agent}
        </span>
      )}
      <span className="text-xs text-muted-foreground shrink-0">
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
