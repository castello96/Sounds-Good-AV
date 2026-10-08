CREATE TYPE "public"."audit_action" AS ENUM('insert', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('inquiry', 'quoted', 'confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."delivery_type" AS ENUM('pickup', 'dropoff', 'setup', 'managed');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('band', 'wedding', 'corporate', 'podcast', 'presentation', 'party', 'other');--> statement-breakpoint
CREATE TYPE "public"."inventory_status" AS ENUM('active', 'maintenance', 'retired', 'lost');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'check', 'card', 'venmo', 'zelle', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "addresses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"venue_name" text,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" integer,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_item_units" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "booking_item_units_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_item_id" integer NOT NULL,
	"inventory_id" integer NOT NULL,
	"equipment_id" integer NOT NULL,
	"checked_out_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"return_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_item_units_booking_item_id_inventory_id_unique" UNIQUE("booking_item_id","inventory_id"),
	CONSTRAINT "booking_item_units_return_after_checkout" CHECK ("booking_item_units"."returned_at" IS NULL OR ("booking_item_units"."checked_out_at" IS NOT NULL AND "booking_item_units"."returned_at" >= "booking_item_units"."checked_out_at"))
);
--> statement-breakpoint
CREATE TABLE "booking_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "booking_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"equipment_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_items_booking_id_equipment_id_unique" UNIQUE("booking_id","equipment_id"),
	CONSTRAINT "booking_items_id_equipment_id_unique" UNIQUE("id","equipment_id"),
	CONSTRAINT "booking_items_quantity_positive" CHECK ("booking_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bookings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_id" integer NOT NULL,
	"address_id" integer,
	"status" "booking_status" DEFAULT 'inquiry' NOT NULL,
	"event_type" "event_type" NOT NULL,
	"delivery_type" "delivery_type",
	"request_details" text,
	"notes" text,
	"event_start_at" timestamp with time zone NOT NULL,
	"event_end_at" timestamp with time zone NOT NULL,
	"out_at" timestamp with time zone,
	"back_at" timestamp with time zone,
	"total_price_cents" integer,
	"onsite_contact_name" text,
	"onsite_contact_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_event_window" CHECK ("bookings"."event_end_at" > "bookings"."event_start_at"),
	CONSTRAINT "bookings_out_before_event" CHECK ("bookings"."out_at" IS NULL OR "bookings"."out_at" <= "bookings"."event_start_at"),
	CONSTRAINT "bookings_back_after_event" CHECK ("bookings"."back_at" IS NULL OR "bookings"."back_at" >= "bookings"."event_end_at"),
	CONSTRAINT "bookings_price_non_negative" CHECK ("bookings"."total_price_cents" IS NULL OR "bookings"."total_price_cents" >= 0),
	CONSTRAINT "bookings_address_required" CHECK ("bookings"."address_id" IS NOT NULL OR "bookings"."delivery_type" IS NULL OR "bookings"."delivery_type" = 'pickup'),
	CONSTRAINT "bookings_quoted_complete" CHECK ("bookings"."status" IN ('inquiry', 'cancelled') OR (
        "bookings"."delivery_type" IS NOT NULL
        AND "bookings"."out_at" IS NOT NULL
        AND "bookings"."back_at" IS NOT NULL
        AND "bookings"."total_price_cents" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"department_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_department_id_name_unique" UNIQUE("department_id","name")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"company_name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "departments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "equipment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category_id" integer NOT NULL,
	"sku" text NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventory_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"equipment_id" integer NOT NULL,
	"asset_tag" text NOT NULL,
	"serial_number" text,
	"status" "inventory_status" DEFAULT 'active' NOT NULL,
	"condition" text,
	"notes" text,
	"purchased_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_asset_tag_unique" UNIQUE("asset_tag"),
	CONSTRAINT "inventory_id_equipment_id_unique" UNIQUE("id","equipment_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"paid_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_non_zero" CHECK ("payments"."amount_cents" <> 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_item_units" ADD CONSTRAINT "booking_item_units_booking_item_id_equipment_id_booking_items_id_equipment_id_fk" FOREIGN KEY ("booking_item_id","equipment_id") REFERENCES "public"."booking_items"("id","equipment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_item_units" ADD CONSTRAINT "booking_item_units_inventory_id_equipment_id_inventory_id_equipment_id_fk" FOREIGN KEY ("inventory_id","equipment_id") REFERENCES "public"."inventory"("id","equipment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_entity_type_entity_id_index" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "booking_item_units_inventory_id_index" ON "booking_item_units" USING btree ("inventory_id");--> statement-breakpoint
CREATE INDEX "booking_items_equipment_id_index" ON "booking_items" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "bookings_customer_id_index" ON "bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "bookings_status_index" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "equipment_category_id_index" ON "equipment" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "inventory_equipment_id_index" ON "inventory" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "payments_booking_id_index" ON "payments" USING btree ("booking_id");