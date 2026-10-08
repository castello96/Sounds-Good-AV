import { db, pool, withActor } from "./index";
import { categories, departments } from "./schema";

// Starter catalog structure. Safe to run repeatedly; existing rows are left alone.
const CATALOG: Record<string, string[]> = {
  Audio: ["Microphones", "Speakers", "Subwoofers", "Mixers", "Monitors", "Stands", "Signal Processing"],
  Lighting: ["Uplights", "Wash Lights", "Spot Lights", "Lighting Controllers"],
  Video: ["Projectors", "Screens", "Displays"],
  Staging: ["Stage Decks", "Truss"],
  Power: ["Power Distribution", "Generators"],
};

async function main() {
  await withActor(null, async (tx) => {
    for (const [departmentName, categoryNames] of Object.entries(CATALOG)) {
      await tx.insert(departments).values({ name: departmentName }).onConflictDoNothing();
      const department = await tx.query.departments.findFirst({
        where: (d, { eq }) => eq(d.name, departmentName),
      });

      await tx
        .insert(categories)
        .values(categoryNames.map((name) => ({ departmentId: department!.id, name })))
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
