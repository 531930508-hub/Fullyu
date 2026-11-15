-- 顾客资料与 CRM 双向同步：记录最近一次已对齐的 CRM profileVersion。
ALTER TABLE "customers" ADD COLUMN "crm_profile_version" INTEGER NOT NULL DEFAULT 0;
