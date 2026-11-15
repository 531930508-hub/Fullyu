-- CreateTable
CREATE TABLE "work_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_date" TEXT NOT NULL,
    "clock_in_at" DATETIME NOT NULL,
    "clock_out_at" DATETIME,
    "in_lat" REAL NOT NULL,
    "in_lng" REAL NOT NULL,
    "in_accuracy_m" INTEGER,
    "in_distance_m" INTEGER,
    "out_lat" REAL,
    "out_lng" REAL,
    "out_accuracy_m" INTEGER,
    "out_distance_m" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "open_key" TEXT,
    "pending_approval_id" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "adjusted_by" TEXT,
    "adjusted_at" DATETIME,
    "adjust_reason" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "planned_shifts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_date" TEXT NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "work_settlements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "rate_per_min_cents" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lines_json" TEXT NOT NULL DEFAULT '[]',
    "unclosed_count" INTEGER NOT NULL DEFAULT 0,
    "pending_approvals" INTEGER NOT NULL DEFAULT 0,
    "posted_expense_id" TEXT,
    "confirmed_by" TEXT,
    "confirmed_at" DATETIME,
    "confirmed_note" TEXT NOT NULL DEFAULT '',
    "voided_at" DATETIME,
    "voided_by" TEXT,
    "void_reason" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "work_sessions_open_key_key" ON "work_sessions"("open_key");

-- CreateIndex
CREATE UNIQUE INDEX "work_sessions_pending_approval_id_key" ON "work_sessions"("pending_approval_id");

-- CreateIndex
CREATE INDEX "work_sessions_store_id_business_date_idx" ON "work_sessions"("store_id", "business_date");

-- CreateIndex
CREATE INDEX "work_sessions_user_id_business_date_idx" ON "work_sessions"("user_id", "business_date");

-- CreateIndex
CREATE INDEX "work_sessions_status_clock_in_at_idx" ON "work_sessions"("status", "clock_in_at");

-- CreateIndex
CREATE INDEX "planned_shifts_store_id_business_date_idx" ON "planned_shifts"("store_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "planned_shifts_store_id_user_id_business_date_key" ON "planned_shifts"("store_id", "user_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "work_settlements_posted_expense_id_key" ON "work_settlements"("posted_expense_id");

-- CreateIndex
CREATE INDEX "work_settlements_store_id_period_start_idx" ON "work_settlements"("store_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "work_settlements_store_id_user_id_period_start_period_end_key" ON "work_settlements"("store_id", "user_id", "period_start", "period_end");
