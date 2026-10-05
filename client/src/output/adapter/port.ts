import type { AvailabilityPatch, CompletionPhoto, QuoteInput, QuoteResult, Snapshot } from "../types";

/**
 * Frontend port onto OUTPUT.
 * `fixture` is an explicit demo. `live` must call Ez Ink's backend and must not
 * fall back to the fixture when a real request fails.
 */
export type MutationResult = {
  snapshot: Snapshot;
  committed: boolean;
  jobId?: string;
  message?: string;
  shopHint?: boolean;
};

export type ProductionFile = {
  fileName: string;
  svgText: string;
};

export type OutputPort = {
  mode: "fixture" | "live";
  loadSnapshot(): Promise<Snapshot>;
  quote(input: QuoteInput): Promise<QuoteResult>;
  requestProduction(input: QuoteInput, opId: string): Promise<MutationResult>;
  acceptOffer(jobId: string, opId: string): Promise<MutationResult>;
  passOffer(jobId: string, opId: string): Promise<MutationResult>;
  fundJob(jobId: string, opId: string): Promise<MutationResult>;
  productionFile(jobId: string): Promise<ProductionFile>;
  markDownloaded(jobId: string, opId: string): Promise<MutationResult>;
  submitCompletion(jobId: string, photo: CompletionPhoto, opId: string): Promise<MutationResult>;
  approveAndRelease(jobId: string, opId: string): Promise<MutationResult>;
  reportIssue(jobId: string, note: string, opId: string): Promise<MutationResult>;
  reviseTerms(jobId: string, input: QuoteInput, opId: string): Promise<MutationResult>;
  confirmShop(opId: string): Promise<MutationResult>;
  updateAvailability(patch: AvailabilityPatch, opId: string): Promise<MutationResult>;
  confirmAvailability(opId: string): Promise<MutationResult>;
  confirmPayout(opId: string): Promise<MutationResult>;
  dismissNotice(noticeId: string): Promise<MutationResult>;
};
