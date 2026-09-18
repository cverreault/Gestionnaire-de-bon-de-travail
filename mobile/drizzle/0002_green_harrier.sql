CREATE TABLE `location_fixes` (
	`id` text PRIMARY KEY NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`accuracy` real,
	`recorded_at` text NOT NULL,
	`source` text NOT NULL
);
