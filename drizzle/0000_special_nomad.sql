CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`property_id` text,
	`actor_email` text NOT NULL,
	`details_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mapping_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`property_id` text NOT NULL,
	`check_id` text NOT NULL,
	`status` text NOT NULL,
	`confidence` integer NOT NULL,
	`approved_by` text NOT NULL,
	`approved_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_decision_property_check` ON `mapping_decisions` (`property_id`,`check_id`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` integer PRIMARY KEY NOT NULL,
	`alt_id` text,
	`supplier_id` integer,
	`name` text NOT NULL,
	`display_name` text,
	`property_type` text,
	`bedrooms` integer NOT NULL,
	`bathrooms` real NOT NULL,
	`max_guests` integer NOT NULL,
	`latitude` real,
	`longitude` real,
	`location_json` text,
	`tax_number` text,
	`owner_info_json` text,
	`policy_json` text,
	`raw_response_json` text NOT NULL,
	`imported_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
