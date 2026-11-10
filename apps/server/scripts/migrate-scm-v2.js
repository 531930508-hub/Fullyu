/**
 * 进销存二期增量迁移（采购价历史 / 批次效期 / FIFO 基础数据）。
 *
 * 背景：一期只能记一个档案采购价，也只有一个地点级结存，
 * 无法回答「这批料是哪次采购、单价多少」「哪批先到期、还剩多少」。
 *
 * 本脚本只做四类改动，全部可回滚：
 * 1. 新增列：scm_products.shelf_life_days、stock_ledgers.batch_no、
 *    goods_receipt_items.batch_no / production_date / expiry_date；
 * 2. 新增表：scm_purchase_prices、scm_stock_batches；
 * 3. 历史采购单回填价格历史（只补，不改采购单）；
 * 4. 期初结存补批次：保证「批次剩余量 = 结存数量」。
 *    已完工的生产工单优先按工单批号与单位成本补齐，其余按最新价/档案价。
 *
 * 安全边界：
 * - 不删除、不重命名任何表或列，不改历史业务单据；
 * - 不添加外键约束；
 * - 迁移前把涉及的表整表备份成 JSON；
 * - 重复执行自动跳过已完成的步骤，期初批次按差额补，不会重复累加。
 *
 * 用法：
 *   node scripts/migrate-scm-v2.js check
 *   node scripts/migrate-scm-v2.js dump
 *   node scripts/migrate-scm-v2.js apply
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const BACKUP_DIR = path.join(__dirname, '..', 'prisma', 'backups')

const EXISTING_TABLES = [
  'scm_suppliers',
  'scm_products',
  'scm_locations',
  'scm_boms',
  'scm_bom_items',
  'scm_transfers',
  'scm_transfer_items',
  'scm_production_orders',
  'scm_production_items',
  'purchase_orders',
  'purchase_order_items',
  'goods_receipts',
  'goods_receipt_items',
  'stock_balances',
  'stock_ledgers',
  'stock_adjusts',
  'stock_adjust_items',
  'scm_purchase_prices',
  'scm_stock_batches',
]

const NEW_TABLES = ['scm_purchase_prices', 'scm_stock_batches']

async function columnOf(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COLUMN_NAME, COLUMN_TYPE, DATA_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column,
  )
  return rows[0] ?? null
}

async function indexExists(table, index) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    table,
    index,
  )
  return rows.length > 0
}

async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    table,
  )
  return rows.length > 0
}

async function check() {
  const report = []
  for (const [table, column] of [
    ['scm_products', 'shelf_life_days'],
    ['stock_ledgers', 'batch_no'],
    ['goods_receipt_items', 'batch_no'],
    ['goods_receipt_items', 'production_date'],
    ['goods_receipt_items', 'expiry_date'],
  ]) {
    const col = await columnOf(table, column)
    report.push(`${table}.${column}: ${col ? col.COLUMN_TYPE : '缺失'}`)
  }
  for (const table of NEW_TABLES) {
    report.push(`${table}: ${(await tableExists(table)) ? '已存在' : '待创建'}`)
  }
  console.log(report.join('\n'))
}

async function dump() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const file = path.join(BACKUP_DIR, `scm-v2-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  const payload = {}
  for (const table of EXISTING_TABLES) {
    if (!(await tableExists(table))) continue
    payload[table] = await prisma.$queryRawUnsafe(`SELECT * FROM \`${table}\``)
  }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2))
  console.log(`备份：${file}`)
  console.log(Object.entries(payload).map(([k, v]) => `${k}: ${v.length} 行`).join('\n'))
  return file
}

async function addColumnIfMissing(table, column, ddl) {
  if (await columnOf(table, column)) return false
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`)
  console.log(`+ ${table}.${column}`)
  return true
}

async function addIndexIfMissing(table, index, columns) {
  if (await indexExists(table, index)) return
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${columns})`)
  console.log(`+ 索引 ${index}`)
}

/** 历史采购单回填价格历史：只取已生效的单，按供应商 + 商品 + 单价 + 日期去重 */
async function backfillPurchasePrices() {
  // 先做派生表分组，规避 MySQL 8 only_full_group_by 对聚合表达式里列引用的限制
  const result = await prisma.$executeRawUnsafe(`
    INSERT IGNORE INTO \`scm_purchase_prices\`
      (id, product_id, supplier_id, price, effective_from, source, ref, remark, created_by, created_at)
    SELECT
      CONCAT('PPH-', LEFT(MD5(CONCAT(t.supplier_id, '|', t.product_id, '|', t.price, '|', t.effective_from)), 24)),
      t.product_id,
      t.supplier_id,
      t.price,
      t.effective_from,
      'RECEIPT',
      t.ref,
      '由历史采购单补录',
      'migration',
      NOW(3)
    FROM (
      SELECT
        po.supplier_id,
        poi.product_id,
        poi.price,
        DATE(po.created_at) AS effective_from,
        MIN(po.id) AS ref
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.order_id
      WHERE po.supplier_type = 'EXTERNAL'
        AND po.supplier_id IS NOT NULL
        AND po.status IN ('APPROVED', 'PARTIAL', 'COMPLETED')
        AND poi.price > 0
      GROUP BY po.supplier_id, poi.product_id, poi.price, DATE(po.created_at)
    ) t
  `)
  console.log(`价格历史回填：${result} 行`)
}

/** 期初批次：按「结存 - 批次合计」的差额补一批 */
async function backfillOpeningBatches() {
  const balances = await prisma.$queryRawUnsafe(`
    SELECT
      sb.warehouse_id AS warehouseId,
      sb.owner_org_id AS ownerOrgId,
      sb.product_id AS productId,
      sb.qty AS qty,
      sp.purchase_price AS purchasePrice,
      sp.shelf_life_days AS shelfLifeDays,
      (SELECT p.price FROM scm_purchase_prices p
        WHERE p.product_id = sb.product_id
        ORDER BY p.effective_from DESC, p.created_at DESC LIMIT 1) AS latestPrice,
      (SELECT COALESCE(SUM(b.qty), 0) FROM scm_stock_batches b
        WHERE b.warehouse_id = sb.warehouse_id AND b.product_id = sb.product_id) AS batchQty
    FROM stock_balances sb
    JOIN scm_products sp ON sp.id = sb.product_id
    WHERE sb.qty > 0
  `)

  let created = 0
  for (const row of balances) {
    const balanceQty = Number(row.qty)
    const batchQty = Number(row.batchQty ?? 0)
    const diff = Math.round((balanceQty - batchQty) * 1000) / 1000
    if (diff <= 0) continue

    // 已完工工单优先：保证成品批次带真实批号与完工单位成本
    const orders = await prisma.$queryRawUnsafe(
      `SELECT id, batch_no AS batchNo, production_date AS productionDate,
              expiry_date AS expiryDate, unit_cost AS unitCost, output_qty AS outputQty
       FROM scm_production_orders
       WHERE status = 'COMPLETED'
         AND output_location_id = ?
         AND product_id = ?
         AND output_qty > 0
       ORDER BY created_at DESC LIMIT 1`,
      row.warehouseId,
      row.productId,
    )
    const order = orders[0]
    const useOrder = order && diff <= Number(order.outputQty)

    let unitCost = Number(row.latestPrice ?? row.purchasePrice ?? 0)
    let batchNo = '期初'
    let productionDate = null
    let expiryDate = null
    let sourceType = 'OPENING'
    let sourceNo = 'MIGRATION'
    if (useOrder) {
      unitCost = Number(order.unitCost ?? unitCost)
      batchNo = order.batchNo || '期初'
      productionDate = order.productionDate ? new Date(order.productionDate) : null
      expiryDate = order.expiryDate ? new Date(order.expiryDate) : null
      if (!expiryDate && productionDate && Number(row.shelfLifeDays) > 0) {
        expiryDate = new Date(productionDate.getTime() + Number(row.shelfLifeDays) * 86400000)
      }
      sourceType = 'PRODUCTION'
      sourceNo = order.id
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO \`scm_stock_batches\`
        (id, warehouse_id, owner_org_id, product_id, batch_no, production_date,
         expiry_date, qty, unit_cost, source_type, source_no, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      `BAT-${crypto.randomUUID()}`,
      row.warehouseId,
      row.ownerOrgId || row.warehouseId,
      row.productId,
      batchNo,
      productionDate,
      expiryDate,
      diff,
      unitCost,
      sourceType,
      sourceNo,
    )
    created += 1
  }
  console.log(`期初批次回填：${created} 条`)
}

async function apply() {
  await dump()

  // 1. 商品保质期
  await addColumnIfMissing(
    'scm_products',
    'shelf_life_days',
    '`shelf_life_days` INT NOT NULL DEFAULT 0',
  )

  // 2. 流水批号
  await addColumnIfMissing(
    'stock_ledgers',
    'batch_no',
    "`batch_no` VARCHAR(191) NOT NULL DEFAULT ''",
  )

  // 3. 入库明细批次
  await addColumnIfMissing(
    'goods_receipt_items',
    'batch_no',
    "`batch_no` VARCHAR(191) NOT NULL DEFAULT ''",
  )
  await addColumnIfMissing(
    'goods_receipt_items',
    'production_date',
    '`production_date` DATE NULL',
  )
  await addColumnIfMissing(
    'goods_receipt_items',
    'expiry_date',
    '`expiry_date` DATE NULL',
  )

  // 4. 新表
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`scm_purchase_prices\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`product_id\` VARCHAR(191) NOT NULL,
      \`supplier_id\` VARCHAR(191) NULL,
      \`price\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      \`effective_from\` DATE NOT NULL,
      \`source\` ENUM('MANUAL','RECEIPT') NOT NULL DEFAULT 'MANUAL',
      \`ref\` VARCHAR(191) NOT NULL DEFAULT '',
      \`remark\` VARCHAR(500) NOT NULL DEFAULT '',
      \`created_by\` VARCHAR(191) NOT NULL DEFAULT '',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`scm_purchase_prices_product_id_effective_from_idx\` (\`product_id\`, \`effective_from\`),
      INDEX \`scm_purchase_prices_supplier_id_idx\` (\`supplier_id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`scm_stock_batches\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`warehouse_id\` VARCHAR(191) NOT NULL,
      \`owner_org_id\` VARCHAR(191) NOT NULL DEFAULT '',
      \`product_id\` VARCHAR(191) NOT NULL,
      \`batch_no\` VARCHAR(191) NOT NULL DEFAULT '',
      \`production_date\` DATE NULL,
      \`expiry_date\` DATE NULL,
      \`qty\` DECIMAL(14,3) NOT NULL DEFAULT 0,
      \`unit_cost\` DECIMAL(14,6) NOT NULL DEFAULT 0,
      \`source_type\` VARCHAR(191) NOT NULL DEFAULT '',
      \`source_no\` VARCHAR(191) NOT NULL DEFAULT '',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`scm_stock_batches_warehouse_id_product_id_expiry_date_idx\` (\`warehouse_id\`, \`product_id\`, \`expiry_date\`),
      INDEX \`scm_stock_batches_expiry_date_idx\` (\`expiry_date\`),
      INDEX \`scm_stock_batches_product_id_idx\` (\`product_id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  console.log(`新表就绪：${NEW_TABLES.length} 张`)

  // 5. 历史数据回填
  await backfillPurchasePrices()
  await backfillOpeningBatches()

  console.log('迁移完成。')
}

const command = process.argv[2] || 'check'
const run = command === 'apply' ? apply : command === 'dump' ? dump : check
run()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
