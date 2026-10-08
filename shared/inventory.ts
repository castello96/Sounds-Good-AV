import { z } from "zod";

export const INVENTORY_STATUSES = ["active", "maintenance", "retired", "lost"] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export const INVENTORY_STATUS_LABELS: Record<InventoryStatus, string> = {
  active: "Active",
  maintenance: "Maintenance",
  retired: "Retired",
  lost: "Lost",
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
  equipmentCount: number;
}

export interface DepartmentWithCategories {
  id: number;
  name: string;
  categories: CategorySummary[];
}

export type UnitCounts = Record<InventoryStatus, number>;

export interface EquipmentSummary {
  id: number;
  categoryId: number;
  categoryName: string;
  departmentId: number;
  departmentName: string;
  sku: string;
  brand: string;
  model: string;
  unitCounts: UnitCounts;
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
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const departmentSchema = z.object({ name: required("Name") });
export type DepartmentInput = z.infer<typeof departmentSchema>;

export const createCategorySchema = z.object({ departmentId: id, name: required("Name") });
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const equipmentSchema = z.object({
  categoryId: id,
  // Stored uppercase so "sm58" and "SM58" can't both exist.
  sku: required("SKU", 50).transform((v) => v.toUpperCase()),
  brand: required("Brand"),
  model: required("Model"),
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
