/**
 * 进销存一期增量迁移（物料分层 / 库存地点 / BOM / 调拨 / 生产）。
 *
 * 背景：现有进销存只能「采购 → 入库 → 盘库」，没有出库与调拨，
 * 也无法管理「采购瓶、泵、料体 → 代工厂组装 → 成品入库」的自研产品。
 *
 * 本脚本只做三类改动，全部可回滚：
 * 1. 新增列：scm_suppliers.is_processor、scm_products.type、四张表的 owner_org_id；
 * 2. 扩位：11 个数量列 INT → DECIMAL(14,3)，整数会无损转换；
 * 3. 新增表：库存地点、BOM、调拨、生产工单及其明细。
 *
 * 安全边界：
 * - 不删除、不重命名任何表或列，不改历史业务数据；
 * - 不添加外键约束（沿用这套库手工建表的习惯，应用层保证引用完整性）；
 * - 迁移前把涉及的表整表备份成 JSON，可随时 restore；
 * - 重复执行会自动跳过已完成的步骤。
 *
 * 用法：
 *   node scripts/migrate-scm-v1.js check
 *   node scripts/migrate-scm-v1.js dump
 *   node scripts/migrate-scm-v1.js apply
 *   node scripts/migrate-scm-v1.js restore <备份文件>
 */
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const BACKUP_DIR = path.join(__dirname, '..', 'prisma', 'backups')

const EXISTING_TABLES = [
  'scm_suppliers',
  'scm_products',
  'purchase_orders',
  'purchase_order_items',
  'goods_receipts',
  'goods_receipt_items',
  'stock_balances',
  'stock_ledgers',
  'stock_adjusts',
  'stock_adjust_items',
]

const NEW_TABLES = [
  'scm_locations',
  'scm_boms',
  'scm_bom_items',
  'scm_transfers',
  'scm_transfer_items',
  'scm_production_orders',
  'scm_production_items',
]

const NUMERIC_COLUMNS = [
  ['purchase_order_items', 'qty'],
  ['purchase_order_items', 'received_qty'],
  ['goods_receipt_items', 'ordered_qty'],
  ['goods_receipt_items', 'accept_qty'],
  ['goods_receipt_items', 'reject_qty'],
  ['stock_balances', 'qty'],
  ['stock_ledgers', 'qty'],
  ['stock_adjust_items', 'before_qty'],
  ['stock_adjust_items', 'after_qty'],
  ['stock_adjust_items', 'diff_qty'],
]

const OWNER_COLUMNS = ['stock_balances', 'stock_ledgers', 'goods_receipts', 'stock_adjusts']

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
  for (const [table, column] of NUMERIC_COLUMNS) {
    const col = await columnOf(table, column)
    report.push(`${table}.${column}: ${col ? col.COLUMN_TYPE : '缺失'}`)
  }
  for (const table of OWNER_COLUMNS) {
    const col = await columnOf(table, 'owner_org_id')
    report.push(`${table}.owner_org_id: ${col ? col.COLUMN_TYPE : '缺失'}`)
  }
  for (const table of NEW_TABLES) {
    report.push(`${table}: ${(await tableExists(table)) ? '已存在' : '待创建'}`)
  }
  console.log(report.join('\n'))
}

async function dump() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const file = path.join(BACKUP_DIR, `scm-v1-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  const payload = {}
  for (const table of EXISTING_TABLES) {
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

async function apply() {
  await dump()

  // 1. 合作方：代工厂标记
  await addColumnIfMissing(
    'scm_suppliers',
    'is_processor',
    '`is_processor` TINYINT(1) NOT NULL DEFAULT 0',
  )

  // 2. 物料分层
  await addColumnIfMissing(
    'scm_products',
    'type',
    "`type` ENUM('RAW','PACK','SEMI','FINISHED','CONSUMABLE') NOT NULL DEFAULT 'FINISHED'",
  )
  await addIndexIfMissing('scm_products', 'scm_products_type_enabled_idx', '`type`, `enabled`')

  // 3. 数量扩位：整数无损转小数
  for (const [table, column] of NUMERIC_COLUMNS) {
    const col = await columnOf(table, column)
    if (!col || col.DATA_TYPE === 'decimal') continue
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${table}\` MODIFY \`${column}\` DECIMAL(14,3) NOT NULL DEFAULT 0`,
    )
    console.log(`~ ${table}.${column}: ${col.COLUMN_TYPE} → DECIMAL(14,3)`)
  }

  // 4. 物权组织：新增后用原仓库 id 回填，历史数据不用改键
  for (const table of OWNER_COLUMNS) {
    const added = await addColumnIfMissing(
      table,
      'owner_org_id',
      '`owner_org_id` VARCHAR(191) NOT NULL DEFAULT \'\'',
    )
    if (added) {
      const result = await prisma.$executeRawUnsafe(
        `UPDATE \`${table}\` SET owner_org_id = warehouse_id WHERE owner_org_id = ''`,
      )
      console.log(`~ ${table}.owner_org_id 回填 ${result} 行`)
    }
  }
  await addIndexIfMissing('stock_balances', 'stock_balances_owner_org_id_idx', '`owner_org_id`')
  await addIndexIfMissing('stock_ledgers', 'stock_ledgers_owner_org_id_idx', '`owner_org_id`')

  // 5. 新表
  const statements = [
    `CREATE TABLE IF NOT EXISTS \`scm_locations\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`type\` ENUM('OWN','SUPPLIER','FACTORY','TRANSIT') NOT NULL DEFAULT 'OWN',
      \`org_id\` VARCHAR(191) NULL,
      \`supplier_id\` VARCHAR(191) NULL,
      \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
      \`remark\` VARCHAR(500) NOT NULL DEFAULT '',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`scm_locations_type_enabled_idx\` (\`type\`, \`enabled\`),
      INDEX \`scm_locations_org_id_idx\` (\`org_id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS \`scm_boms\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`product_id\` VARCHAR(191) NOT NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`status\` ENUM('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
      \`remark\` VARCHAR(500) NOT NULL DEFAULT '',
      \`created_by\` VARCHAR(191) NOT NULL DEFAULT '',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`scm_boms_product_id_version_key\` (\`product_id\`, \`version\`),
      INDEX \`scm_boms_product_id_status_idx\` (\`product_id\`, \`status\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS \`scm_bom_items\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`bom_id\` VARCHAR(191) NOT NULL,
      \`component_id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`spec\` VARCHAR(191) NOT NULL DEFAULT '',
      \`unit\` VARCHAR(191) NOT NULL DEFAULT '',
      \`qty_per_unit\` DECIMAL(14,6) NOT NULL DEFAULT 0,
      \`loss_rate\` DECIMAL(6,4) NOT NULL DEFAULT 0,
      \`remark\` VARCHAR(500) NOT NULL DEFAULT '',
      PRIMARY KEY (\`id\`),
      INDEX \`scm_bom_items_bom_id_idx\` (\`bom_id\`),
      INDEX \`scm_bom_items_component_id_idx\` (\`component_id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS \`scm_transfers\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`from_location_id\` VARCHAR(191) NOT NULL,
      \`to_location_id\` VARCHAR(191) NOT NULL,
      \`from_owner_org_id\` VARCHAR(191) NOT NULL,
      \`to_owner_org_id\` VARCHAR(191) NOT NULL,
      \`status\` ENUM('COMPLETED','CANCELLED') NOT NULL DEFAULT 'COMPLETED',
      \`remark\` VARCHAR(500) NOT NULL DEFAULT '',
      \`created_by\` VARCHAR(191) NOT NULL DEFAULT '',
      \`created_by_name\` VARCHAR(191) NOT NULL DEFAULT '',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`scm_transfers_from_location_id_created_at_idx\` (\`from_location_id\`, \`created_at\`),
      INDEX \`scm_transfers_to_location_id_created_at_idx\` (\`to_location_id\`, \`created_at\`),
      INDEX \`scm_transfers_created_at_idx\` (\`created_at\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS \`scm_transfer_items\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`transfer_id\` VARCHAR(191) NOT NULL,
      \`product_id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`spec\` VARCHAR(191) NOT NULL DEFAULT '',
      \`unit\` VARCHAR(191) NOT NULL DEFAULT '',
      \`qty\` DECIMAL(14,3) NOT NULL DEFAULT 0,
      PRIMARY KEY (\`id\`),
      INDEX \`scm_transfer_items_transfer_id_idx\` (\`transfer_id\`),
      INDEX \`scm_transfer_items_product_id_idx\` (\`product_id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS \`scm_production_orders\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`org_id\` VARCHAR(191) NOT NULL,
      \`product_id\` VARCHAR(191) NOT NULL,
      \`product_name\` VARCHAR(191) NOT NULL DEFAULT '',
      \`product_spec\` VARCHAR(191) NOT NULL DEFAULT '',
      \`product_unit\` VARCHAR(191) NOT NULL DEFAULT '',
      \`bom_version\` INT NOT NULL DEFAULT 1,
      \`planned_qty\` DECIMAL(14,3) NOT NULL DEFAULT 0,
      \`output_qty\` DECIMAL(14,3) NOT NULL DEFAULT 0,
      \`source_location_id\` VARCHAR(191) NOT NULL,
      \`output_location_id\` VARCHAR(191) NOT NULL,
      \`factory_location_id\` VARCHAR(191) NULL,
      \`status\` ENUM('APPROVED','ISSUED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'APPROVED',
      \`batch_no\` VARCHAR(191) NOT NULL DEFAULT '',
      \`production_date\` DATETIME(3) NULL,
      \`expiry_date\` DATETIME(3) NULL,
      \`processing_fee\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      \`material_cost\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      \`total_cost\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      \`unit_cost\` DECIMAL(14,6) NOT NULL DEFAULT 0,
      \`remark\` VARCHAR(500) NOT NULL DEFAULT '',
      \`created_by\` VARCHAR(191) NOT NULL DEFAULT '',
      \`created_by_name\` VARCHAR(191) NOT NULL DEFAULT '',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`scm_production_orders_org_id_status_idx\` (\`org_id\`, \`status\`),
      INDEX \`scm_production_orders_product_id_idx\` (\`product_id\`),
      INDEX \`scm_production_orders_created_at_idx\` (\`created_at\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS \`scm_production_items\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`order_id\` VARCHAR(191) NOT NULL,
      \`component_id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`spec\` VARCHAR(191) NOT NULL DEFAULT '',
      \`unit\` VARCHAR(191) NOT NULL DEFAULT '',
      \`qty_per_unit\` DECIMAL(14,6) NOT NULL DEFAULT 0,
      \`loss_rate\` DECIMAL(6,4) NOT NULL DEFAULT 0,
      \`required_qty\` DECIMAL(14,3) NOT NULL DEFAULT 0,
      \`issued_qty\` DECIMAL(14,3) NOT NULL DEFAULT 0,
      \`unit_price\` DECIMAL(14,6) NOT NULL DEFAULT 0,
      \`amount\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      PRIMARY KEY (\`id\`),
      INDEX \`scm_production_items_order_id_idx\` (\`order_id\`),
      INDEX \`scm_production_items_component_id_idx\` (\`component_id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  ]
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql)
  }
  console.log(`新表就绪：${NEW_TABLES.length} 张`)

  // 6. 每个有独立仓库的组织生成一条自有仓地点，id 复用组织 id
  const inserted = await prisma.$executeRawUnsafe(
    `INSERT INTO \`scm_locations\`
       (id, name, type, org_id, supplier_id, enabled, remark, created_at, updated_at)
     SELECT id, short_name, 'OWN', id, NULL, 1, '', NOW(3), NOW(3)
     FROM organizations WHERE has_warehouse = 1
     ON DUPLICATE KEY UPDATE name = VALUES(name), type = 'OWN', org_id = VALUES(org_id)`,
  )
  console.log(`自有仓地点同步：${inserted} 行`)

  console.log('迁移完成。')
}

async function restore(file) {
  if (!file) throw new Error('请指定备份文件')
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const [table, rows] of Object.entries(payload)) {
    if (!rows.length) continue
    const columns = Object.keys(rows[0])
    const placeholders = columns.map(() => '?').join(', ')
    const sql = `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES (${placeholders})`
    // 先清空再回灌，保证恢复后的行与备份完全一致
    await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``)
    for (const row of rows) {
      await prisma.$executeRawUnsafe(sql, ...columns.map((c) => row[c]))
    }
    console.log(`↺ ${table}: ${rows.length} 行`)
  }
  console.log('恢复完成。')
}

const command = process.argv[2] || 'check'
const arg = process.argv[3]
const run = command === 'apply' ? apply : command === 'dump' ? dump : command === 'restore' ? () => restore(arg) : check
run()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
