ALTER TABLE "inventory" ADD COLUMN "contributed_by" integer;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_contributed_by_users_id_fk" FOREIGN KEY ("contributed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_contributed_by_index" ON "inventory" USING btree ("contributed_by");