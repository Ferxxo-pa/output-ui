# What Ez Ink needs to connect

`ezdesigns/output` was not readable from this environment (GitHub returned 404). No live route is called. The UI talks only through `OutputPort` in `adapter/port.ts`.

Leave `VITE_OUTPUT_API_BASE` unset and the app uses `adapter/fixture.ts`. The screen says **Demo data—no orders sent or money moved.** Fixture state stays in `localStorage` key `output.demo.fixture.v1`. It is not a second production backend and it does not touch I/O's server.

Set `VITE_OUTPUT_API_BASE` and the app uses `adapter/live.ts`. Every operation throws `OutputOperationError` and the fixture is not used as a fallback. Wire the real contract in `live.ts` only. Do not report success from the client before the backend confirms it.

Client SVG checks in `svg/inspect.ts` are a safety gate so untrusted markup is never inserted into the page. The backend still has to revalidate the file, the offer, and capacity.

## Operations

Each mutation takes an `opId`. A repeat of the same id must return the original result and must not reserve twice, charge twice, or release twice.

- `loadSnapshot` — unresolved jobs for this install's shop and requester. Do not create a shop because the app was opened on another computer.
- `quoteProduction` — one recommendation, or a specific constraint. No offer, no charge. Pickup only until delivery is actually supported. Do not promise delivery when the result is ready-for-pickup.
- `requestProduction` — create the offer after revalidating the SVG, cutline, size, material, deadline, and shop capacity. Uploading or requesting must not take payment.
- `acceptOffer` — revalidate the offer and reserve capacity on the server. Frontend state is not a reservation. Reject when the offer expired or capacity changed, and do not reserve.
- `passOffer` — decline the offer. Do not reserve.
- `fundJob` — requester funding after acceptance. Return pending, rejected, or confirmed. Do not mark the job funded or paid on a rejected or pending payment.
- `productionFile` — approved file only after funding is confirmed.
- `markDownloaded` — record a download. Do not treat it as printed or complete.
- `submitCompletion` — store the completion photo and move the same job to review.
- `approveAndRelease` — settle only from completion review. This is the only path that may show Paid.
- `reportIssue` — keep the job open. Do not settle.
- `reviseTerms` — price, deadline, artwork, or fulfillment changes require a new acceptance. Do not change a funded job in place.
- `confirmShop` — attach this install to the existing shop record. Do not register a new shop or add capacity.
- `updateAvailability` — receive on/off, vinyl, laminate, available-after. Pausing stops new offers and does not cancel accepted work. Do not ask the operator to subtract reservations; return available and reserved amounts.
- `confirmAvailability` — refresh the capacity timestamp. Connected is not the same as fresh or stocked.
- `confirmPayout` — existing payout account. Do not accept a wallet secret from the browser.
- `dismissNotice` — hide one notification. Do not delete the job.

Currency for the pilot is USDC on devnet. Devnet or simulated labels have to stay visible. Do not describe a simulated transfer as an on-chain settlement.
