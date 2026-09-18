CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parts_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`name_fr` text NOT NULL,
	`name_en` text NOT NULL,
	`unit` text NOT NULL,
	`is_active` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parts_stock` (
	`part_id` text PRIMARY KEY NOT NULL,
	`quantity` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `process_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	`json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_number` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`current_step_id` text,
	`process_definition_id` text,
	`scheduled_date` text,
	`scheduled_start_time` text,
	`updated_at` text NOT NULL,
	`json` text NOT NULL
);
