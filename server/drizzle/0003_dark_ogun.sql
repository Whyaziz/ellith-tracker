CREATE TABLE `offline_order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offline_order_id` integer NOT NULL,
	`product_id` integer,
	`seller_sku` text NOT NULL,
	`product_name` text NOT NULL,
	`qty` integer NOT NULL,
	`price` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`offline_order_id`) REFERENCES `offline_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `offline_order_items_order_idx` ON `offline_order_items` (`offline_order_id`);--> statement-breakpoint
CREATE INDEX `offline_order_items_sku_idx` ON `offline_order_items` (`seller_sku`);--> statement-breakpoint
CREATE TABLE `offline_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_no` text NOT NULL,
	`order_date` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text,
	`notes` text,
	`status` text DEFAULT 'selesai' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offline_orders_order_no_unique` ON `offline_orders` (`order_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `offline_orders_no_idx` ON `offline_orders` (`order_no`);--> statement-breakpoint
CREATE INDEX `offline_orders_status_idx` ON `offline_orders` (`status`);--> statement-breakpoint
CREATE INDEX `offline_orders_date_idx` ON `offline_orders` (`order_date`);--> statement-breakpoint
CREATE TABLE `product_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_categories_name_unique` ON `product_categories` (`name`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`seller_sku` text NOT NULL,
	`sku_temp` text,
	`name` text NOT NULL,
	`category_id` integer,
	`image_url` text,
	`min_stock` integer DEFAULT 10 NOT NULL,
	`max_stock` integer DEFAULT 100 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `product_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_seller_sku_unique` ON `products` (`seller_sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_seller_sku_idx` ON `products` (`seller_sku`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE TABLE `stock_batch_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_batch_id` integer NOT NULL,
	`product_id` integer,
	`seller_sku` text NOT NULL,
	`qty` integer NOT NULL,
	FOREIGN KEY (`stock_batch_id`) REFERENCES `stock_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `stock_batch_items_batch_idx` ON `stock_batch_items` (`stock_batch_id`);--> statement-breakpoint
CREATE INDEX `stock_batch_items_seller_sku_idx` ON `stock_batch_items` (`seller_sku`);--> statement-breakpoint
CREATE TABLE `stock_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_code` text NOT NULL,
	`notes` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_batches_batch_code_unique` ON `stock_batches` (`batch_code`);--> statement-breakpoint
CREATE TABLE `stock_mutations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer,
	`seller_sku` text NOT NULL,
	`type` text NOT NULL,
	`qty` integer NOT NULL,
	`notes` text NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_mutations_seller_sku_idx` ON `stock_mutations` (`seller_sku`);--> statement-breakpoint
CREATE INDEX `stock_mutations_created_at_idx` ON `stock_mutations` (`created_at`);