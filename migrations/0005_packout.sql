ALTER TABLE "booking_item_units" ADD COLUMN "lost_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_items" ADD COLUMN "quantity_out" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_items" ADD COLUMN "quantity_returned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_items" ADD COLUMN "quantity_lost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_item_units_one_open_per_unit" ON "booking_item_units" USING btree ("inventory_id") WHERE "booking_item_units"."returned_at" IS NULL AND "booking_item_units"."lost_at" IS NULL;--> statement-breakpoint
ALTER TABLE "booking_item_units" ADD CONSTRAINT "booking_item_units_returned_or_lost" CHECK ("booking_item_units"."returned_at" IS NULL OR "booking_item_units"."lost_at" IS NULL);--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_counts_valid" CHECK ("booking_items"."quantity_returned" >= 0 AND "booking_items"."quantity_lost" >= 0
        AND "booking_items"."quantity_returned" + "booking_items"."quantity_lost" <= "booking_items"."quantity_out"
        AND "booking_items"."quantity_out" <= "booking_items"."quantity");