import { z } from "zod";

// Gear that's out of service: damaged and waiting for repair, or lost. Units
// with asset tags carry this in their status (maintenance or lost). Gear
// tracked by quantity has open records instead, each for some number of items.

export const GEAR_ISSUE_KINDS = ["repair", "lost"] as const;
export type GearIssueKind = (typeof GEAR_ISSUE_KINDS)[number];

export const GEAR_ISSUE_KIND_LABELS: Record<GearIssueKind, string> = {
  repair: "In repair",
  lost: "Lost",
};

// Open repair and lost counts for one piece of equipment tracked by quantity.
export type IssueCounts = Record<GearIssueKind, number>;

export const GEAR_RESOLUTIONS = ["repaired", "found", "written_off"] as const;
export type GearResolution = (typeof GEAR_RESOLUTIONS)[number];

export const GEAR_RESOLUTION_LABELS: Record<GearResolution, string> = {
  repaired: "Repaired",
  found: "Found",
  written_off: "Write off",
};

// Repaired and found gear goes back in stock. Written off gear leaves it for good.
export const RESOLUTIONS_BY_KIND: Record<GearIssueKind, readonly GearResolution[]> = {
  repair: ["repaired", "written_off"],
  lost: ["found", "written_off"],
};

/** One line on the Lost and repair list: a unit, or a count of gear tracked by quantity. */
export interface OutOfServiceEntry {
  // Unique across both kinds of entry, like "unit-4" or "issue-7".
  key: string;
  kind: GearIssueKind;
  equipmentId: number;
  sku: string;
  brand: string;
  model: string;
  // Set for units with asset tags.
  unit: { id: number; assetTag: string } | null;
  // Set for gear tracked by quantity.
  issueId: number | null;
  quantity: number;
  // The booking it came back damaged from or went missing on, if any.
  booking: { id: number; customerName: string } | null;
  // When it was reported, if known. Units changed by hand only have their last update.
  since: string;
  notes: string | null;
}

const notes = z
  .string()
  .trim()
  .max(2000, "Notes must be at most 2000 characters")
  .nullish()
  .transform((v) => v || null);

const quantity = z.coerce
  .number()
  .int("Quantity must be a whole number")
  .min(1, "Quantity must be at least 1")
  .max(100_000, "Quantity is too large");

/** Reports gear tracked by quantity as damaged or lost, outside of a booking. */
export const reportIssueSchema = z.object({ kind: z.enum(GEAR_ISSUE_KINDS), quantity, notes });
export type ReportIssueInput = z.input<typeof reportIssueSchema>;
export type ReportIssueData = z.output<typeof reportIssueSchema>;

/** Settles some or all of an open record. */
export const resolveIssueSchema = z.object({ resolution: z.enum(GEAR_RESOLUTIONS), quantity });
export type ResolveIssueInput = z.input<typeof resolveIssueSchema>;
export type ResolveIssueData = z.output<typeof resolveIssueSchema>;

/** Settles a unit that's in maintenance or lost. */
export const resolveUnitSchema = z.object({ resolution: z.enum(GEAR_RESOLUTIONS) });
export type ResolveUnitData = z.output<typeof resolveUnitSchema>;
