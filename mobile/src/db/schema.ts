import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Local source of truth of the technician app (ADR-016, B38.4).
 * Server-owned tables are never mutated locally except by the pull ; the
 * full body of a work order is kept as JSON, with a few columns copied out
 * for listing and ordering.
 */

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const workOrders = sqliteTable('work_orders', {
  id: text('id').primaryKey(),
  referenceNumber: text('reference_number').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  currentStepId: text('current_step_id'),
  processDefinitionId: text('process_definition_id'),
  scheduledDate: text('scheduled_date'),
  scheduledStartTime: text('scheduled_start_time'),
  updatedAt: text('updated_at').notNull(),
  /** SyncWorkOrder as JSON. */
  json: text('json').notNull(),
});

export const processSnapshots = sqliteTable('process_snapshots', {
  id: text('id').primaryKey(),
  version: integer('version').notNull(),
  updatedAt: text('updated_at').notNull(),
  json: text('json').notNull(),
});

export const partsCatalog = sqliteTable('parts_catalog', {
  id: text('id').primaryKey(),
  sku: text('sku').notNull(),
  nameFr: text('name_fr').notNull(),
  nameEn: text('name_en').notNull(),
  unit: text('unit').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const partsStock = sqliteTable('parts_stock', {
  partId: text('part_id').primaryKey(),
  quantity: integer('quantity').notNull(),
  updatedAt: text('updated_at').notNull(),
});
