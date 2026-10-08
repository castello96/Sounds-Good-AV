import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
// Relative import: drizzle-kit loads this file without the tsconfig path aliases.
import { DELIVERY_TYPES, EVENT_TYPES } from "../../shared/schema";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const inventoryStatus = pgEnum("inventory_status", [
  "active",
  "maintenance",
  "retired",
  "lost",
]);

export const bookingStatus = pgEnum("booking_status", [
  "inquiry",
  "quoted",
  "confirmed",
  "completed",
  "cancelled",
]);

export const deliveryType = pgEnum("delivery_type", DELIVERY_TYPES);

export const eventType = pgEnum("event_type", EVENT_TYPES);

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "check",
  "card",
  "venmo",
  "zelle",
  "bank_transfer",
  "other",
]);

export const auditAction = pgEnum("audit_action", ["insert", "update", "delete"]);

// ---------------------------------------------------------------------------
// Shared column helpers
// ---------------------------------------------------------------------------

const id = () => integer("id").primaryKey().generatedAlwaysAsIdentity();

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

const timestamps = {
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Catalog: departments > categories > equipment > inventory
// ---------------------------------------------------------------------------

export const departments = pgTable("departments", {
  id: id(),
  name: text("name").notNull().unique(),
  ...timestamps,
});

export const categories = pgTable(
  "categories",
  {
    id: id(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.departmentId, t.name)],
);

// A product type, e.g. "Shure SM58".
export const equipment = pgTable(
  "equipment",
  {
    id: id(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    sku: text("sku").notNull().unique(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.categoryId)],
);

// One physical unit of a piece of equipment.
export const inventory = pgTable(
  "inventory",
  {
    id: id(),
    equipmentId: integer("equipment_id")
      .notNull()
      .references(() => equipment.id),
    assetTag: text("asset_tag").notNull().unique(),
    serialNumber: text("serial_number"),
    status: inventoryStatus("status").notNull().default("active"),
    condition: text("condition"),
    notes: text("notes"),
    purchasedAt: date("purchased_at"),
    ...timestamps,
  },
  (t) => [
    index().on(t.equipmentId),
    // Target for the composite FK on booking_item_units.
    unique("inventory_id_equipment_id_unique").on(t.id, t.equipmentId),
  ],
);

// ---------------------------------------------------------------------------
// Customers and venues
// ---------------------------------------------------------------------------

export const customers = pgTable("customers", {
  id: id(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  // Always stored lowercased and trimmed; see normalizeEmail().
  email: text("email").notNull().unique(),
  phone: text("phone"),
  companyName: text("company_name"),
  notes: text("notes"),
  ...timestamps,
});

// An event venue. Not owned by a customer; venues can be reused.
export const addresses = pgTable("addresses", {
  id: id(),
  venueName: text("venue_name"),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  country: text("country").notNull().default("US"),
  notes: text("notes"),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    addressId: integer("address_id").references(() => addresses.id),
    status: bookingStatus("status").notNull().default("inquiry"),
    eventType: eventType("event_type").notNull(),
    // Null on an inquiry means the customer wasn't sure.
    deliveryType: deliveryType("delivery_type"),
    // The customer's original words. Never edited.
    requestDetails: text("request_details"),
    // Staff only.
    notes: text("notes"),
    eventStartAt: timestamptz("event_start_at").notNull(),
    eventEndAt: timestamptz("event_end_at").notNull(),
    // When gear leaves and returns. Availability is computed from these.
    outAt: timestamptz("out_at"),
    backAt: timestamptz("back_at"),
    totalPriceCents: integer("total_price_cents"),
    onsiteContactName: text("onsite_contact_name"),
    onsiteContactPhone: text("onsite_contact_phone"),
    ...timestamps,
  },
  (t) => [
    index().on(t.customerId),
    index().on(t.status),
    check("bookings_event_window", sql`${t.eventEndAt} > ${t.eventStartAt}`),
    check(
      "bookings_out_before_event",
      sql`${t.outAt} IS NULL OR ${t.outAt} <= ${t.eventStartAt}`,
    ),
    check(
      "bookings_back_after_event",
      sql`${t.backAt} IS NULL OR ${t.backAt} >= ${t.eventEndAt}`,
    ),
    check(
      "bookings_price_non_negative",
      sql`${t.totalPriceCents} IS NULL OR ${t.totalPriceCents} >= 0`,
    ),
    // Delivered bookings need somewhere to deliver to.
    check(
      "bookings_address_required",
      sql`${t.addressId} IS NOT NULL OR ${t.deliveryType} IS NULL OR ${t.deliveryType} = 'pickup'`,
    ),
    // Once quoted, the booking must be fully specified.
    check(
      "bookings_quoted_complete",
      sql`${t.status} IN ('inquiry', 'cancelled') OR (
        ${t.deliveryType} IS NOT NULL
        AND ${t.outAt} IS NOT NULL
        AND ${t.backAt} IS NOT NULL
        AND ${t.totalPriceCents} IS NOT NULL
      )`,
    ),
  ],
);

// Reservation by count, set at booking time.
export const bookingItems = pgTable(
  "booking_items",
  {
    id: id(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id),
    equipmentId: integer("equipment_id")
      .notNull()
      .references(() => equipment.id),
    quantity: integer("quantity").notNull(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.bookingId, t.equipmentId),
    // Target for the composite FK on booking_item_units.
    unique("booking_items_id_equipment_id_unique").on(t.id, t.equipmentId),
    index().on(t.equipmentId),
    check("booking_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

// Physical assignment of units, recorded at pack time.
export const bookingItemUnits = pgTable(
  "booking_item_units",
  {
    id: id(),
    bookingItemId: integer("booking_item_id").notNull(),
    inventoryId: integer("inventory_id").notNull(),
    // Present only so the composite FKs can guarantee the unit matches the line item.
    equipmentId: integer("equipment_id").notNull(),
    checkedOutAt: timestamptz("checked_out_at"),
    returnedAt: timestamptz("returned_at"),
    returnNotes: text("return_notes"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.bookingItemId, t.equipmentId],
      foreignColumns: [bookingItems.id, bookingItems.equipmentId],
    }),
    foreignKey({
      columns: [t.inventoryId, t.equipmentId],
      foreignColumns: [inventory.id, inventory.equipmentId],
    }),
    unique().on(t.bookingItemId, t.inventoryId),
    index().on(t.inventoryId),
    check(
      "booking_item_units_return_after_checkout",
      sql`${t.returnedAt} IS NULL OR (${t.checkedOutAt} IS NOT NULL AND ${t.returnedAt} >= ${t.checkedOutAt})`,
    ),
  ],
);

// Recorded manually by staff. Refunds are negative amounts.
export const payments = pgTable(
  "payments",
  {
    id: id(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id),
    amountCents: integer("amount_cents").notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference"),
    paidAt: timestamptz("paid_at").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index().on(t.bookingId),
    check("payments_amount_non_zero", sql`${t.amountCents} <> 0`),
  ],
);

// ---------------------------------------------------------------------------
// Staff and audit
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

// Written by the audit_row_change() trigger, never by application code.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    // Null when the change came from the public site or a script.
    userId: integer("user_id").references(() => users.id),
    action: auditAction("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    changes: jsonb("changes").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index().on(t.entityType, t.entityId)],
);
