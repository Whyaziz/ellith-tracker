CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`address` text,
	`channel` text DEFAULT 'offline' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `customers_channel_idx` ON `customers` (`channel`);--> statement-breakpoint
ALTER TABLE `offline_orders` ADD `customer_id` integer REFERENCES customers(id);--> statement-breakpoint
CREATE INDEX `offline_orders_customer_id_idx` ON `offline_orders` (`customer_id`);