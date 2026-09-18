CREATE TABLE `sync_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`work_order_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL
);
