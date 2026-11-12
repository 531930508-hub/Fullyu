-- CreateTable
CREATE TABLE `counters` (
    `name` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(191) NOT NULL,
    `value_json` TEXT NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `banners` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `image_url` VARCHAR(191) NOT NULL,
    `link_type` VARCHAR(191) NOT NULL,
    `link_value` VARCHAR(191) NOT NULL DEFAULT '',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `home_assets` (
    `key` VARCHAR(191) NOT NULL,
    `image_url` VARCHAR(191) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stores` (
    `id` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `city_en` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `name_en` VARCHAR(191) NOT NULL,
    `short` VARCHAR(191) NOT NULL,
    `address` TEXT NOT NULL,
    `address_en` TEXT NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `open` BOOLEAN NOT NULL DEFAULT true,
    `retail_pickup` BOOLEAN NOT NULL DEFAULT true,
    `hours` VARCHAR(191) NOT NULL,
    `printer_status` VARCHAR(191) NOT NULL DEFAULT 'online',
    `channels_json` TEXT NOT NULL,
    `positions_json` TEXT NOT NULL,
    `wait_minutes` INTEGER NOT NULL DEFAULT 8,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `name_en` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `name_en` VARCHAR(191) NOT NULL,
    `category_id` VARCHAR(191) NOT NULL,
    `series` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `price_cents` INTEGER NOT NULL,
    `cost_cents` INTEGER NOT NULL,
    `dose_g` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `temps_json` TEXT NOT NULL,
    `ice` BOOLEAN NOT NULL DEFAULT true,
    `member_eligible` BOOLEAN NOT NULL DEFAULT true,
    `desc_zh` VARCHAR(2000) NOT NULL DEFAULT '',
    `desc_en` VARCHAR(2000) NOT NULL DEFAULT '',
    `spec_zh` VARCHAR(2000) NOT NULL DEFAULT '',
    `spec_en` VARCHAR(2000) NOT NULL DEFAULT '',
    `tag_zh` VARCHAR(2000) NOT NULL DEFAULT '',
    `tag_en` VARCHAR(2000) NOT NULL DEFAULT '',
    `unit_zh` VARCHAR(191) NOT NULL DEFAULT '',
    `unit_en` VARCHAR(191) NOT NULL DEFAULT '',
    `image_url` VARCHAR(191) NOT NULL DEFAULT '',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock` (
    `store_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `grams` DOUBLE NOT NULL DEFAULT 0,
    `sold_out` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NULL,

    PRIMARY KEY (`store_id`, `product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mappings` (
    `id` VARCHAR(191) NOT NULL,
    `external_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT '袋',
    `factor` DOUBLE NOT NULL DEFAULT 1,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mappings_external_id_key`(`external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `builtin` BOOLEAN NOT NULL DEFAULT false,
    `perms_json` TEXT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `all_stores` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `token_version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_stores` (
    `user_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`user_id`, `store_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` VARCHAR(191) NOT NULL,
    `member_code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT '茶客',
    `phone` VARCHAR(191) NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `avatar_key` VARCHAR(191) NULL,
    `gender` INTEGER NULL,
    `birthday` DATETIME(3) NULL,
    `open_id` VARCHAR(191) NULL,
    `union_id` VARCHAR(191) NULL,
    `session_version` INTEGER NOT NULL DEFAULT 1,
    `member_tier` VARCHAR(191) NOT NULL DEFAULT 'standard',
    `member_until` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `customers_member_code_key`(`member_code`),
    UNIQUE INDEX `customers_phone_key`(`phone`),
    UNIQUE INDEX `customers_open_id_key`(`open_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL DEFAULT 'all',
    `category_id` VARCHAR(191) NULL,
    `amount_cents` INTEGER NOT NULL,
    `min_spend_cents` INTEGER NOT NULL DEFAULT 0,
    `valid_from` DATETIME(3) NOT NULL,
    `valid_to` DATETIME(3) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `note` VARCHAR(2000) NOT NULL DEFAULT '',
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_coupons` (
    `id` VARCHAR(191) NOT NULL,
    `coupon_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'available',
    `issued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `used_at` DATETIME(3) NULL,
    `order_id` VARCHAR(191) NULL,

    INDEX `customer_coupons_customer_id_status_idx`(`customer_id`, `status`),
    INDEX `customer_coupons_coupon_id_customer_id_idx`(`coupon_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `business` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `seat` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL,
    `payment_status` VARCHAR(191) NOT NULL DEFAULT 'unpaid',
    `total_cents` INTEGER NOT NULL,
    `refunded_cents` INTEGER NOT NULL DEFAULT 0,
    `coupon_id` VARCHAR(191) NULL,
    `coupon_title` VARCHAR(191) NULL,
    `coupon_discount_cents` INTEGER NOT NULL DEFAULT 0,
    `pickup_code` VARCHAR(191) NULL,
    `pickup_store_id` VARCHAR(191) NULL,
    `print_status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `parent_order_id` VARCHAR(191) NULL,
    `note` VARCHAR(2000) NOT NULL DEFAULT '',
    `customer_id` VARCHAR(191) NULL,
    `owner_kind` VARCHAR(191) NOT NULL DEFAULT 'customer',
    `created_by` VARCHAR(191) NULL,
    `payment_ref` VARCHAR(191) NULL,
    `payment_method` VARCHAR(191) NULL,
    `prepared_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL,
    `paid_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `refund_pending` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `orders_number_key`(`number`),
    INDEX `orders_store_id_status_created_at_idx`(`store_id`, `status`, `created_at`),
    INDEX `orders_customer_id_created_at_idx`(`customer_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `name_en` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `series` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `refunded_qty` INTEGER NOT NULL DEFAULT 0,
    `pending_refund_qty` INTEGER NOT NULL DEFAULT 0,
    `unit_price_cents` INTEGER NOT NULL,
    `total_cents` INTEGER NOT NULL,
    `cost_cents` INTEGER NOT NULL,
    `temp` VARCHAR(191) NULL,
    `ice` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_units` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `scanned_at` DATETIME(3) NULL,

    UNIQUE INDEX `order_units_label_key`(`label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `finance_entries` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `settlement` VARCHAR(191) NOT NULL,
    `memo` VARCHAR(191) NOT NULL DEFAULT '',
    `cost_cents` INTEGER NOT NULL DEFAULT 0,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `finance_entries_dedupe_key_key`(`dedupe_key`),
    INDEX `finance_entries_store_id_at_idx`(`store_id`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expenses` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `at` VARCHAR(191) NOT NULL,
    `memo` VARCHAR(2000) NOT NULL DEFAULT '',
    `source` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NULL,
    `source_key` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL,
    `voided_at` DATETIME(3) NULL,
    `voided_by` VARCHAR(191) NULL,

    UNIQUE INDEX `expenses_source_key_key`(`source_key`),
    INDEX `expenses_store_id_at_idx`(`store_id`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `losses` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `qty` DOUBLE NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `note` VARCHAR(2000) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL,
    `reported_by` VARCHAR(191) NULL,
    `decided_by` VARCHAR(191) NULL,
    `decided_at` DATETIME(3) NULL,
    `decision_note` VARCHAR(2000) NOT NULL DEFAULT '',
    `approval_id` VARCHAR(191) NULL,
    `at` DATETIME(3) NOT NULL,

    INDEX `losses_store_id_at_idx`(`store_id`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `approvals` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `execution_status` VARCHAR(191) NOT NULL DEFAULT '',
    `refund_intent_id` VARCHAR(191) NULL,
    `amount_cents` INTEGER NOT NULL,
    `store_id` VARCHAR(191) NULL,
    `order_id` VARCHAR(191) NULL,
    `summary` TEXT NOT NULL,
    `payload_json` TEXT NOT NULL,
    `requested_by` VARCHAR(191) NULL,
    `decided_by` VARCHAR(191) NULL,
    `comment` VARCHAR(2000) NOT NULL DEFAULT '',
    `result_note` VARCHAR(2000) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL,
    `decided_at` DATETIME(3) NULL,

    INDEX `approvals_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `logs` (
    `id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NULL,
    `actor_name` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `detail` VARCHAR(2000) NOT NULL DEFAULT '',
    `type` VARCHAR(191) NOT NULL DEFAULT '',
    `store_id` VARCHAR(191) NULL,
    `order_id` VARCHAR(191) NULL,
    `at` DATETIME(3) NOT NULL,

    INDEX `logs_at_idx`(`at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `print_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `business_key` VARCHAR(191) NOT NULL,
    `payload_json` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `claimed_at` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `print_jobs_business_key_key`(`business_key`),
    INDEX `print_jobs_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_intents` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `fingerprint` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `method` VARCHAR(191) NULL,
    `provider_ref` VARCHAR(191) NULL,
    `fail_reason` TEXT NULL,
    `response_json` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_intents_key_key`(`key`),
    INDEX `payment_intents_order_id_idx`(`order_id`),
    INDEX `payment_intents_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refund_intents` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `lines_json` TEXT NOT NULL,
    `approval_id` VARCHAR(191) NULL,
    `requested_by` VARCHAR(191) NULL,
    `decided_by` VARCHAR(191) NULL,
    `reason` VARCHAR(2000) NOT NULL DEFAULT '',
    `provider_ref` VARCHAR(191) NULL,
    `fail_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `refund_intents_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotency_keys` (
    `key` VARCHAR(191) NOT NULL,
    `response_json` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock` ADD CONSTRAINT `stock_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock` ADD CONSTRAINT `stock_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mappings` ADD CONSTRAINT `mappings_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_stores` ADD CONSTRAINT `user_stores_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_stores` ADD CONSTRAINT `user_stores_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_coupons` ADD CONSTRAINT `customer_coupons_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_coupons` ADD CONSTRAINT `customer_coupons_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_units` ADD CONSTRAINT `order_units_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_units` ADD CONSTRAINT `order_units_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `order_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `losses` ADD CONSTRAINT `losses_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `losses` ADD CONSTRAINT `losses_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `print_jobs` ADD CONSTRAINT `print_jobs_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

