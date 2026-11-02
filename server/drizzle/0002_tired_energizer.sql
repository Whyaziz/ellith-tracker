ALTER TABLE `orders` ADD `qty_total` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `needs_review` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `validation_notes` text;--> statement-breakpoint
CREATE INDEX `orders_needs_review_idx` ON `orders` (`needs_review`);