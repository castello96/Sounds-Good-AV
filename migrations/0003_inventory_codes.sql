CREATE TYPE "public"."equipment_tracking" AS ENUM('units', 'quantity');--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "tag_prefix" text;--> statement-breakpoint
-- Backfill existing categories. Seeded names get their standard prefix, others
-- get the first three letters of their name, and anything left over gets C<id>.
-- Staff can change any of them in the portal.
UPDATE "categories" c SET "tag_prefix" = v.prefix
FROM (VALUES
  ('Microphones', 'MIC'), ('Speakers', 'SPK'), ('Subwoofers', 'SUB'), ('Mixers', 'MIX'),
  ('Monitors', 'MON'), ('Stands', 'STD'), ('Signal Processing', 'DSP'), ('Cables', 'CBL'),
  ('Uplights', 'UPL'), ('Wash Lights', 'WSH'), ('Spot Lights', 'SPT'), ('Lighting Controllers', 'LTC'),
  ('Projectors', 'PRJ'), ('Screens', 'SCR'), ('Displays', 'DIS'),
  ('Stage Decks', 'DCK'), ('Truss', 'TRS'),
  ('Power Distribution', 'PWR'), ('Generators', 'GEN'), ('Extension Cords', 'EXT')
) AS v(name, prefix)
WHERE c."name" = v.name
  AND c."id" = (SELECT min(o."id") FROM "categories" o WHERE o."name" = c."name");--> statement-breakpoint
WITH derived AS (
  SELECT "id", upper(left(regexp_replace("name", '[^A-Za-z]', '', 'g'), 3)) AS prefix
  FROM "categories"
  WHERE "tag_prefix" IS NULL
), firsts AS (
  SELECT DISTINCT ON (prefix) "id", prefix FROM derived WHERE length(prefix) >= 2 ORDER BY prefix, "id"
)
UPDATE "categories" c SET "tag_prefix" = f.prefix
FROM firsts f
WHERE c."id" = f."id"
  AND NOT EXISTS (SELECT 1 FROM "categories" o WHERE o."tag_prefix" = f.prefix);--> statement-breakpoint
UPDATE "categories" SET "tag_prefix" = 'C' || "id" WHERE "tag_prefix" IS NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "tag_prefix" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "tracking" "equipment_tracking" DEFAULT 'units' NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "quantity_owned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tag_prefix_unique" UNIQUE("tag_prefix");--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_quantity_owned_non_negative" CHECK ("equipment"."quantity_owned" >= 0);--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_quantity_only_when_tracked" CHECK ("equipment"."tracking" = 'quantity' OR "equipment"."quantity_owned" = 0);