import { and, asc, count, eq, inArray, notInArray, sql, type SQL } from "drizzle-orm";
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
  type TagInput,
  type TagRef,
  type TagSummary,
  type UnitCounts,
  type UpdateCategoryInput,
  type updateEquipmentSchema,
  type updateUnitSchema,
} from "@shared/inventory";
import { db, withActor, type Tx } from "../db";
import { categories, departments, equipment, equipmentTags, inventory, tags, users } from "../db/schema";
import { notFound, ServiceError, write } from "./errors";
import { emptyIssueCounts, ensureWithinOwned, openIssueCounts } from "./gearIssues";

// Services take parsed input, after the schemas' trimming and uppercasing.
type EquipmentData = z.output<typeof equipmentSchema>;
type UpdateEquipmentData = z.output<typeof updateEquipmentSchema>;
type CreateUnitsData = z.output<typeof createUnitsSchema>;
type UpdateUnitData = z.output<typeof updateUnitSchema>;

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
// Tags
// ---------------------------------------------------------------------------

const DUPLICATE_TAG = "A tag with that name already exists";

export async function listTags(): Promise<TagSummary[]> {
  return db
    .select({ id: tags.id, name: tags.name, equipmentCount: sql<number>`count(${equipmentTags.id})::int` })
    .from(tags)
    .leftJoin(equipmentTags, eq(equipmentTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(sql`lower(${tags.name})`);
}

export async function createTag(actorId: number, input: TagInput): Promise<TagRef> {
  return write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.insert(tags).values({ name: input.name }).returning();
        return { id: row.id, name: row.name };
      }),
    { unique: DUPLICATE_TAG },
  );
}

/** Renames a tag everywhere it's used. */
export async function updateTag(actorId: number, id: number, input: TagInput): Promise<TagRef> {
  return write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.update(tags).set({ name: input.name }).where(eq(tags.id, id)).returning();
        notFound(row, "Tag");
        return { id: row.id, name: row.name };
      }),
    { unique: DUPLICATE_TAG },
  );
}

/** Deletes a tag and takes it off any equipment that has it. */
export async function deleteTag(actorId: number, id: number) {
  await withActor(actorId, async (tx) => {
    const [row] = await tx.delete(tags).where(eq(tags.id, id)).returning();
    notFound(row, "Tag");
  });
}

/** Tags on each piece of equipment, sorted by name. */
async function tagsByEquipment(equipmentId?: number): Promise<Map<number, TagRef[]>> {
  const rows = await db
    .select({ equipmentId: equipmentTags.equipmentId, id: tags.id, name: tags.name })
    .from(equipmentTags)
    .innerJoin(tags, eq(tags.id, equipmentTags.tagId))
    .where(equipmentId === undefined ? undefined : eq(equipmentTags.equipmentId, equipmentId))
    .orderBy(sql`lower(${tags.name})`);

  const byEquipment = new Map<number, TagRef[]>();
  for (const { equipmentId: key, ...tag } of rows) {
    byEquipment.set(key, [...(byEquipment.get(key) ?? []), tag]);
  }
  return byEquipment;
}

/** Makes the equipment's tags exactly `tagIds`, keeping rows that are already there. */
async function setTags(tx: Tx, equipmentId: number, tagIds: number[]) {
  if (tagIds.length > 0) {
    const found = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.id, tagIds));
    if (found.length !== tagIds.length) {
      throw new ServiceError(409, "One of those tags has been deleted. Refresh the page and try again.");
    }
  }
  await tx
    .delete(equipmentTags)
    .where(
      and(
        eq(equipmentTags.equipmentId, equipmentId),
        tagIds.length > 0 ? notInArray(equipmentTags.tagId, tagIds) : undefined,
      ),
    );
  if (tagIds.length > 0) {
    await tx
      .insert(equipmentTags)
      .values(tagIds.map((tagId) => ({ equipmentId, tagId })))
      .onConflictDoNothing();
  }
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
  const [rows, counts, issues, tagMap] = await Promise.all([
    summaryQuery().orderBy(asc(departments.name), asc(categories.name), asc(equipment.brand), asc(equipment.model)),
    unitCounts(),
    openIssueCounts(db),
    tagsByEquipment(),
  ]);
  return rows.map((row) => ({
    ...row,
    unitCounts: counts.get(row.id) ?? emptyCounts(),
    issueCounts: issues.get(row.id) ?? emptyIssueCounts(),
    tags: tagMap.get(row.id) ?? [],
  }));
}

export async function getEquipment(id: number): Promise<EquipmentDetail> {
  const [[row], counts, issues, tagMap, units] = await Promise.all([
    summaryQuery().where(eq(equipment.id, id)),
    unitCounts(id),
    openIssueCounts(db, [id]),
    tagsByEquipment(id),
    unitsWhere(eq(inventory.equipmentId, id)),
  ]);
  notFound(row, "Equipment");
  return {
    ...row,
    unitCounts: counts.get(id) ?? emptyCounts(),
    issueCounts: issues.get(id) ?? emptyIssueCounts(),
    tags: tagMap.get(id) ?? [],
    units,
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
  const { tagIds, ...fields } = input;
  const values = { ...fields, quantityOwned: fields.tracking === "quantity" ? fields.quantityOwned : 0 };
  const id = await write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.insert(equipment).values(values).returning({ id: equipment.id });
        await setTags(tx, row.id, tagIds);
        return row.id;
      }),
    { unique: DUPLICATE_SKU, foreignKey: MISSING_CATEGORY },
  );
  return getEquipment(id);
}

export async function updateEquipment(actorId: number, id: number, update: UpdateEquipmentData): Promise<EquipmentDetail> {
  // Tags are only changed when given.
  const { tagIds, ...input } = update;
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
        if (Object.keys(input).length > 0) await tx.update(equipment).set(values).where(eq(equipment.id, id));
        // The owned count can't drop below what's in repair or lost.
        if (input.quantityOwned !== undefined) await ensureWithinOwned(tx, id);
        if (tagIds) await setTags(tx, id, tagIds);
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

const MISSING_CONTRIBUTOR = "That staff member no longer exists";

/** Units with their contributor's name, by asset tag. */
async function unitsWhere(where: SQL): Promise<InventoryUnit[]> {
  const rows = await db
    .select({
      unit: inventory,
      contributorName: sql<string | null>`${users.firstName} || ' ' || ${users.lastName}`,
    })
    .from(inventory)
    .leftJoin(users, eq(users.id, inventory.contributedBy))
    .where(where)
    .orderBy(asc(inventory.assetTag));
  return rows.map(({ unit, contributorName }) => ({
    id: unit.id,
    equipmentId: unit.equipmentId,
    assetTag: unit.assetTag,
    serialNumber: unit.serialNumber,
    status: unit.status,
    condition: unit.condition,
    notes: unit.notes,
    purchasedAt: unit.purchasedAt,
    contributedBy: unit.contributedBy,
    contributorName,
  }));
}

/** Adds one unit, or several with sequential asset tags. All or nothing. */
export async function createUnits(actorId: number, equipmentId: number, input: CreateUnitsData): Promise<InventoryUnit[]> {
  const { assetTag, quantity, ...fields } = input;
  const tags = sequentialAssetTags(assetTag, quantity);
  const rows = await write(
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

        return tx
          .insert(inventory)
          .values(tags.map((tag) => ({ ...fields, equipmentId, assetTag: tag })))
          .returning({ id: inventory.id });
      }),
    {
      unique:
        quantity === 1
          ? "That asset tag is already in use"
          : `One of the asset tags ${tags[0]} to ${tags[tags.length - 1]} is already in use`,
      // The equipment was checked above, so a missing key here is the contributor.
      foreignKey: MISSING_CONTRIBUTOR,
    },
  );
  return unitsWhere(inArray(inventory.id, rows.map((row) => row.id)));
}

export async function updateUnit(actorId: number, id: number, input: UpdateUnitData): Promise<InventoryUnit> {
  await write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.update(inventory).set(input).where(eq(inventory.id, id)).returning({ id: inventory.id });
        notFound(row, "Unit");
      }),
    { unique: "That asset tag is already in use", foreignKey: MISSING_CONTRIBUTOR },
  );
  const [unit] = await unitsWhere(eq(inventory.id, id));
  return unit;
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
