// Timeline page — co-theme design system
// Layout/spacing: Tailwind. Colors/effects: co-* CSS classes.
// No framer-motion; animated with co-animate-* and co-stagger.

import { useChanges } from "@/hooks/useObservatory";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChangeRecord } from "@/lib/types";
import { formatTimestamp, getFileName, cn } from "@/lib/utils";
import { FileText, User, Hash, Clock } from "lucide-react";

interface TimelinePageProps {
  projectPath: string;
}

export function TimelinePage({ projectPath }: TimelinePageProps) {
  const { changes, loading } = useChanges(projectPath, 2000);

  if (loading && changes.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h2 className="co-section-title co-animate-fade-in" style={{ fontSize: "20px", marginBottom: "24px" }}>
          Timeline
        </h2>
        <div className="flex items-center justify-center py-12">
          <p style={{ color: "var(--co-text-muted)" }} className="text-sm animate-pulse">
            Loading changes...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="co-section-header co-animate-fade-in" style={{ padding: "0" }}>
        <div className="flex items-center gap-3">
          <Clock size={22} color="var(--co-accent)" />
          <h2 className="co-section-title" style={{ fontSize: "20px" }}>Timeline</h2>
        </div>
        <span className="co-badge co-badge-secondary text-xs font-normal">
          {changes.length} entries
        </span>
      </div>

      {changes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText
              size={36}
              color="var(--co-text-dim)"
              className="mb-3 opacity-30"
            />
            <p style={{ color: "var(--co-text-muted)" }} className="text-sm font-medium">
              No changes recorded yet
            </p>
            <p style={{ color: "var(--co-text-dim)" }} className="text-xs mt-1">
              File changes in your project will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[calc(100vh-160px)]">
              <div className="co-stagger divide-y" style={{ borderColor: "var(--co-border)" }}>
                {changes.map((change) => (
                  <TimelineEntry key={change.id} change={change} />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TimelineEntry({ change }: { change: ChangeRecord }) {
  const kindBadge: Record<string, string> = {
    created: "co-badge co-badge-success border",
    modified: "co-badge co-badge-default border",
    deleted: "co-badge co-badge-danger border",
  };

  return (
    <div className="co-change-item group" style={{ cursor: "default", borderColor: "var(--co-border)" }}>
      {/* Kind badge */}
      <div className="shrink-0 pt-0.5">
        <span className={cn(
          "text-[10px] font-medium px-2 py-0.5 capitalize",
          kindBadge[change.kind] || "co-badge co-badge-secondary border"
        )}
        style={{ borderColor: "var(--co-border)" }}>
          {change.kind}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5 ml-4">
        <div className="flex items-center gap-2">
          <FileText
            size={14}
            color="var(--co-text-dim)"
            className="shrink-0 group-hover:text-foreground transition-colors"
          />
          <span className="text-sm font-medium truncate" style={{ color: "var(--co-text)" }}>
            {getFileName(change.relativePath)}
          </span>
        </div>

        <div className="text-xs truncate font-mono" style={{ color: "var(--co-text-muted)" }}>
          {change.relativePath}
        </div>

        {change.summary && (
          <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: "var(--co-text-muted)" }}>
            {change.summary}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs pt-1" style={{ color: "var(--co-text-dim)" }}>
          {change.agent && (
            <span className="inline-flex items-center gap-1">
              <User size={11} color="var(--co-accent)" />
              {change.agent}
            </span>
          )}
          {change.commitHash && (
            <span className="inline-flex items-center gap-1 font-mono text-[11px]">
              <Hash size={11} color="var(--co-text-dim)" />
              <span
                className="px-1.5 py-0.5 rounded text-[10px]"
                style={{ background: "var(--co-bg-hover)" }}
              >
                {change.commitHash.slice(0, 7)}
              </span>
            </span>
          )}
          <span className="co-change-time">
            {formatTimestamp(change.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}
