import { beforeEach, describe, expect, it } from "vitest";
import { createUnitsSchema, equipmentSchema, sequentialAssetTags } from "@shared/inventory";
import { resetDatabase } from "../../test/db";
import { db } from "../db";
import { auditEvents, bookingItems, bookingItemUnits, bookings, customers } from "../db/schema";
import * as inventory from "./inventory";
import { createUser } from "./users";

let actorId: number;

beforeEach(async () => {
  await resetDatabase();
  const user = await createUser(null, {
    email: "staff@example.test",
    firstName: "Staff",
    lastName: "Member",
    password: "correct horse battery",
  });
  actorId = user.id;
});

async function seedEquipment() {
  const department = await inventory.createDepartment(actorId, { name: "Audio" });
  const category = await inventory.createCategory(actorId, { departmentId: department.id, name: "Microphones" });
  const sm58 = await inventory.createEquipment(
    actorId,
    equipmentSchema.parse({ categoryId: category.id, sku: "sm58", brand: "Shure", model: "SM58" }),
  );
  return { department, category, sm58 };
}

const units = (input: object) => createUnitsSchema.parse(input);

describe("sequentialAssetTags", () => {
  it("counts up and keeps zero padding", () => {
    expect(sequentialAssetTags("MIC-009", 3)).toEqual(["MIC-009", "MIC-010", "MIC-011"]);
    expect(sequentialAssetTags("SPK-98", 3)).toEqual(["SPK-98", "SPK-99", "SPK-100"]);
    expect(sequentialAssetTags("ODD", 1)).toEqual(["ODD"]);
  });

  it("requires a trailing number for several units", () => {
    expect(createUnitsSchema.safeParse({ assetTag: "MIC", quantity: 2 }).success).toBe(false);
  });
});

describe("catalog", () => {
  it("groups categories under departments with equipment counts", async () => {
    const { category } = await seedEquipment();
    await inventory.createCategory(actorId, { departmentId: category.departmentId, name: "Speakers" });
    await inventory.createDepartment(actorId, { name: "Lighting" });

    const catalog = await inventory.getCatalog();
    expect(catalog.map((d) => d.name)).toEqual(["Audio", "Lighting"]);
    expect(catalog[0].categories).toEqual([
      expect.objectContaining({ name: "Microphones", equipmentCount: 1 }),
      expect.objectContaining({ name: "Speakers", equipmentCount: 0 }),
    ]);
  });

  it("rejects duplicate names", async () => {
    const { department } = await seedEquipment();
    await expect(inventory.createDepartment(actorId, { name: "Audio" })).rejects.toMatchObject({ status: 409 });
    await expect(
      inventory.createCategory(actorId, { departmentId: department.id, name: "Microphones" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("won't delete a department or category that's in use", async () => {
    const { department, category } = await seedEquipment();
    await expect(inventory.deleteDepartment(actorId, department.id)).rejects.toMatchObject({ status: 409 });
    await expect(inventory.deleteCategory(actorId, category.id)).rejects.toMatchObject({ status: 409 });
  });

  it("records who made each change", async () => {
    await inventory.createDepartment(actorId, { name: "Video" });
    const events = await db.select().from(auditEvents);
    expect(events).toContainEqual(expect.objectContaining({ entityType: "departments", userId: actorId }));
  });
});

describe("equipment", () => {
  it("stores the SKU uppercase and rejects duplicates in any case", async () => {
    const { category, sm58 } = await seedEquipment();
    expect(sm58.sku).toBe("SM58");
    await expect(
      inventory.createEquipment(
        actorId,
        equipmentSchema.parse({ categoryId: category.id, sku: "Sm58", brand: "Shure", model: "Copy" }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("counts units by status", async () => {
    const { sm58 } = await seedEquipment();
    const added = await inventory.createUnits(actorId, sm58.id, units({ assetTag: "mic-001", quantity: 3 }));
    await inventory.updateUnit(actorId, added[0].id, { status: "maintenance" });

    const [summary] = await inventory.listEquipment();
    expect(summary).toMatchObject({ departmentName: "Audio", categoryName: "Microphones" });
    expect(summary.unitCounts).toEqual({ active: 2, maintenance: 1, retired: 0, lost: 0 });

    const detail = await inventory.getEquipment(sm58.id);
    expect(detail.units.map((u) => u.assetTag)).toEqual(["MIC-001", "MIC-002", "MIC-003"]);
  });

  it("won't delete equipment that still has units", async () => {
    const { sm58 } = await seedEquipment();
    await inventory.createUnits(actorId, sm58.id, units({ assetTag: "MIC-001", quantity: 1 }));
    await expect(inventory.deleteEquipment(actorId, sm58.id)).rejects.toMatchObject({ status: 409 });
  });

  it("answers 404 for missing equipment", async () => {
    await expect(inventory.getEquipment(999)).rejects.toMatchObject({ status: 404 });
  });
});

describe("units", () => {
  it("adds none of a batch when one asset tag is taken", async () => {
    const { sm58 } = await seedEquipment();
    await inventory.createUnits(actorId, sm58.id, units({ assetTag: "MIC-002", quantity: 1 }));
    await expect(
      inventory.createUnits(actorId, sm58.id, units({ assetTag: "MIC-001", quantity: 3 })),
    ).rejects.toMatchObject({ status: 409 });
    expect((await inventory.getEquipment(sm58.id)).units).toHaveLength(1);
  });

  it("stores blank optional fields as null", async () => {
    const { sm58 } = await seedEquipment();
    const [unit] = await inventory.createUnits(
      actorId,
      sm58.id,
      units({ assetTag: "MIC-001", quantity: 1, serialNumber: "  ", notes: "", purchasedAt: "" }),
    );
    expect(unit).toMatchObject({ serialNumber: null, notes: null, purchasedAt: null, status: "active" });
  });

  it("won't delete a unit that has been on a booking", async () => {
    const { sm58 } = await seedEquipment();
    const [unit] = await inventory.createUnits(actorId, sm58.id, units({ assetTag: "MIC-001", quantity: 1 }));

    const [customer] = await db.insert(customers).values({ firstName: "A", lastName: "B", email: "a@b.test" }).returning();
    const [booking] = await db
      .insert(bookings)
      .values({
        customerId: customer.id,
        eventType: "wedding",
        eventStartAt: new Date("2026-11-01T18:00:00Z"),
        eventEndAt: new Date("2026-11-01T23:00:00Z"),
      })
      .returning();
    const [item] = await db
      .insert(bookingItems)
      .values({ bookingId: booking.id, equipmentId: sm58.id, quantity: 1 })
      .returning();
    await db.insert(bookingItemUnits).values({ bookingItemId: item.id, inventoryId: unit.id, equipmentId: sm58.id });

    await expect(inventory.deleteUnit(actorId, unit.id)).rejects.toMatchObject({ status: 409 });
  });
});
