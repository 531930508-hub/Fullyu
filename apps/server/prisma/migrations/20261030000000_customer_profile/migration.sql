-- 顾客资料扩展：头像、性别、生日（与在场字段口径一致）
ALTER TABLE "customers" ADD COLUMN "avatar_key" TEXT;
ALTER TABLE "customers" ADD COLUMN "gender" INTEGER;
ALTER TABLE "customers" ADD COLUMN "birthday" DATETIME;
