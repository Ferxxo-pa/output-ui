import { OutputOperationError } from "./errors";
import type { OutputPort } from "./port";

const REFUSAL =
  "A live OUTPUT API base is configured, but this operation is not connected. The demo fixture was not used.";

function unavailable(operation: string, consequence: string): OutputOperationError {
  return new OutputOperationError(operation, `${REFUSAL} ${consequence}`);
}

/**
 * Fail closed. ezdesigns/output was not readable from this environment, so these
 * methods do not invent routes and do not report success.
 */
export function createLiveAdapter(_baseUrl: string): OutputPort {
  return {
    mode: "live",
    async loadSnapshot() {
      throw unavailable("loadSnapshot", "No jobs were loaded.");
    },
    async quote() {
      throw unavailable("quoteProduction", "No shop was recommended and no offer was sent.");
    },
    async requestProduction() {
      throw unavailable("requestProduction", "No offer was sent and no payment was created.");
    },
    async acceptOffer() {
      throw unavailable("acceptOffer", "Nothing was accepted and no capacity was reserved.");
    },
    async passOffer() {
      throw unavailable("passOffer", "The offer was not passed.");
    },
    async fundJob() {
      throw unavailable("fundJob", "No payment was sent.");
    },
    async productionFile() {
      throw unavailable("productionFile", "The production file was not downloaded.");
    },
    async markDownloaded() {
      throw unavailable("markDownloaded", "The job was not marked printed.");
    },
    async submitCompletion() {
      throw unavailable("submitCompletion", "The completion photo was not submitted.");
    },
    async approveAndRelease() {
      throw unavailable("approveAndRelease", "Nothing was marked paid and no funds were released.");
    },
    async reportIssue() {
      throw unavailable("reportIssue", "The issue was not submitted.");
    },
    async reviseTerms() {
      throw unavailable("reviseTerms", "The accepted terms were not changed.");
    },
    async confirmShop() {
      throw unavailable("confirmShop", "No shop was created or confirmed.");
    },
    async updateAvailability() {
      throw unavailable("updateAvailability", "Availability was not changed.");
    },
    async confirmAvailability() {
      throw unavailable("confirmAvailability", "Capacity was not confirmed.");
    },
    async confirmPayout() {
      throw unavailable("confirmPayout", "No payout account was connected and no secret was stored.");
    },
    async dismissNotice() {
      throw unavailable("dismissNotice", "The notification was not changed on the server.");
    },
  };
}
