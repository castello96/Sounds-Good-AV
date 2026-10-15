import { z } from "zod";
import type { IssueCounts } from "./gearIssues";

export const INVENTORY_STATUSES = ["active", "maintenance", "retired", "lost"] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export const INVENTORY_STATUS_LABELS: Record<InventoryStatus, string> = {
  active: "Active",
  maintenance: "Maintenance",
  retired: "Retired",
  lost: "Lost",
};

// How a piece of equipment is counted. See the equipment table in the schema.
export const EQUIPMENT_TRACKING = ["units", "quantity"] as const;
export type EquipmentTracking = (typeof EQUIPMENT_TRACKING)[number];

export const EQUIPMENT_TRACKING_LABELS: Record<EquipmentTracking, string> = {
  units: "Individual units with asset tags",
  quantity: "Quantity only, no asset tags",
};

// The most units that can be added in one go.
export const MAX_BULK_UNITS = 100;

const required = (label: string, max = 100) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

// Blank optional text is stored as null rather than "".
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((v) => v || null);

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .nullish()
  .or(z.literal(""))
  .transform((v) => v || null);

const id = z.number().int().positive();

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface CategorySummary {
  id: number;
  departmentId: number;
  name: string;
  tagPrefix: string;
  equipmentCount: number;
}

export interface DepartmentWithCategories {
  id: number;
  name: string;
  categories: CategorySummary[];
}

export type UnitCounts = Record<InventoryStatus, number>;

export interface TagRef {
  id: number;
  name: string;
}

export interface TagSummary extends TagRef {
  equipmentCount: number;
}

export interface EquipmentSummary {
  id: number;
  categoryId: number;
  categoryName: string;
  departmentId: number;
  departmentName: string;
  tagPrefix: string;
  sku: string;
  brand: string;
  model: string;
  tracking: EquipmentTracking;
  // Always 0 for equipment tracked by units; count its units instead.
  quantityOwned: number;
  unitCounts: UnitCounts;
  // Open repair and lost counts. Always 0 for equipment tracked by units; see unitCounts.
  issueCounts: IssueCounts;
  // Sorted by name.
  tags: TagRef[];
}

export interface InventoryUnit {
  id: number;
  equipmentId: number;
  assetTag: string;
  serialNumber: string | null;
  status: InventoryStatus;
  condition: string | null;
  notes: string | null;
  purchasedAt: string | null;
}

export interface EquipmentDetail extends EquipmentSummary {
  units: InventoryUnit[];
  // The next free asset tag in this category, e.g. MIC-007. Null when tracked by quantity.
  nextAssetTag: string | null;
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const departmentSchema = z.object({ name: required("Name") });
export type DepartmentInput = z.infer<typeof departmentSchema>;

const tagPrefix = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z][A-Z0-9]{1,5}$/, "Use 2 to 6 letters or numbers, starting with a letter"));

export const createCategorySchema = z.object({ departmentId: id, name: required("Name"), tagPrefix });
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// The most tags one piece of equipment can have.
export const MAX_EQUIPMENT_TAGS = 20;

export const tagSchema = z.object({ name: required("Name", 40) });
export type TagInput = z.infer<typeof tagSchema>;

export const equipmentSchema = z.object({
  categoryId: id,
  // Stored uppercase so "sm58" and "SM58" can't both exist.
  sku: required("SKU", 50).transform((v) => v.toUpperCase()),
  brand: required("Brand"),
  model: required("Model"),
  tracking: z.enum(EQUIPMENT_TRACKING).default("units"),
  quantityOwned: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity can't be negative")
    .max(100_000, "That's a lot. Use a quantity under 100,000")
    .default(0),
  tagIds: z
    .array(id)
    .max(MAX_EQUIPMENT_TAGS, `Use at most ${MAX_EQUIPMENT_TAGS} tags`)
    .default([])
    .transform((ids) => Array.from(new Set(ids))),
});
export type EquipmentInput = z.input<typeof equipmentSchema>;

export const updateEquipmentSchema = equipmentSchema.partial();
export type UpdateEquipmentInput = z.input<typeof updateEquipmentSchema>;

const unitFields = {
  serialNumber: optionalText(100),
  status: z.enum(INVENTORY_STATUSES),
  condition: optionalText(100),
  notes: optionalText(2000),
  purchasedAt: optionalDate,
};

const assetTag = required("Asset tag", 50).transform((v) => v.toUpperCase());

export const updateUnitSchema = z.object({ assetTag, ...unitFields }).partial();
export type UpdateUnitInput = z.input<typeof updateUnitSchema>;

/**
 * Adds one or more units. With a quantity above 1 the asset tag must end in a
 * number, which counts up: MIC-001, MIC-002, ... Serial numbers are unique per
 * unit, so they can only be given when adding a single unit.
 */
export const createUnitsSchema = z
  .object({
    assetTag,
    quantity: z.coerce
      .number()
      .int("Quantity must be a whole number")
      .min(1, "Quantity must be at least 1")
      .max(MAX_BULK_UNITS, `Add at most ${MAX_BULK_UNITS} units at a time`),
    ...unitFields,
    status: unitFields.status.default("active"),
  })
  .superRefine((v, ctx) => {
    if (v.quantity > 1 && !/\d$/.test(v.assetTag)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assetTag"],
        message: "To add several units, end the asset tag with a number, like MIC-001",
      });
    }
    if (v.quantity > 1 && v.serialNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serialNumber"],
        message: "Serial numbers can only be set when adding one unit",
      });
    }
  });
export type CreateUnitsInput = z.input<typeof createUnitsSchema>;

/** MIC-009 with a count of 3 gives MIC-009, MIC-010, MIC-011. Keeps zero padding. */
export function sequentialAssetTags(start: string, count: number): string[] {
  if (count === 1) return [start];
  const match = /^(.*?)(\d+)$/.exec(start);
  if (!match) throw new Error("Asset tag must end in a number");
  const [, prefix, digits] = match;
  const first = Number(digits);
  return Array.from({ length: count }, (_, i) => prefix + String(first + i).padStart(digits.length, "0"));
}

/** Uppercases text into a code of letters, digits and dots: "K12.2 Pro" gives "K12.2-PRO". */
export function toCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A starting tag prefix for a new category: "Microphones" gives "MIC". */
export function suggestTagPrefix(categoryName: string): string {
  return categoryName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

/**
 * The SKU convention: category prefix and model, like MIC-SM58. If that's
 * taken, a short brand code goes in the middle (SPK-QSC-K12), and failing that
 * a number on the end.
 */
export function suggestSku(prefix: string, brand: string, model: string, taken: ReadonlySet<string>): string {
  const modelCode = toCode(model);
  if (!modelCode) return "";
  const base = `${prefix}-${modelCode}`;
  if (!taken.has(base)) return base;
  const brandCode = toCode(brand).replace(/[^A-Z0-9]/g, "").slice(0, 3);
  const withBrand = brandCode ? `${prefix}-${brandCode}-${modelCode}` : base;
  if (!taken.has(withBrand)) return withBrand;
  for (let n = 2; ; n++) {
    if (!taken.has(`${withBrand}-${n}`)) return `${withBrand}-${n}`;
  }
}

// New asset tags are the category prefix and a number padded to this many digits.
export const ASSET_TAG_DIGITS = 3;

export const formatAssetTag = (prefix: string, n: number) => `${prefix}-${String(n).padStart(ASSET_TAG_DIGITS, "0")}`;
