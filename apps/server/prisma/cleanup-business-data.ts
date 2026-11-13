/**
 * 上线前业务数据清理：保留主数据，清空交易与历史，重置单号计数器。
 *
 * 运行：
 *   pnpm --filter @teahour/server db:clean            # 只体检，打印将删除的行数
 *   pnpm --filter @teahour/server db:clean -- --apply # 真正执行
 *
 * 保留（主数据，重建期继续使用）：
 *   门店 stores / 分类 categories / 商品 products / 库存 stock / 原料映射 mappings
 *   账号 users / 角色 roles / 授权 user_roles / 门店归属 user_stores
 *   首页内容 banners home_assets / 经营设置 settings
 *
 * 清空（交易与历史）：
 *   订单 orders order_items order_units
 *   支付 payment_intents / 退款 refund_intents / 打印任务 print_jobs
 *   资金 finance_entries / 费用 expenses / 损耗 losses / 审批 approvals
 *   会员 customers coupons customer_coupons
 *   审计日志 logs / 幂等键 idempotency_keys
 *
 * 计数器 counters 清空后按需重建，订单号从头开始，便于按生产标准重新开账。
 *
 * 注意：本脚本不动账号。执行前请自行确认至少保留一个可登录的管理员。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

/** 依赖顺序：先删子表再删主表，避免外键报错。 */
const deletable = [
  ['printJob', () => prisma.printJob.deleteMany()],
  ['paymentIntent', () => prisma.paymentIntent.deleteMany()],
  ['refundIntent', () => prisma.refundIntent.deleteMany()],
  ['orderUnit', () => prisma.orderUnit.deleteMany()],
  ['orderItem', () => prisma.orderItem.deleteMany()],
  ['financeEntry', () => prisma.financeEntry.deleteMany()],
  ['order', () => prisma.order.deleteMany()],
  ['approval', () => prisma.approval.deleteMany()],
  ['loss', () => prisma.loss.deleteMany()],
  ['expense', () => prisma.expense.deleteMany()],
  ['log', () => prisma.log.deleteMany()],
  ['customerCoupon', () => prisma.customerCoupon.deleteMany()],
  ['coupon', () => prisma.coupon.deleteMany()],
  ['customer', () => prisma.customer.deleteMany()],
  ['idempotencyKey', () => prisma.idempotencyKey.deleteMany()],
  ['counter', () => prisma.counter.deleteMany()]
] as const;

const keepers = [
  ['store', () => prisma.store.count()],
  ['category', () => prisma.category.count()],
  ['product', () => prisma.product.count()],
  ['stock', () => prisma.stock.count()],
  ['mapping', () => prisma.mapping.count()],
  ['user', () => prisma.user.count()],
  ['role', () => prisma.role.count()],
  ['userRole', () => prisma.userRole.count()],
  ['userStore', () => prisma.userStore.count()],
  ['banner', () => prisma.banner.count()],
  ['homeAsset', () => prisma.homeAsset.count()],
  ['setting', () => prisma.setting.count()]
] as const;

async function main() {
  console.log(apply ? '模式：执行清理（--apply）' : '模式：体检（加 --apply 才会删除）');
  console.log('\n保留的主数据：');
  for (const [name, count] of keepers) {
    console.log(`  ${name.padEnd(14)} ${await count()}`);
  }

  console.log('\n待清理的表：');
  let total = 0;
  const rows: Array<(typeof deletable)[number]> = [];
  for (const entry of deletable) {
    const name = entry[0];
    const model = (prisma as unknown as Record<string, { count: () => Promise<number> }>)[name];
    const count = model && typeof model.count === 'function' ? await model.count() : 0;
    total += count;
    console.log(`  ${name.padEnd(14)} ${count}`);
    rows.push(entry);
  }
  console.log(`  合计 ${total} 行`);

  if (!apply) {
    console.log('\n未做任何修改。确认无误后执行：pnpm --filter @teahour/server db:clean -- --apply');
    return;
  }

  for (const [name, run] of rows) {
    const result = await run();
    console.log(`  已清理 ${name.padEnd(14)} ${result.count}`);
  }
  console.log('\n清理完成。账号与主数据未改动。');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });