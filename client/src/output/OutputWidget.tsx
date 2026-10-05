import { useEffect, useRef, useState } from "react";
import { DraftPanel } from "./DraftPanel";
import { InboxPanel } from "./InboxPanel";
import { JobCard } from "./JobCard";
import { ShopPanel } from "./ShopPanel";
import type { Notice } from "./types";
import type { OutputController } from "./useOutput";

const SEEN_KEY = "output.seen.notices";

function seenIds(): Set<string> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function pingText(notice: Notice): string | null {
  if (notice.kind === "offer") return "+1 job request";
  if (notice.kind === "funded") return "+1 job";
  return null;
}

export function OutputWidget({ controller }: { controller: OutputController }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const seen = useRef(seenIds());
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { snapshot, panel, collapsed, selection, selectedJob, notices } = view(controller);
  const acceptCount = (snapshot?.jobs ?? []).filter((job) => job.phase === "offered" && !job.expired).length;

  useEffect(() => {
    if (panel === "closed") return;
    const frame = requestAnimationFrame(() => {
      document.getElementById("output-panel-title")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [panel, selection?.id, selection?.role]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (panel === "inbox") controller.closePanel();
      else if (panel !== "closed") controller.backToInbox();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, controller]);

  useEffect(() => {
    const fresh = notices.find((notice) => pingText(notice) && !seen.current.has(notice.id));
    if (!fresh) return;
    seen.current.add(fresh.id);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen.current)));
    setToast(pingText(fresh));
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notices]);

  function pick() {
    fileRef.current?.click();
  }

  function openList() {
    setToast(null);
    controller.openInbox();
  }

  return (
    <div
      className={`output-anchor${panel !== "closed" ? " open" : ""}${dragging ? " dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void controller.takeFile(file);
      }}
    >
      {toast && (
        <button type="button" className="toast" onClick={openList}>
          {toast}
        </button>
      )}
      {dragging && <p className="drop-hint">Drop an SVG to start a job. Cutline required, 5 MB max.</p>}
      {panel === "inbox" && <InboxPanel controller={controller} />}
      {panel === "draft" && <DraftPanel controller={controller} onPick={pick} />}
      {panel === "shop" && <ShopPanel controller={controller} />}
      {panel === "job" && selectedJob && selection && (
        <JobCard key={`${selectedJob.id}-${selection.role}`} controller={controller} job={selectedJob} role={selection.role} />
      )}
      {panel === "job" && !selectedJob && (
        <section className="output-panel">
          <h2 id="output-panel-title" tabIndex={-1}>
            Job
          </h2>
          <p>That job is not on this list.</p>
          <button type="button" onClick={controller.backToInbox}>
            Inbox
          </button>
        </section>
      )}
      <div className={`output-strip${collapsed ? " collapsed" : ""}`}>
        <button
          type="button"
          className="mark"
          aria-expanded={panel !== "closed"}
          aria-label={panel === "closed" ? "Open job inbox" : "Close OUTPUT"}
          onClick={controller.openOutput}
        >
          OUTPUT
        </button>
        {!collapsed && (
          <span className="strip-actions">
            {acceptCount > 0 && (
              <button type="button" className="ping" onClick={openList} aria-label={`${acceptCount} to accept`}>
                +{acceptCount}
              </button>
            )}
            <button type="button" className="send" onClick={controller.openSend} aria-label="Send a job. SVG contour-cut decals, 5 MB maximum.">
              Send ↑
            </button>
          </span>
        )}
        <button
          type="button"
          className="fold"
          aria-label={collapsed ? "Expand" : "Collapse"}
          onClick={controller.toggleCollapsed}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>
      <input
        ref={fileRef}
        className="file-input"
        type="file"
        accept=".svg,image/svg+xml"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void controller.takeFile(file);
        }}
      />
    </div>
  );
}

function view(controller: OutputController) {
  return {
    snapshot: controller.snapshot,
    panel: controller.panel,
    collapsed: controller.collapsed,
    selection: controller.selection,
    selectedJob: controller.selectedJob,
    notices: controller.snapshot?.notices ?? [],
  };
}
