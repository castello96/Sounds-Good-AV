CREATE TYPE "public"."quote_line_kind" AS ENUM('service', 'included', 'discount');--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quote_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"kind" "quote_line_kind" NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_lines_quantity_positive" CHECK ("quote_lines"."quantity" > 0),
	CONSTRAINT "quote_lines_price_fits_kind" CHECK (("quote_lines"."kind" = 'service' AND "quote_lines"."unit_price_cents" > 0)
        OR ("quote_lines"."kind" = 'included' AND "quote_lines"."unit_price_cents" = 0)
        OR ("quote_lines"."kind" = 'discount' AND "quote_lines"."unit_price_cents" < 0 AND "quote_lines"."quantity" = 1))
);
--> statement-breakpoint
ALTER TABLE "booking_items" ADD COLUMN "unit_price_cents" integer;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_lines_booking_id_index" ON "quote_lines" USING btree ("booking_id");--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_price_non_negative" CHECK ("booking_items"."unit_price_cents" IS NULL OR "booking_items"."unit_price_cents" >= 0);--> statement-breakpoint
CREATE TRIGGER "quote_lines_audit" AFTER INSERT OR UPDATE OR DELETE ON "quote_lines" FOR EACH ROW EXECUTE FUNCTION audit_row_change();--> statement-breakpoint
-- Bookings priced before quote lines keep their total as one line, and their
-- gear shows as included so the total doesn't change.
INSERT INTO "quote_lines" ("booking_id", "kind", "description", "unit_price_cents")
SELECT "id",
  CASE WHEN "total_price_cents" > 0 THEN 'service'::quote_line_kind ELSE 'included'::quote_line_kind END,
  'Equipment and services',
  "total_price_cents"
FROM "bookings"
WHERE "total_price_cents" IS NOT NULL;--> statement-breakpoint
UPDATE "booking_items" SET "unit_price_cents" = 0
WHERE "booking_id" IN (SELECT "id" FROM "bookings" WHERE "total_price_cents" IS NOT NULL);
