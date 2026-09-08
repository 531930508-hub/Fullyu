/**
 * 第 2 批（审批流 / 进销存 / 财务）线上写操作冒烟。
 *
 * GET 接口已单独验过，这里只打写路径：单据能不能落库、审批实例有没有挂上、
 * 免审直通有没有把单据卡住、撤销后能不能收尾。跑完会清理掉自己造的单据，
 * 不给生产库留脏数据。
 *
 * 用法：node scripts/smoke-batch2.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3000/api/v1'
const ACCOUNT = { username: 'admin', password: '123456' }

let token = ''
const fails = []
const cleanup = []

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (json.code !== 0) {
    throw new Error(`${method} ${path} -> code=${json.code} ${json.message}`)
  }
  return json.data
}

async function step(name, fn) {
  try {
    const out = await fn()
    console.log(`  ✅ ${name}${out ? ` — ${out}` : ''}`)
    return true
  } catch (e) {
    fails.push(`${name}: ${e.message}`)
    console.log(`  ❌ ${name} — ${e.message}`)
    return false
  }
}

const money = (n) => Number(n).toFixed(2)

async function main() {
  console.log(`\n=== 第 2 批写操作冒烟 @ ${BASE} ===\n`)

  await step('登录取 token', async () => {
    const data = await call('POST', '/auth/admin/login', ACCOUNT)
    token = data.token
    return `${data.admin.name}（${(data.admin.roles || []).join('/')}）`
  })
  if (!token) {
    console.log('\n登录失败，后续跳过\n')
    process.exit(1)
  }

  // 取基础数据
  const orgs = await call('GET', '/organizations/options?purchase=1')
  const store = orgs.find((o) => o.type === 'STORE') || orgs[0]
  const products = await call('GET', '/scm/products')
  const suppliers = await call('GET', '/scm/suppliers')
  const product = products[0]
  const supplier = suppliers[0]
  console.log(`  基础数据：采购方 ${store.shortName}、商品 ${product.name}、供应商 ${supplier.name}\n`)

  // 1. 大额采购单 —— 应命中审批流并生成实例
  console.log('-- 采购单（大额，应挂审批）')
  let bigPo = null
  await step('创建大额采购单', async () => {
    bigPo = await call('POST', '/scm/purchase-orders', {
      buyerId: store.id,
      supplierType: 'EXTERNAL',
      supplierId: supplier.id,
      remark: '冒烟测试单，勿处理',
      items: [{ productId: product.id, qty: 500, price: 60 }],
    })
    cleanup.push(() => call('POST', `/scm/purchase-orders/${bigPo.id}/cancel`))
    return `${bigPo.id} 金额 ¥${money(bigPo.totalAmount)} 状态 ${bigPo.status} 流程「${bigPo.flowName}」`
  })
  await step('命中审批流且状态为审批中', async () => {
    if (bigPo.status !== 'PENDING_APPROVAL') throw new Error(`状态应为 PENDING_APPROVAL，实际 ${bigPo.status}`)
    if (!bigPo.approvalId) throw new Error('未生成审批实例')
    return `实例 ${bigPo.approvalId}`
  })
  await step('审批实例详情节点齐全', async () => {
    const inst = await call('GET', `/approvals/instances/${bigPo.approvalId}`)
    const nodes = inst.nodes || []
    if (!nodes.length) throw new Error('实例无节点')
    const cur = nodes.find((n) => n.status === 'PROCESSING')
    return `${nodes.length} 级审批，当前「${cur ? cur.name : '—'}」审批人 ${(cur?.approvers || []).join('/') || '—'}`
  })

  // 2. 小额采购单 —— 免审应直通，不能卡住
  console.log('\n-- 采购单（小额，免审应直通）')
  let smallPo = null
  await step('创建小额采购单', async () => {
    smallPo = await call('POST', '/scm/purchase-orders', {
      buyerId: store.id,
      supplierType: 'EXTERNAL',
      supplierId: supplier.id,
      remark: '冒烟测试单，勿处理',
      items: [{ productId: product.id, qty: 1, price: 1 }],
    })
    cleanup.push(() => call('POST', `/scm/purchase-orders/${smallPo.id}/cancel`))
    return `${smallPo.id} 金额 ¥${money(smallPo.totalAmount)} 状态 ${smallPo.status}`
  })
  await step('小额单未被审批卡住（可直接收货或已挂审批，二者之一即合理）', async () => {
    if (smallPo.status === 'APPROVED') return '免审直通，已转待收货'
    if (smallPo.status === 'PENDING_APPROVAL' && smallPo.approvalId) return '命中了小额流程，实例已生成'
    throw new Error(`状态异常：${smallPo.status} approvalId=${smallPo.approvalId}`)
  })

  // 3. 支出录入
  console.log('\n-- 支出录入')
  const month = new Date().toISOString().slice(0, 7)
  let expense = null
  await step('录入一笔其他支出', async () => {
    expense = await call('POST', '/finance/expenses', {
      orgId: store.id,
      month,
      category: 'OTHER',
      name: '冒烟测试费用',
      amount: 8888,
      remark: '冒烟测试，跑完即删',
    })
    cleanup.push(async () => {
      if (expense.status === 'PENDING_APPROVAL' && expense.approvalId) {
        await call('POST', `/approvals/instances/${expense.approvalId}/cancel`, { comment: '冒烟清理' })
      }
      await call('DELETE', `/finance/expenses/${expense.id}`)
    })
    return `${expense.id} 状态 ${expense.status} 流程「${expense.flowName || '免审'}」`
  })
  await step('其他支出未填名称应被拦', async () => {
    try {
      await call('POST', '/finance/expenses', { orgId: store.id, month, category: 'OTHER', amount: 1 })
    } catch (e) {
      if (e.message.includes('4284')) return '按预期报 4284'
      throw e
    }
    throw new Error('未填名称竟然录入成功了')
  })

  // 4. 库存调整
  console.log('\n-- 库存调整')
  let adjust = null
  await step('提交一笔盘亏调整', async () => {
    const stock = await call('GET', `/scm/stock?warehouseId=${store.id}`)
    const row = stock.find((s) => Number(s.qty) > 1)
    if (!row) throw new Error('该仓库没有可调整的库存')
    adjust = await call('POST', '/scm/stock/adjusts', {
      warehouseId: store.id,
      reason: 'LOSS',
      remark: '冒烟测试，跑完撤销',
      items: [{ productId: row.productId, afterQty: Number(row.qty) - 1 }],
    })
    cleanup.push(() => call('POST', `/scm/stock/adjusts/${adjust.id}/cancel`))
    return `${adjust.id} 状态 ${adjust.status}，${row.name} ${row.qty} → ${Number(row.qty) - 1}`
  })

  // 5. 收入抽取（自有小程序，幂等）
  console.log('\n-- 收入抽取')
  await step('SELF 源抽取当月收入', async () => {
    const res = await call('POST', `/finance/revenue/sources/SELF/sync`, { month })
    return `${res.month} 归集 ${res.orgCount} 家门店 / ${res.orderCount} 笔订单 / ¥${money(res.amount)}，跳过 ${res.skipped} 笔无场馆归属`
  })
  await step('重复抽取幂等，金额不叠加', async () => {
    const a = await call('POST', `/finance/revenue/sources/SELF/sync`, { month })
    const b = await call('POST', `/finance/revenue/sources/SELF/sync`, { month })
    if (money(a.amount) !== money(b.amount)) throw new Error(`两次金额不一致：${a.amount} vs ${b.amount}`)
    return `两次均为 ¥${money(b.amount)}`
  })
  await step('未打通的源抽取应被明确拒绝', async () => {
    const sources = await call('GET', '/finance/revenue/sources')
    const pending = sources.find((s) => s.status === 'PENDING')
    if (!pending) return '没有待打通的源，跳过'
    try {
      await call('POST', `/finance/revenue/sources/${pending.key}/sync`, { month })
    } catch (e) {
      if (e.message.includes('4273')) return `${pending.name} 按预期报 4273`
      throw e
    }
    throw new Error('未打通的源竟然抽取成功了')
  })
  await step('手工源没有抽取动作', async () => {
    try {
      await call('POST', '/finance/revenue/sources/MANUAL/sync', { month })
    } catch (e) {
      if (e.message.includes('4272')) return '按预期报 4272'
      throw e
    }
    throw new Error('手工源竟然可以抽取')
  })

  // 6. 看板能把上面的数算进去
  console.log('\n-- 财务看板')
  await step('看板聚合可读且门店明细对得上', async () => {
    const board = await call('GET', `/finance/dashboard?month=${month}`)
    const rows = board.stores || []
    const sum = rows.reduce((s, r) => s + Number(r.revenue), 0)
    if (Math.abs(sum - Number(board.total.revenue)) > 1) {
      throw new Error(`门店营收合计 ${money(sum)} 与汇总 ${money(board.total.revenue)} 不一致`)
    }
    return `${rows.length} 家门店，营收 ¥${money(board.total.revenue)}，支出 ¥${money(board.total.totalExpense)}`
  })

  // 7. 清理
  console.log('\n-- 清理冒烟数据')
  for (const fn of cleanup.reverse()) {
    await step('清理', fn)
  }

  console.log(`\n=== 结果：${fails.length ? `${fails.length} 项失败` : '全部通过'} ===`)
  fails.forEach((f) => console.log(`  - ${f}`))
  process.exit(fails.length ? 1 : 0)
}

main().catch((e) => {
  console.error('冒烟脚本异常中止：', e)
  process.exit(1)
})
