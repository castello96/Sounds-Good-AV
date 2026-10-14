CREATE TABLE "equipment_tags" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "equipment_tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"equipment_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_tags_equipment_id_tag_id_unique" UNIQUE("equipment_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "equipment_tags" ADD CONSTRAINT "equipment_tags_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_tags" ADD CONSTRAINT "equipment_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_tags_tag_id_index" ON "equipment_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_lower_unique" ON "tags" USING btree (lower("name"));--> statement-breakpoint
-- Audit the new tables like the rest of the business tables (see 0001).
CREATE TRIGGER "tags_audit" AFTER INSERT OR UPDATE OR DELETE ON "tags"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();--> statement-breakpoint
CREATE TRIGGER "equipment_tags_audit" AFTER INSERT OR UPDATE OR DELETE ON "equipment_tags"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
