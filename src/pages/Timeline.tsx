// Timeline page — Linear-inspired co-theme with vertical rail
// Layout/spacing: Tailwind. Colors/effects: co-* CSS classes.

import { useChanges } from "@/hooks/useObservatory";
import { Card, CardContent } from "@/components/ui/card";
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
      <div className="p-5 max-w-5xl mx-auto">
        <h2
          className="co-section-title co-animate-fade-in"
          style={{ fontSize: "var(--co-font-size-xl)", marginBottom: "20px" }}
        >
          Timeline
        </h2>
        <div className="flex items-center justify-center py-10">
          <p
            style={{ color: "var(--co-text-muted)" }}
            className="text-xs animate-pulse"
          >
            Loading changes...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div
        className="co-section-header co-animate-fade-in"
        style={{ padding: "0" }}
      >
        <div className="flex items-center gap-3">
          <Clock size={18} color="var(--co-accent)" />
          <h2
            className="co-section-title"
            style={{ fontSize: "var(--co-font-size-xl)" }}
          >
            Timeline
          </h2>
        </div>
        <span className="co-badge co-badge-secondary text-[10px] font-normal">
          {changes.length} entries
        </span>
      </div>

      {changes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14">
            <FileText
              size={30}
              color="var(--co-text-dim)"
              className="mb-3 opacity-30"
            />
            <p
              style={{ color: "var(--co-text-muted)" }}
              className="text-xs font-medium"
            >
              No changes recorded yet
            </p>
            <p
              style={{ color: "var(--co-text-dim)" }}
              className="text-[10px] mt-1"
            >
              File changes in your project will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[calc(100vh-140px)]">
              {changes.map((change) => (
                <TimelineEntry key={change.id} change={change} />
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
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
    <div className="co-timeline-entry group">
      {/* Vertical rail + dot (1px line, 6px dot) */}
      <div className="co-timeline-rail" />

      {/* Content */}
      <div className="co-timeline-body">
        <div className="co-timeline-file">
          <FileText
            size={12}
            color="var(--co-text-dim)"
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
            <span className="inline-flex items-center gap-1">
              <User size={10} color="var(--co-accent)" />
              {change.agent}
            </span>
          )}
          {change.commitHash && (
            <span className="inline-flex items-center gap-1 font-mono" style={{ fontSize: "var(--co-font-size-xs)" }}>
              <Hash size={10} color="var(--co-text-dim)" />
              <span
                className="px-1.5 py-0.5 rounded"
                style={{
                  background: "var(--co-bg-hover)",
                  fontSize: "9px",
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
