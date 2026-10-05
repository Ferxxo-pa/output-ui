import { useEffect, useRef, useState } from "react";
import { DraftPanel } from "./DraftPanel";
import { InboxPanel } from "./InboxPanel";
import { JobCard } from "./JobCard";
import { ShopPanel } from "./ShopPanel";
import type { OutputController } from "./useOutput";

export function OutputWidget({ controller }: { controller: OutputController }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { mode, snapshot, panel, collapsed, selection, selectedJob, status, notices } = view(controller);

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

  function pick() {
    fileRef.current?.click();
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
      <div className="notices" aria-live="polite">
        {notices.map((notice) => (
          <div className="notice" key={notice.id}>
            <button type="button" className="notice-open" onClick={() => controller.openNotice(notice)}>
              {notice.text}
            </button>
            <button type="button" onClick={() => void controller.dismissNotice(notice.id)} aria-label="Dismiss notification">
              Dismiss
            </button>
          </div>
        ))}
      </div>
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
        {mode === "fixture" && <span className="demo-mark">Demo</span>}
        {!collapsed && (
          <span className="status" role="status">
            {status}
          </span>
        )}
        {!collapsed && (
          <button type="button" className="send" onClick={controller.openSend} aria-label="Send a job. SVG contour-cut decals, 5 MB maximum.">
            Send ↑
          </button>
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
      {snapshot?.banner && panel === "closed" && <p className="demo-banner">{snapshot.banner}</p>}
    </div>
  );
}

function view(controller: OutputController) {
  return {
    mode: controller.mode,
    snapshot: controller.snapshot,
    panel: controller.panel,
    collapsed: controller.collapsed,
    selection: controller.selection,
    selectedJob: controller.selectedJob,
    status: controller.status,
    notices: controller.snapshot?.notices ?? [],
  };
}
