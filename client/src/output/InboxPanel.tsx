import { formatSize, formatUsdc, groupJobs, phaseLabel, roleLabel } from "./format";
import type { Job, Role } from "./types";
import type { OutputController } from "./useOutput";

function JobButton({
  job,
  role,
  onOpen,
}: {
  job: Job;
  role: Role;
  onOpen: () => void;
}) {
  const amount = rowAmount(job, role);
  return (
    <button type="button" className="job-row" onClick={onOpen}>
      <span className="job-copy">
        <span>{roleLabel(role)}</span>
        <span>
          {job.quantity} · {formatSize(job.widthIn, job.heightIn)} · {phaseLabel(job, role)}
        </span>
      </span>
      {amount && <span className={amount.tone}>{amount.text}</span>}
    </button>
  );
}

function rowAmount(job: Job, role: Role): { text: string; tone: "make" | "owe" } | null {
  if (role === "producing") {
    if (job.phase === "passed" || (job.expired && job.phase === "offered")) return null;
    return { text: formatUsdc(job.payoutCents), tone: "make" };
  }
  if (job.phase === "accepted" || job.phase === "funding_pending" || job.phase === "completion_submitted") {
    return { text: formatUsdc(job.priceCents), tone: "owe" };
  }
  return null;
}

export function InboxPanel({ controller }: { controller: OutputController }) {
  const { snapshot, loadError, openJob, openShop, closePanel, reload } = controller;
  const groups = groupJobs(snapshot?.jobs ?? []);

  return (
    <section className="output-panel" aria-labelledby="output-panel-title">
      <header className="panel-head">
        <h2 id="output-panel-title" tabIndex={-1}>
          Jobs
        </h2>
        <span className="head-actions">
          <button type="button" onClick={openShop}>
            Shop
          </button>
          <button type="button" onClick={closePanel}>
            Close
          </button>
        </span>
      </header>
      {snapshot?.banner && <p className="demo-banner">{snapshot.banner}</p>}
      {loadError && (
        <div className="err" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}
      <h3>Needs you</h3>
      {groups.needs.length === 0 && <p className="fine">Nothing needs you.</p>}
      <ul className="job-list">
        {groups.needs.map((card) => (
          <li key={`${card.job.id}-${card.role}`}>
            <JobButton job={card.job} role={card.role} onOpen={() => openJob(card.job.id, card.role)} />
          </li>
        ))}
      </ul>
      <h3>In progress</h3>
      {groups.progress.length === 0 && <p className="fine">Nothing in progress.</p>}
      <ul className="job-list">
        {groups.progress.map((card) => (
          <li key={`${card.job.id}-${card.role}`}>
            <JobButton job={card.job} role={card.role} onOpen={() => openJob(card.job.id, card.role)} />
          </li>
        ))}
      </ul>
      <details className="done">
        <summary>Completed · {groups.done.length}</summary>
        {groups.done.length === 0 && <p className="fine">Nothing completed.</p>}
        <ul className="job-list">
          {groups.done.map((card) => (
            <li key={`${card.job.id}-${card.role}`}>
              <JobButton job={card.job} role={card.role} onOpen={() => openJob(card.job.id, card.role)} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
