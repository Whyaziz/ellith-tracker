CREATE TABLE `batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`source_filename` text NOT NULL,
	`pdf_path` text NOT NULL,
	`uploaded_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`created_by` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`product_name` text NOT NULL,
	`sku` text NOT NULL,
	`seller_sku` text,
	`qty` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`resi` text NOT NULL,
	`order_id` text NOT NULL,
	`courier` text NOT NULL,
	`service` text NOT NULL,
	`is_cod` integer DEFAULT false NOT NULL,
	`weight_kg` real,
	`ship_date` text,
	`recipient_name` text NOT NULL,
	`recipient_phone` text,
	`recipient_address` text NOT NULL,
	`sorting_code` text,
	`status` text DEFAULT 'menunggu_dikemas' NOT NULL,
	`packed_at` text,
	`packed_by` integer,
	`shipped_at` text,
	`shipped_by` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`packed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shipped_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_resi_unique` ON `orders` (`resi`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_resi_idx` ON `orders` (`resi`);--> statement-breakpoint
CREATE INDEX `orders_batch_id_idx` ON `orders` (`batch_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE TABLE `scan_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer,
	`resi_scanned` text NOT NULL,
	`mode` text NOT NULL,
	`result` text NOT NULL,
	`user_id` integer NOT NULL,
	`scanned_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scan_logs_order_id_idx` ON `scan_logs` (`order_id`);--> statement-breakpoint
CREATE INDEX `scan_logs_resi_idx` ON `scan_logs` (`resi_scanned`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);