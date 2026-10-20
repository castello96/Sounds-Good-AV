import { z } from "zod";
import { MAX_ITEM_QUANTITY } from "./bookings";

// Request schemas for packing gear out and checking it back in. Packing and
// leaving are one step for now: a packed unit is out.

const assetTag = z
  .string()
  .trim()
  .min(1, "Enter an asset tag")
  .max(50, "Asset tags are at most 50 characters")
  .transform((v) => v.toUpperCase());

const notes = z
  .string()
  .trim()
  .max(2000, "Notes must be at most 2000 characters")
  .nullish()
  .transform((v) => v || null);

export const packUnitSchema = z.object({ assetTag });
export type PackUnitInput = z.input<typeof packUnitSchema>;

/** A unit that could be packed for a booking, suggested while typing a tag. */
export interface PackableUnit {
  assetTag: string;
  equipmentId: number;
}

export const returnUnitSchema = z.object({
  assetTag,
  notes,
  // Sends the unit to maintenance instead of back on the shelf.
  needsRepair: z.boolean().default(false),
});
export type ReturnUnitInput = z.input<typeof returnUnitSchema>;
export type ReturnUnitData = z.output<typeof returnUnitSchema>;

export const lostUnitSchema = z.object({ notes });
export type LostUnitData = z.output<typeof lostUnitSchema>;

const count = (label: string) =>
  z.coerce
    .number()
    .int(`${label} must be a whole number`)
    .min(0, `${label} can't be negative`)
    .max(MAX_ITEM_QUANTITY, `${label} is too large`)
    .optional();

/**
 * Counts for gear tracked by quantity. Any left out stay as they are. Damaged
 * gear came back, so it's counted in `returned` too, and goes to repair. Notes
 * go on the repair and lost records.
 */
export const itemCountsSchema = z.object({
  out: count("Out"),
  returned: count("Back"),
  damaged: count("Repair"),
  lost: count("Lost"),
  notes,
});
export type ItemCountsInput = z.input<typeof itemCountsSchema>;
export type ItemCountsData = z.output<typeof itemCountsSchema>;
