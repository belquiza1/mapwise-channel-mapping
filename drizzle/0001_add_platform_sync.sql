-- Platform-sync columns for the "Sync platform listings" flow.
-- record_kind discriminates the raw_response_json shape stored in `properties`:
--   'supplier' = legacy Supplier-API import, 'platform' = platform sync record.
ALTER TABLE `properties` ADD COLUMN `record_kind` text NOT NULL DEFAULT 'supplier';--> statement-breakpoint
ALTER TABLE `properties` ADD COLUMN `product_state` text;--> statement-breakpoint
ALTER TABLE `properties` ADD COLUMN `structure` text;--> statement-breakpoint
ALTER TABLE `properties` ADD COLUMN `source_version` text;--> statement-breakpoint
ALTER TABLE `properties` ADD COLUMN `synced_at` text;
