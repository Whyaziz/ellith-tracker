ALTER TABLE `batches` ADD `total_orders` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `is_packed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `is_shipped` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `orders_is_packed_idx` ON `orders` (`is_packed`);--> statement-breakpoint
CREATE INDEX `orders_is_shipped_idx` ON `orders` (`is_shipped`);