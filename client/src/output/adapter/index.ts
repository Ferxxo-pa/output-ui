import { createFixturePort } from "./fixture";
import { createLiveAdapter } from "./live";
import type { OutputPort } from "./port";

export type { MutationResult, OutputPort, ProductionFile } from "./port";

/** Fixture unless a live base is configured. A configured base never falls back to demo data. */
export function createOutputPort(): OutputPort {
  const base = String(import.meta.env.VITE_OUTPUT_API_BASE ?? "").trim();
  if (base) return createLiveAdapter(base);
  return createFixturePort();
}
