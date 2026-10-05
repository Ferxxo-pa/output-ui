import { groupJobs, phaseLabel, roleLabel } from "./format";
import type { OutputController } from "./useOutput";

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
            <button type="button" className="job-row" onClick={() => openJob(card.job.id, card.role)}>
              <span>{roleLabel(card.role)}</span>
              <span>
                {card.job.quantity} contour-cut decals · {phaseLabel(card.job, card.role)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <h3>In progress</h3>
      {groups.progress.length === 0 && <p className="fine">Nothing in progress.</p>}
      <ul className="job-list">
        {groups.progress.map((card) => (
          <li key={`${card.job.id}-${card.role}`}>
            <button type="button" className="job-row" onClick={() => openJob(card.job.id, card.role)}>
              <span>{roleLabel(card.role)}</span>
              <span>
                {card.job.quantity} contour-cut decals · {phaseLabel(card.job, card.role)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <details className="done">
        <summary>Completed · {groups.done.length}</summary>
        {groups.done.length === 0 && <p className="fine">Nothing completed.</p>}
        <ul className="job-list">
          {groups.done.map((card) => (
            <li key={`${card.job.id}-${card.role}`}>
              <button type="button" className="job-row" onClick={() => openJob(card.job.id, card.role)}>
                <span>{roleLabel(card.role)}</span>
                <span>
                  {card.job.quantity} contour-cut decals · {phaseLabel(card.job, card.role)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
