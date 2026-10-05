import { formatSize, materialLine } from "./format";
import type { Job } from "./types";
import type { OutputController } from "./useOutput";

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function InboxPanel({ controller }: { controller: OutputController }) {
  const { snapshot, loadError, openJob, openShop, closePanel, reload } = controller;
  const jobs = (snapshot?.jobs ?? []).filter((job) => job.phase === "offered" && !job.expired);

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
      {loadError && (
        <div className="err" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}
      {jobs.length === 0 && <p className="fine">No jobs to accept.</p>}
      <ul className="job-list">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobRow job={job} onOpen={() => openJob(job.id, "producing")} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function JobRow({ job, onOpen }: { job: Job; onOpen: () => void }) {
  return (
    <button type="button" className="job-row" onClick={onOpen}>
      <span className="job-copy">
        <span>You're producing</span>
        <span>
          {materialLine(job.laminate)} · {formatSize(job.widthIn, job.heightIn)}
        </span>
      </span>
      <span className="make">
        <strong>{money(job.payoutCents)}</strong>
        <small>USDC</small>
      </span>
    </button>
  );
}
