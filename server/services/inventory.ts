import { asc, count, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import {
  formatAssetTag,
  INVENTORY_STATUSES,
  sequentialAssetTags,
  type CreateCategoryInput,
  type createUnitsSchema,
  type DepartmentInput,
  type DepartmentWithCategories,
  type EquipmentDetail,
  type equipmentSchema,
  type EquipmentSummary,
  type InventoryUnit,
  type UnitCounts,
  type UpdateCategoryInput,
  type updateEquipmentSchema,
  type updateUnitSchema,
} from "@shared/inventory";
import { db, withActor } from "../db";
import { categories, departments, equipment, inventory } from "../db/schema";
import { isForeignKeyViolation, isUniqueViolation, ServiceError, violatedUniqueConstraint } from "./errors";

// Services take parsed input, after the schemas' trimming and uppercasing.
type EquipmentData = z.output<typeof equipmentSchema>;
type UpdateEquipmentData = z.output<typeof updateEquipmentSchema>;
type CreateUnitsData = z.output<typeof createUnitsSchema>;
type UpdateUnitData = z.output<typeof updateUnitSchema>;

/**
 * Runs a write and turns constraint violations into messages staff can act on.
 * A foreign key violation means a referenced row is missing (on insert/update)
 * or the row is still referenced (on delete), so the caller words it.
 */
async function write<T>(
  fn: () => Promise<T>,
  messages: { unique?: string | ((constraint: string | undefined) => string); foreignKey?: string },
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (messages.unique && isUniqueViolation(error)) {
      const { unique } = messages;
      throw new ServiceError(409, typeof unique === "string" ? unique : unique(violatedUniqueConstraint(error)));
    }
    if (messages.foreignKey && isForeignKeyViolation(error)) throw new ServiceError(409, messages.foreignKey);
    throw error;
  }
}

function notFound(row: unknown, what: string): asserts row {
  if (!row) throw new ServiceError(404, `${what} not found`);
}

// ---------------------------------------------------------------------------
// Departments and categories
// ---------------------------------------------------------------------------

export async function getCatalog(): Promise<DepartmentWithCategories[]> {
  const [departmentRows, categoryRows, equipmentCounts] = await Promise.all([
    db.select().from(departments).orderBy(asc(departments.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select({ categoryId: equipment.categoryId, n: count() }).from(equipment).groupBy(equipment.categoryId),
  ]);
  const countByCategory = new Map(equipmentCounts.map((r) => [r.categoryId, r.n]));

  return departmentRows.map((d) => ({
    id: d.id,
    name: d.name,
    categories: categoryRows
      .filter((c) => c.departmentId === d.id)
      .map((c) => ({
        id: c.id,
        departmentId: c.departmentId,
        name: c.name,
        tagPrefix: c.tagPrefix,
        equipmentCount: countByCategory.get(c.id) ?? 0,
      })),
  }));
}

const DUPLICATE_DEPARTMENT = "A department with that name already exists";

export async function createDepartment(actorId: number, input: DepartmentInput) {
  return write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.insert(departments).values({ name: input.name }).returning();
        return { id: row.id, name: row.name };
      }),
    { unique: DUPLICATE_DEPARTMENT },
  );
}

export async function updateDepartment(actorId: number, id: number, input: DepartmentInput) {
  return write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.update(departments).set({ name: input.name }).where(eq(departments.id, id)).returning();
        notFound(row, "Department");
        return { id: row.id, name: row.name };
      }),
    { unique: DUPLICATE_DEPARTMENT },
  );
}

export async function deleteDepartment(actorId: number, id: number) {
  await write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.delete(departments).where(eq(departments.id, id)).returning();
        notFound(row, "Department");
      }),
    { foreignKey: "This department still has categories. Move or delete them first." },
  );
}

const duplicateCategory = (constraint: string | undefined) =>
  constraint === "categories_tag_prefix_unique"
    ? "Another category already uses that tag prefix"
    : "That department already has a category with this name";

const toCategory = (row: typeof categories.$inferSelect) => ({
  id: row.id,
  departmentId: row.departmentId,
  name: row.name,
  tagPrefix: row.tagPrefix,
});

export async function createCategory(actorId: number, input: CreateCategoryInput) {
  return write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.insert(categories).values(input).returning();
        return toCategory(row);
      }),
    { unique: duplicateCategory, foreignKey: "That department no longer exists" },
  );
}

export async function updateCategory(actorId: number, id: number, input: UpdateCategoryInput) {
  return write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.update(categories).set(input).where(eq(categories.id, id)).returning();
        notFound(row, "Category");
        return toCategory(row);
      }),
    { unique: duplicateCategory, foreignKey: "That department no longer exists" },
  );
}

export async function deleteCategory(actorId: number, id: number) {
  await write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.delete(categories).where(eq(categories.id, id)).returning();
        notFound(row, "Category");
      }),
    { foreignKey: "This category still has equipment. Move or delete it first." },
  );
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

const emptyCounts = (): UnitCounts =>
  Object.fromEntries(INVENTORY_STATUSES.map((s) => [s, 0])) as UnitCounts;

const summaryColumns = {
  id: equipment.id,
  categoryId: equipment.categoryId,
  categoryName: categories.name,
  departmentId: departments.id,
  departmentName: departments.name,
  tagPrefix: categories.tagPrefix,
  sku: equipment.sku,
  brand: equipment.brand,
  model: equipment.model,
  tracking: equipment.tracking,
  quantityOwned: equipment.quantityOwned,
};

function summaryQuery() {
  return db
    .select(summaryColumns)
    .from(equipment)
    .innerJoin(categories, eq(categories.id, equipment.categoryId))
    .innerJoin(departments, eq(departments.id, categories.departmentId));
}

async function unitCounts(equipmentId?: number): Promise<Map<number, UnitCounts>> {
  const rows = await db
    .select({ equipmentId: inventory.equipmentId, status: inventory.status, n: count() })
    .from(inventory)
    .where(equipmentId === undefined ? undefined : eq(inventory.equipmentId, equipmentId))
    .groupBy(inventory.equipmentId, inventory.status);

  const counts = new Map<number, UnitCounts>();
  for (const row of rows) {
    const c = counts.get(row.equipmentId) ?? emptyCounts();
    c[row.status] = row.n;
    counts.set(row.equipmentId, c);
  }
  return counts;
}

export async function listEquipment(): Promise<EquipmentSummary[]> {
  const [rows, counts] = await Promise.all([
    summaryQuery().orderBy(asc(departments.name), asc(categories.name), asc(equipment.brand), asc(equipment.model)),
    unitCounts(),
  ]);
  return rows.map((row) => ({ ...row, unitCounts: counts.get(row.id) ?? emptyCounts() }));
}

export async function getEquipment(id: number): Promise<EquipmentDetail> {
  const [[row], counts, units] = await Promise.all([
    summaryQuery().where(eq(equipment.id, id)),
    unitCounts(id),
    db.select().from(inventory).where(eq(inventory.equipmentId, id)).orderBy(asc(inventory.assetTag)),
  ]);
  notFound(row, "Equipment");
  return {
    ...row,
    unitCounts: counts.get(id) ?? emptyCounts(),
    units: units.map(toUnit),
    nextAssetTag: row.tracking === "units" ? await nextAssetTag(row.tagPrefix) : null,
  };
}

/**
 * One past the highest numbered tag with this prefix, across all units. Gaps
 * left by deleted units aren't refilled, so a tag is never reused while its
 * old sticker might still be around.
 */
export async function nextAssetTag(prefix: string): Promise<string> {
  // Prefixes are letters and digits only, so they're safe inside the pattern.
  const [{ highest }] = await db
    .select({ highest: sql<number | null>`max(substring(${inventory.assetTag} from ${prefix.length + 2}::int)::int)` })
    .from(inventory)
    .where(sql`${inventory.assetTag} ~ ${`^${prefix}-[0-9]{1,9}$`}`);
  return formatAssetTag(prefix, (highest ?? 0) + 1);
}

const DUPLICATE_SKU = "Another piece of equipment already uses that SKU";
const MISSING_CATEGORY = "That category no longer exists";

export async function createEquipment(actorId: number, input: EquipmentData): Promise<EquipmentDetail> {
  const values = { ...input, quantityOwned: input.tracking === "quantity" ? input.quantityOwned : 0 };
  const id = await write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.insert(equipment).values(values).returning({ id: equipment.id });
        return row.id;
      }),
    { unique: DUPLICATE_SKU, foreignKey: MISSING_CATEGORY },
  );
  return getEquipment(id);
}

export async function updateEquipment(actorId: number, id: number, input: UpdateEquipmentData): Promise<EquipmentDetail> {
  await write(
    () =>
      withActor(actorId, async (tx) => {
        const [current] = await tx
          .select({ tracking: equipment.tracking })
          .from(equipment)
          .where(eq(equipment.id, id))
          .for("update");
        notFound(current, "Equipment");

        const tracking = input.tracking ?? current.tracking;
        if (tracking === "quantity" && current.tracking === "units") {
          const [{ n }] = await tx.select({ n: count() }).from(inventory).where(eq(inventory.equipmentId, id));
          if (n > 0) {
            throw new ServiceError(409, "This equipment has units with asset tags. Delete them before switching to quantity tracking.");
          }
        }
        // Equipment tracked by units counts its units, so it has no quantity of its own.
        const values = tracking === "units" ? { ...input, quantityOwned: 0 } : input;
        await tx.update(equipment).set(values).where(eq(equipment.id, id));
      }),
    { unique: DUPLICATE_SKU, foreignKey: MISSING_CATEGORY },
  );
  return getEquipment(id);
}

export async function deleteEquipment(actorId: number, id: number) {
  await write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.delete(equipment).where(eq(equipment.id, id)).returning();
        notFound(row, "Equipment");
      }),
    { foreignKey: "This equipment has units or has been booked. Delete its units first, or keep it for the records." },
  );
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

function toUnit(row: typeof inventory.$inferSelect): InventoryUnit {
  return {
    id: row.id,
    equipmentId: row.equipmentId,
    assetTag: row.assetTag,
    serialNumber: row.serialNumber,
    status: row.status,
    condition: row.condition,
    notes: row.notes,
    purchasedAt: row.purchasedAt,
  };
}

/** Adds one unit, or several with sequential asset tags. All or nothing. */
export async function createUnits(actorId: number, equipmentId: number, input: CreateUnitsData): Promise<InventoryUnit[]> {
  const { assetTag, quantity, ...fields } = input;
  const tags = sequentialAssetTags(assetTag, quantity);
  return write(
    () =>
      withActor(actorId, async (tx) => {
        const [item] = await tx
          .select({ tracking: equipment.tracking })
          .from(equipment)
          .where(eq(equipment.id, equipmentId));
        notFound(item, "Equipment");
        if (item.tracking === "quantity") {
          throw new ServiceError(409, "This equipment is tracked by quantity, so it doesn't have units. Edit its quantity instead.");
        }

        const rows = await tx
          .insert(inventory)
          .values(tags.map((tag) => ({ ...fields, equipmentId, assetTag: tag })))
          .returning();
        return rows.map(toUnit);
      }),
    {
      unique:
        quantity === 1
          ? "That asset tag is already in use"
          : `One of the asset tags ${tags[0]} to ${tags[tags.length - 1]} is already in use`,
      foreignKey: "That equipment no longer exists",
    },
  );
}

export async function updateUnit(actorId: number, id: number, input: UpdateUnitData): Promise<InventoryUnit> {
  return write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.update(inventory).set(input).where(eq(inventory.id, id)).returning();
        notFound(row, "Unit");
        return toUnit(row);
      }),
    { unique: "That asset tag is already in use" },
  );
}

export async function deleteUnit(actorId: number, id: number) {
  await write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.delete(inventory).where(eq(inventory.id, id)).returning();
        notFound(row, "Unit");
      }),
    { foreignKey: "This unit has been on a booking, so it can't be deleted. Mark it retired instead." },
  );
}
