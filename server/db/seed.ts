import { db, pool, withActor } from "./index";
import { categories, departments } from "./schema";

// Starter catalog structure: category name and asset tag prefix. Safe to run
// repeatedly; existing rows (matched by name or prefix) are left alone. Keep
// the prefixes in step with the backfill in migrations/0003_inventory_codes.sql.
const CATALOG: Record<string, [name: string, tagPrefix: string][]> = {
  Audio: [
    ["Microphones", "MIC"],
    ["Speakers", "SPK"],
    ["Subwoofers", "SUB"],
    ["Mixers", "MIX"],
    ["Monitors", "MON"],
    ["Stands", "STD"],
    ["Signal Processing", "DSP"],
    ["Cables", "CBL"],
  ],
  Lighting: [
    ["Uplights", "UPL"],
    ["Wash Lights", "WSH"],
    ["Spot Lights", "SPT"],
    ["Lighting Controllers", "LTC"],
  ],
  Video: [
    ["Projectors", "PRJ"],
    ["Screens", "SCR"],
    ["Displays", "DIS"],
  ],
  Staging: [
    ["Stage Decks", "DCK"],
    ["Truss", "TRS"],
  ],
  Power: [
    ["Power Distribution", "PWR"],
    ["Generators", "GEN"],
    ["Extension Cords", "EXT"],
  ],
};

async function main() {
  await withActor(null, async (tx) => {
    for (const [departmentName, categoryList] of Object.entries(CATALOG)) {
      await tx.insert(departments).values({ name: departmentName }).onConflictDoNothing();
      const department = await tx.query.departments.findFirst({
        where: (d, { eq }) => eq(d.name, departmentName),
      });

      await tx
        .insert(categories)
        .values(categoryList.map(([name, tagPrefix]) => ({ departmentId: department!.id, name, tagPrefix })))
        .onConflictDoNothing();
    }
  });

  const count = await db.$count(categories);
  console.log(`Seed complete: ${count} categories`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
