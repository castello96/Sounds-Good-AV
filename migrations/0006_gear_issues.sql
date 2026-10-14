CREATE TYPE "public"."gear_issue_kind" AS ENUM('repair', 'lost');--> statement-breakpoint
CREATE TYPE "public"."gear_issue_resolution" AS ENUM('repaired', 'found', 'written_off');--> statement-breakpoint
CREATE TABLE "gear_issues" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "gear_issues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"equipment_id" integer NOT NULL,
	"booking_item_id" integer,
	"kind" "gear_issue_kind" NOT NULL,
	"quantity" integer NOT NULL,
	"notes" text,
	"resolution" "gear_issue_resolution",
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gear_issues_quantity_positive" CHECK ("gear_issues"."quantity" > 0),
	CONSTRAINT "gear_issues_resolved_together" CHECK (("gear_issues"."resolution" IS NULL) = ("gear_issues"."resolved_at" IS NULL)),
	CONSTRAINT "gear_issues_resolution_fits_kind" CHECK ("gear_issues"."resolution" IS NULL OR "gear_issues"."resolution" = 'written_off'
        OR ("gear_issues"."kind" = 'repair' AND "gear_issues"."resolution" = 'repaired')
        OR ("gear_issues"."kind" = 'lost' AND "gear_issues"."resolution" = 'found'))
);
--> statement-breakpoint
ALTER TABLE "booking_items" DROP CONSTRAINT "booking_items_counts_valid";--> statement-breakpoint
ALTER TABLE "booking_item_units" ADD COLUMN "damaged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_items" ADD COLUMN "quantity_damaged" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gear_issues" ADD CONSTRAINT "gear_issues_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_issues" ADD CONSTRAINT "gear_issues_booking_item_id_equipment_id_booking_items_id_equipment_id_fk" FOREIGN KEY ("booking_item_id","equipment_id") REFERENCES "public"."booking_items"("id","equipment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gear_issues_equipment_id_index" ON "gear_issues" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "gear_issues_booking_item_id_index" ON "gear_issues" USING btree ("booking_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gear_issues_one_open_per_booking_item" ON "gear_issues" USING btree ("booking_item_id","kind") WHERE "gear_issues"."resolved_at" IS NULL;--> statement-breakpoint
ALTER TABLE "booking_item_units" ADD CONSTRAINT "booking_item_units_damaged_when_returned" CHECK (NOT "booking_item_units"."damaged" OR "booking_item_units"."returned_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_counts_valid" CHECK ("booking_items"."quantity_returned" >= 0 AND "booking_items"."quantity_lost" >= 0
        AND "booking_items"."quantity_damaged" >= 0 AND "booking_items"."quantity_damaged" <= "booking_items"."quantity_returned"
        AND "booking_items"."quantity_returned" + "booking_items"."quantity_lost" <= "booking_items"."quantity_out"
        AND "booking_items"."quantity_out" <= "booking_items"."quantity");--> statement-breakpoint
-- Audit the new table like the rest of the business tables (see 0001).
CREATE TRIGGER "gear_issues_audit" AFTER INSERT OR UPDATE OR DELETE ON "gear_issues"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();--> statement-breakpoint
-- Lost gear tracked by quantity used to come straight off the owned count.
-- Now it stays owned, held by an open lost record, until it's found or written off.
INSERT INTO "gear_issues" ("equipment_id", "booking_item_id", "kind", "quantity")
  SELECT "equipment_id", "id", 'lost', "quantity_lost" FROM "booking_items" WHERE "quantity_lost" > 0;--> statement-breakpoint
UPDATE "equipment" e SET "quantity_owned" = e."quantity_owned" + lost.n
  FROM (SELECT "equipment_id", sum("quantity_lost")::int AS n FROM "booking_items" GROUP BY "equipment_id") lost
  WHERE lost."equipment_id" = e."id" AND lost.n > 0;
