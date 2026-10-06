import type { ClockSource } from "@shared/schema";

/**
 * Clock adapters — I/O doesn't care who owns the shift.
 * Local: you tap the strip.
 */
export interface ShiftSnapshot {
  clockedIn: boolean;
  externalShiftId: string | null;
  employeeName?: string;
}

export interface ClockAdapter {
  readonly source: ClockSource;
  clockIn(): Promise<ShiftSnapshot>;
  clockOut(): Promise<ShiftSnapshot>;
  getStatus(): Promise<ShiftSnapshot>;
}

export class LocalClockAdapter implements ClockAdapter {
  readonly source = "local" as const;
  private shiftId: string | null = null;
  private clockedIn = false;

  async clockIn(): Promise<ShiftSnapshot> {
    this.clockedIn = true;
    this.shiftId = `local_${Date.now()}`;
    return this.snapshot();
  }

  async clockOut(): Promise<ShiftSnapshot> {
    this.clockedIn = false;
    this.shiftId = null;
    return this.snapshot();
  }

  async getStatus(): Promise<ShiftSnapshot> {
    return this.snapshot();
  }

  private snapshot(): ShiftSnapshot {
    return {
      clockedIn: this.clockedIn,
      externalShiftId: this.shiftId,
    };
  }
}

export function createClockAdapter(_source: ClockSource): ClockAdapter {
  return new LocalClockAdapter();
}
