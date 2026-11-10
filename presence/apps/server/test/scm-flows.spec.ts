import { randomUUID } from 'crypto'
import { PrismaService } from '../src/common/prisma.service'
import { StockService } from '../src/modules/scm/stock.service'
import { ScmLocationService } from '../src/modules/scm/scm-location.service'
import { ScmBomService } from '../src/modules/scm/scm-bom.service'
import { ScmTransferService } from '../src/modules/scm/scm-transfer.service'
import { ScmProductionService } from '../src/modules/scm/scm-production.service'
import { PurchaseService } from '../src/modules/scm/purchase.service'
import { ScmPriceService } from '../src/modules/scm/scm-price.service'
import { StockQueryService } from '../src/modules/scm/stock-query.service'
import type { AdminContext } from '../src/modules/auth/admin-jwt.strategy'
import { createRedisMock } from './helpers'

/**
 * 进销存一期：
 * - 多地点库存（货可以放在供应商处/代工厂）
 * - 调拨一次事务双向记账，撤销写红字
 * - BOM 领料损耗、自产/委外两条生产链路
 * - 门店向总部订货时扣减总部库存，总部没结存则按直发不扣
 *
 * 所有商品用随机编码，结束后按商品维度清理，不碰演示数据。
 */
describe('进销存一期：多地点 / 调拨 / BOM 生产 / 总部供货扣减', () => {
  const prisma = new PrismaService()
  const redis = createRedisMock() as any
  const stock = new StockService(prisma)
  const locations = new ScmLocationService(prisma)
  const boms = new ScmBomService(prisma)
  const prices = new ScmPriceService(prisma)
  const transfers = new ScmTransferService(prisma, redis, stock, locations)
  const production = new ScmProductionService(prisma, redis, stock, locations, boms, prices)
  const purchase = new PurchaseService(prisma, redis, {} as any, stock, locations, prices)
  const stockQuery = new StockQueryService(prisma, redis, {} as any, stock, locations, prices)

  const admin: AdminContext = {
    adminId: 'test-scm-admin',
    username: 'scm-test',
    permissions: ['*'],
    orgId: 'HQ',
    dataScope: 'ALL',
    roles: [],
  }

  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
  const productIds: string[] = []
  const locationIds: string[] = []
  const transferIds: string[] = []
  const productionIds: string[] = []
  const purchaseIds: string[] = []
  let supplierId = ''

  async function product(
    label: string,
    type: 'RAW' | 'PACK' | 'FINISHED',
    purchasePrice: number,
  ) {
    const row = await prisma.scmProduct.create({
      data: {
        code: `T-${suffix}-${label}`,
        name: `测试${label}`,
        spec: '测试规格',
        unit: type === 'RAW' ? 'kg' : '个',
        type,
        purchasePrice,
        supplyPrice: 0,
        enabled: true,
      },
    })
    productIds.push(row.id)
    return row
  }

  async function addStock(locationId: string, ownerOrgId: string, productId: string, qty: number) {
    await prisma.$transaction((tx) =>
      stock.move(tx, {
        warehouseId: locationId,
        ownerOrgId,
        productId,
        qty,
        type: 'IN',
        ref: `TEST-${suffix}`,
      }),
    )
  }

  const balance = (warehouseId: string, productId: string) =>
    prisma.stockBalance.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    })

  beforeAll(async () => {
    const supplier = await prisma.scmSupplier.create({
      data: {
        name: `测试代工厂-${suffix}`,
        contact: '测试',
        phone: '13800000000',
        isProcessor: true,
      },
    })
    supplierId = supplier.id

    for (const [label, type, orgId] of [
      ['供应商处', 'SUPPLIER', 'HQ'],
      // 委外测试从 S001 领料，代工厂地点的物权须跟材料一致
      ['代工厂处', 'FACTORY', 'S001'],
    ] as const) {
      const row = await prisma.scmLocation.create({
        data: {
          id: randomUUID(),
          name: `测试${label}-${suffix}`,
          type,
          orgId,
          supplierId,
          enabled: true,
        },
      })
      locationIds.push(row.id)
    }
  })

  afterAll(async () => {
    if (productionIds.length) {
      await prisma.scmProductionOrder.deleteMany({ where: { id: { in: productionIds } } })
    }
    if (transferIds.length) {
      await prisma.scmTransfer.deleteMany({ where: { id: { in: transferIds } } })
    }
    if (purchaseIds.length) {
      await prisma.purchaseOrder.deleteMany({ where: { id: { in: purchaseIds } } })
    }
    if (productIds.length) {
      await prisma.stockLedger.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.stockBalance.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.scmStockBatch.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.scmPurchasePrice.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.scmBom.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.scmProduct.deleteMany({ where: { id: { in: productIds } } })
    }
    if (locationIds.length) {
      await prisma.scmLocation.deleteMany({ where: { id: { in: locationIds } } })
    }
    if (supplierId) await prisma.scmSupplier.delete({ where: { id: supplierId } })
    await prisma.$disconnect()
  })

  it('调拨：源地点扣减、目标地点增加，撤销后双向回滚', async () => {
    const p = await product('调拨', 'PACK', 0.1)
    const [supplierLoc] = locationIds
    await addStock('S001', 'S001', p.id, 100)

    const created = await transfers.create(admin, {
      fromLocationId: 'S001',
      toLocationId: supplierLoc,
      items: [{ productId: p.id, qty: 30 }],
    })
    transferIds.push(created.id)
    expect(created.status).toBe('COMPLETED')
    expect(Number((await balance('S001', p.id))!.qty)).toBe(70)
    expect(Number((await balance(supplierLoc, p.id))!.qty)).toBe(30)
    expect((await balance(supplierLoc, p.id))!.ownerOrgId).toBe('HQ')

    await transfers.cancel(admin, created.id)
    expect(Number((await balance('S001', p.id))!.qty)).toBe(100)
    expect(Number((await balance(supplierLoc, p.id))!.qty)).toBe(0)
    expect((await prisma.scmTransfer.findUnique({ where: { id: created.id } }))!.status).toBe(
      'CANCELLED',
    )
  })

  it('自产：BOM 用量含损耗，领料扣组件，完工入成品并算出单位成本', async () => {
    const bottle = await product('瓶子', 'PACK', 0.03)
    const liquid = await product('料体', 'RAW', 0.02)
    const finished = await product('精油', 'FINISHED', 0)

    const bom = await boms.save(admin, {
      productId: finished.id,
      items: [
        { componentId: bottle.id, qtyPerUnit: 2, lossRate: 0.05 },
        { componentId: liquid.id, qtyPerUnit: 1, lossRate: 0 },
      ],
    })
    expect(bom.version).toBe(1)

    await addStock('S001', 'S001', bottle.id, 100)
    await addStock('S001', 'S001', liquid.id, 100)

    const order = await production.create(admin, {
      productId: finished.id,
      plannedQty: 10,
      sourceLocationId: 'S001',
      outputLocationId: 'S001',
      processingFee: 0.2,
    })
    productionIds.push(order.id)
    expect(order.status).toBe('APPROVED')
    expect(Number(order.materialCost)).toBeCloseTo(0.83, 2)
    expect(Number(order.totalCost)).toBeCloseTo(1.03, 2)

    await production.issue(admin, order.id)
    expect(Number((await balance('S001', bottle.id))!.qty)).toBe(79)
    expect(Number((await balance('S001', liquid.id))!.qty)).toBe(90)

    const done = await production.complete(admin, order.id)
    expect(done.status).toBe('COMPLETED')
    expect(Number(done.outputQty)).toBe(10)
    expect(Number(done.unitCost)).toBeCloseTo(0.103, 6)
    expect(Number((await balance('S001', finished.id))!.qty)).toBe(10)
  })

  it('委外：领料先调拨到代工厂，完工在代工厂核销，成品回自有仓', async () => {
    const bottle = await product('委外瓶', 'PACK', 0.03)
    const liquid = await product('委外料', 'RAW', 0.02)
    const finished = await product('委外精油', 'FINISHED', 0)
    const factoryLoc = locationIds[1]

    await boms.save(admin, {
      productId: finished.id,
      items: [
        { componentId: bottle.id, qtyPerUnit: 1, lossRate: 0 },
        { componentId: liquid.id, qtyPerUnit: 1, lossRate: 0 },
      ],
    })
    await addStock('S001', 'S001', bottle.id, 50)
    await addStock('S001', 'S001', liquid.id, 50)

    const order = await production.create(admin, {
      productId: finished.id,
      plannedQty: 20,
      sourceLocationId: 'S001',
      outputLocationId: 'S001',
      factoryLocationId: factoryLoc,
      processingFee: 0.4,
    })
    productionIds.push(order.id)

    await production.issue(admin, order.id)
    expect(Number((await balance('S001', bottle.id))!.qty)).toBe(30)
    expect(Number((await balance(factoryLoc, bottle.id))!.qty)).toBe(20)
    expect(Number((await balance(factoryLoc, liquid.id))!.qty)).toBe(20)

    await production.complete(admin, order.id)
    expect(Number((await balance(factoryLoc, bottle.id))!.qty)).toBe(0)
    expect(Number((await balance(factoryLoc, liquid.id))!.qty)).toBe(0)
    expect(Number((await balance('S001', finished.id))!.qty)).toBe(20)
  })

  it('总部供货：收货时扣减总部库存，总部无结存则按直发不扣、不出现负库存', async () => {
    const stocked = await product('总部有货', 'FINISHED', 0.1)
    const dropShip = await product('总部直发', 'FINISHED', 0.1)
    await addStock('HQ', 'HQ', stocked.id, 100)

    async function purchaseOrder(productId: string, qty: number) {
      const id = `TPO${suffix}${purchaseIds.length}`
      await prisma.purchaseOrder.create({
        data: {
          id,
          buyerId: 'S001',
          supplierType: 'HQ',
          supplierName: '总部',
          totalAmount: 0,
          status: 'APPROVED',
          items: {
            create: [
              {
                productId,
                name: '测试商品',
                spec: '测试规格',
                unit: '个',
                price: 0,
                qty,
              },
            ],
          },
        },
      })
      purchaseIds.push(id)
      return id
    }

    const first = await purchaseOrder(stocked.id, 40)
    await purchase.createReceipt(admin, {
      poId: first,
      warehouseId: 'S001',
      items: [{ productId: stocked.id, acceptQty: 40, rejectQty: 0 }],
    })
    expect(Number((await balance('HQ', stocked.id))!.qty)).toBe(60)
    expect(Number((await balance('S001', stocked.id))!.qty)).toBe(40)

    const second = await purchaseOrder(dropShip.id, 5)
    await purchase.createReceipt(admin, {
      poId: second,
      warehouseId: 'S001',
      items: [{ productId: dropShip.id, acceptQty: 5, rejectQty: 0 }],
    })
    expect(Number((await balance('S001', dropShip.id))!.qty)).toBe(5)
    expect(await balance('HQ', dropShip.id)).toBeNull()
  })

  it('批次 FIFO：先到期先出，流水按批次拆行，结存金额按批次成本汇总', async () => {
    const p = await product('批次', 'PACK', 0.1)
    await prisma.$transaction((tx) =>
      stock.move(tx, {
        warehouseId: 'S001',
        ownerOrgId: 'S001',
        productId: p.id,
        qty: 10,
        type: 'IN',
        ref: `BATCH-LATE-${suffix}`,
        batch: { batchNo: 'B-LATE', expiryDate: '2027-12-31', unitCost: 0.05 },
      }),
    )
    await prisma.$transaction((tx) =>
      stock.move(tx, {
        warehouseId: 'S001',
        ownerOrgId: 'S001',
        productId: p.id,
        qty: 10,
        type: 'IN',
        ref: `BATCH-EARLY-${suffix}`,
        batch: { batchNo: 'B-EARLY', expiryDate: '2026-12-31', unitCost: 0.07 },
      }),
    )

    const out = await prisma.$transaction((tx) =>
      stock.move(tx, {
        warehouseId: 'S001',
        ownerOrgId: 'S001',
        productId: p.id,
        qty: -12,
        type: 'OUT',
        ref: `FIFO-${suffix}`,
      }),
    )
    expect(out.allocations.map((it) => [it.batchNo, it.qty])).toEqual([
      ['B-EARLY', 10],
      ['B-LATE', 2],
    ])
    expect(out.cost).toBeCloseTo(0.8, 6)

    const batches = await prisma.scmStockBatch.findMany({
      where: { warehouseId: 'S001', productId: p.id },
      orderBy: { batchNo: 'asc' },
    })
    expect(batches.map((it) => [it.batchNo, Number(it.qty)])).toEqual([
      ['B-EARLY', 0],
      ['B-LATE', 8],
    ])
    expect(Number((await balance('S001', p.id))!.qty)).toBe(8)

    const ledgers = await prisma.stockLedger.findMany({
      where: { productId: p.id, ref: `FIFO-${suffix}` },
      orderBy: { batchNo: 'asc' },
    })
    expect(ledgers.map((it) => [it.batchNo, Number(it.qty)])).toEqual([
      ['B-EARLY', -10],
      ['B-LATE', -2],
    ])
  })

  it('效期看板：临期与过期分开统计，筛选后行数正确', async () => {
    const p = await product('效期', 'FINISHED', 0.1)
    const day = 86400000
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const at = (offset: number) => new Date(today.getTime() + offset * day)

    for (const [batchNo, expiry, qty, unitCost] of [
      ['E-EXPIRED', at(-5), 2, 0.1],
      ['E-EXPIRING', at(10), 3, 0.1],
      ['E-FRESH', at(400), 4, 0.1],
    ] as const) {
      await prisma.$transaction((tx) =>
        stock.move(tx, {
          warehouseId: 'S001',
          ownerOrgId: 'S001',
          productId: p.id,
          qty,
          type: 'IN',
          ref: `EXP-${suffix}`,
          batch: { batchNo, expiryDate: expiry, unitCost },
        }),
      )
    }

    const board = await stockQuery.batches(admin, { keyword: p.code, expiringDays: 90 })
    expect(board.summary).toMatchObject({ total: 3, expiring: 1, expired: 1 })
    expect(Number(board.summary.qty)).toBe(9)
    expect(board.summary.amount).toBeCloseTo(0.9, 2)

    const expiring = await stockQuery.batches(admin, {
      keyword: p.code,
      status: 'EXPIRING',
      expiringDays: 90,
    })
    expect(expiring.rows.map((it) => it.batchNo)).toEqual(['E-EXPIRING'])
    expect(expiring.rows[0].daysToExpiry).toBe(10)
    expect(expiring.rows[0].unitCost).toBeCloseTo(0.1, 6)
    expect(expiring.rows[0].amount).toBeCloseTo(0.3, 2)
  })

  it('外部验收：按保质期自动推算到期日，并沉淀采购价历史', async () => {
    const p = await product('收货效期', 'FINISHED', 0.02)
    await prisma.scmProduct.update({ where: { id: p.id }, data: { shelfLifeDays: 365 } })

    const poId = `TPO-EXP-${suffix}`
    await prisma.purchaseOrder.create({
      data: {
        id: poId,
        buyerId: 'S001',
        supplierType: 'EXTERNAL',
        supplierId,
        supplierName: '测试代工厂',
        totalAmount: 0.5,
        status: 'APPROVED',
        items: {
          create: [
            {
              productId: p.id,
              name: '测试收货效期',
              spec: '测试规格',
              unit: '个',
              price: 0.05,
              qty: 10,
            },
          ],
        },
      },
    })
    purchaseIds.push(poId)

    const receipt = await purchase.createReceipt(admin, {
      poId,
      warehouseId: 'S001',
      items: [
        {
          productId: p.id,
          acceptQty: 10,
          rejectQty: 0,
          productionDate: '2026-11-01',
        },
      ],
    })
    expect(receipt.items[0].batchNo).toBe(receipt.id)
    expect(receipt.items[0].expiryDate!.toISOString().slice(0, 10)).toBe('2027-11-01')

    const batch = await prisma.scmStockBatch.findFirst({
      where: { warehouseId: 'S001', productId: p.id },
    })
    expect(batch!.batchNo).toBe(receipt.id)
    expect(batch!.expiryDate!.toISOString().slice(0, 10)).toBe('2027-11-01')
    expect(Number(batch!.qty)).toBe(10)
    expect(Number(batch!.unitCost)).toBeCloseTo(0.05, 6)

    const history = await prisma.scmPurchasePrice.findMany({ where: { productId: p.id } })
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ supplierId, source: 'RECEIPT', ref: poId })
    expect(Number(history[0].price)).toBeCloseTo(0.05, 2)

    // 手工调价优先于验收价；未来生效的价格不参与「当前价」
    await prices.create(p.id, { supplierId, price: 0.06 }, 'scm-test')
    await prices.create(p.id, { supplierId, price: 9.99, effectiveFrom: '2099-01-01' }, 'scm-test')
    expect(await prices.latestPrice(prisma, p.id)).toBeCloseTo(0.06, 2)

    const detail = await prices.list(p.id)
    expect(detail.archivePrice).toBeCloseTo(0.02, 2)
    expect(detail.rows[0].price).toBeCloseTo(9.99, 2)
    expect(detail.rows.some((it) => it.source === 'RECEIPT')).toBe(true)
  })

  it('库存不足时整单回滚，不会留下半截调拨流水', async () => {
    const p = await product('不足', 'PACK', 0.1)
    await addStock('S001', 'S001', p.id, 3)
    const [supplierLoc] = locationIds

    await expect(
      transfers.create(admin, {
        fromLocationId: 'S001',
        toLocationId: supplierLoc,
        items: [{ productId: p.id, qty: 5 }],
      }),
    ).rejects.toThrow('库存不足')

    expect(Number((await balance('S001', p.id))!.qty)).toBe(3)
    expect(await balance(supplierLoc, p.id)).toBeNull()
  })
})
