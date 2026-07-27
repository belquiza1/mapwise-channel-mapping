import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey(),
  altId: text("alt_id"),
  supplierId: integer("supplier_id"),
  name: text("name").notNull(),
  displayName: text("display_name"),
  propertyType: text("property_type"),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: real("bathrooms").notNull(),
  maxGuests: integer("max_guests").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  locationJson: text("location_json"),
  taxNumber: text("tax_number"),
  ownerInfoJson: text("owner_info_json"),
  policyJson: text("policy_json"),
  rawResponseJson: text("raw_response_json").notNull(),
  importedBy: text("imported_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const mappingDecisions = sqliteTable("mapping_decisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyId: text("property_id").notNull(),
  checkId: text("check_id").notNull(),
  status: text("status").notNull(),
  confidence: integer("confidence").notNull(),
  approvedBy: text("approved_by").notNull(),
  approvedAt: text("approved_at").notNull(),
}, table => [uniqueIndex("mapping_decision_property_check").on(table.propertyId, table.checkId)]);

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventType: text("event_type").notNull(),
  propertyId: text("property_id"),
  actorEmail: text("actor_email").notNull(),
  detailsJson: text("details_json"),
  createdAt: text("created_at").notNull(),
});
