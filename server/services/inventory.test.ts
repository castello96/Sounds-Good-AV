import { beforeEach, describe, expect, it } from "vitest";
import { createCategorySchema, createUnitsSchema, equipmentSchema, sequentialAssetTags, suggestSku } from "@shared/inventory";
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
  const category = await inventory.createCategory(actorId, { departmentId: department.id, name: "Microphones", tagPrefix: "MIC" });
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

describe("codes", () => {
  it("validates and uppercases tag prefixes", () => {
    expect(createCategorySchema.parse({ departmentId: 1, name: "Mics", tagPrefix: " mic " }).tagPrefix).toBe("MIC");
    for (const bad of ["M", "1MC", "MIC-", "TOOLONG"]) {
      expect(createCategorySchema.safeParse({ departmentId: 1, name: "Mics", tagPrefix: bad }).success).toBe(false);
    }
  });

  it("suggests SKUs from the prefix and model, adding the brand on a clash", () => {
    const none = new Set<string>();
    expect(suggestSku("SPK", "QSC", "K12.2", none)).toBe("SPK-K12.2");
    expect(suggestSku("UPL", "Chauvet DJ", "SlimPAR Q12 BT", none)).toBe("UPL-SLIMPAR-Q12-BT");
    expect(suggestSku("SPK", "Electro-Voice", "K12", new Set(["SPK-K12"]))).toBe("SPK-ELE-K12");
    expect(suggestSku("SPK", "QSC", "K12", new Set(["SPK-K12", "SPK-QSC-K12"]))).toBe("SPK-QSC-K12-2");
    expect(suggestSku("SPK", "QSC", "  ", none)).toBe("");
  });
});

describe("catalog", () => {
  it("groups categories under departments with equipment counts", async () => {
    const { category } = await seedEquipment();
    await inventory.createCategory(actorId, { departmentId: category.departmentId, name: "Speakers", tagPrefix: "SPK" });
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
      inventory.createCategory(actorId, { departmentId: department.id, name: "Microphones", tagPrefix: "MC" }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining("name") });
    await expect(
      inventory.createCategory(actorId, { departmentId: department.id, name: "Mics", tagPrefix: "MIC" }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining("prefix") });
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

  it("suggests the next asset tag across the whole category", async () => {
    const { category, sm58 } = await seedEquipment();
    expect((await inventory.getEquipment(sm58.id)).nextAssetTag).toBe("MIC-001");

    await inventory.createUnits(actorId, sm58.id, units({ assetTag: "MIC-001", quantity: 6 }));
    // Odd tags that don't follow the pattern are ignored.
    await inventory.createUnits(actorId, sm58.id, units({ assetTag: "MIC-OLD", quantity: 1 }));
    const beta = await inventory.createEquipment(
      actorId,
      equipmentSchema.parse({ categoryId: category.id, sku: "MIC-BETA58A", brand: "Shure", model: "Beta 58A" }),
    );
    expect(beta.nextAssetTag).toBe("MIC-007");
  });

  it("tracks cables and accessories by quantity", async () => {
    const { category, sm58 } = await seedEquipment();
    const cable = await inventory.createEquipment(
      actorId,
      equipmentSchema.parse({
        categoryId: category.id,
        sku: "CBL-XLR-25",
        brand: "Generic",
        model: "XLR 25ft",
        tracking: "quantity",
        quantityOwned: "60",
      }),
    );
    expect(cable).toMatchObject({ tracking: "quantity", quantityOwned: 60, nextAssetTag: null, units: [] });
    await expect(
      inventory.createUnits(actorId, cable.id, units({ assetTag: "CBL-001", quantity: 1 })),
    ).rejects.toMatchObject({ status: 409 });

    // A quantity on unit-tracked equipment is ignored rather than stored.
    const plain = await inventory.createEquipment(
      actorId,
      equipmentSchema.parse({ categoryId: category.id, sku: "X", brand: "B", model: "M", quantityOwned: 5 }),
    );
    expect(plain.quantityOwned).toBe(0);

    // Switching to units drops the count; switching back is fine with no units.
    expect((await inventory.updateEquipment(actorId, cable.id, { tracking: "units" })).quantityOwned).toBe(0);
    await inventory.updateEquipment(actorId, cable.id, { tracking: "quantity", quantityOwned: 40 });
    expect((await inventory.getEquipment(cable.id)).quantityOwned).toBe(40);

    // Equipment with tagged units can't switch to quantity.
    await inventory.createUnits(actorId, sm58.id, units({ assetTag: "MIC-001", quantity: 1 }));
    await expect(inventory.updateEquipment(actorId, sm58.id, { tracking: "quantity" })).rejects.toMatchObject({
      status: 409,
    });
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
