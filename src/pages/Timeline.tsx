// Timeline page - chronological list of all changes

import { useChanges } from "@/hooks/useObservatory";
import { Card, CardContent, Badge } from "@/components/ui/base";
import type { ChangeRecord } from "@/lib/types";
import { formatTimestamp, getChangeKindColor, getFileName } from "@/lib/utils";
import { FileText, User, Hash } from "lucide-react";

interface TimelinePageProps {
  projectPath: string;
}

export function TimelinePage({ projectPath }: TimelinePageProps) {
  const { changes, loading } = useChanges(projectPath, 2000);

  if (loading && changes.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Timeline</h2>
        <p className="text-sm text-muted-foreground">Loading changes...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Timeline</h2>
        <span className="text-xs text-muted-foreground">{changes.length} entries</span>
      </div>

      {changes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText size={32} className="mx-auto mb-2 opacity-40" />
            <p>No changes recorded yet</p>
            <p className="text-xs mt-1">File changes in your project will appear here</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {changes.map((change) => (
                <TimelineEntry key={change.id} change={change} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TimelineEntry({ change }: { change: ChangeRecord }) {
  return (
    <div className="flex gap-4 px-4 py-3 hover:bg-accent/30 transition-colors">
      {/* Kind badge */}
      <div className="shrink-0 pt-0.5">
        <Badge className={getChangeKindColor(change.kind)}>
          {change.kind}
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">
            {getFileName(change.relativePath)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {change.relativePath}
        </div>
        {change.summary && (
          <p className="text-xs text-muted-foreground line-clamp-2">{change.summary}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
          {change.agent && (
            <span className="flex items-center gap-1">
              <User size={12} />
              {change.agent}
            </span>
          )}
          {change.commitHash && (
            <span className="flex items-center gap-1 font-mono">
              <Hash size={12} />
              {change.commitHash.slice(0, 7)}
            </span>
          )}
          <span>{formatTimestamp(change.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
