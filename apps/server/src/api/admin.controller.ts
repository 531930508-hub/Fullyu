import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { resolveRange, toDateString } from '@teahour/shared';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerm, Staff } from '../auth/decorators';
import { parseInput } from '../common/zod';
import { forbidden } from '../common/errors';
import { hasPerm, type StaffContext } from '../common/auth.types';
import { DashboardService } from '../finance/dashboard.service';
import { FinanceService } from '../finance/finance.service';
import { ExpensesService } from '../finance/expenses.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { LossesService } from '../losses/losses.service';
import { AdminService } from '../admin/admin.service';
import { CatalogService } from '../catalog/catalog.service';
import { CouponsService } from '../coupons/coupons.service';

const rangeSchema = z.object({
  range: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

const productSchema = z.object({
  name: z.string().max(80).optional(),
  nameEn: z.string().max(80).optional(),
  categoryId: z.string().max(40).optional(),
  series: z.string().max(20).optional(),
  kind: z.enum(['tea', 'retail', 'bottle']).optional(),
  priceCents: z.number().int().min(0).optional(),
  costCents: z.number().int().min(0).optional(),
  doseGrams: z.number().positive().optional(),
  status: z.enum(['published', 'draft', 'archived']).optional(),
  temps: z.array(z.string()).optional(),
  ice: z.boolean().optional(),
  memberEligible: z.boolean().optional(),
  desc: z.string().max(2000).optional(),
  descEn: z.string().max(2000).optional(),
  spec: z.string().max(300).optional(),
  specEn: z.string().max(300).optional(),
  tag: z.string().max(100).optional(),
  tagEn: z.string().max(100).optional(),
  unit: z.string().max(20).optional(),
  unitEn: z.string().max(20).optional()
});

const productImageSchema = z.object({
  // 允许带 data URL 前缀，服务端会剥离；2MB 图片的 base64 约 2.8MB 字符
  base64: z.string().min(1).max(3_000_000),
  contentType: z.enum(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
});

const expenseSchema = z.object({
  storeId: z.string().min(1),
  date: z.string().min(1),
  category: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  memo: z.string().max(120).optional()
});

const storeSchema = z.object({
  name: z.string().max(40).optional(),
  nameEn: z.string().max(80).optional(),
  short: z.string().max(20).optional(),
  city: z.string().max(20).optional(),
  cityEn: z.string().max(40).optional(),
  address: z.string().max(120).optional(),
  addressEn: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  open: z.boolean().optional(),
  retailPickup: z.boolean().optional(),
  printerStatus: z.enum(['online', 'offline']).optional(),
  channels: z.record(z.boolean()).optional(),
  positions: z.array(z.string()).optional(),
  hours: z.string().max(40).optional(),
  waitMinutes: z.number().int().min(0).max(180).optional()
});

const storeCreateSchema = storeSchema.extend({
  name: z.string().trim().min(1).max(40),
  city: z.string().trim().min(1).max(20),
  address: z.string().trim().min(1).max(120)
});

const seatQrSchema = z.object({
  baseUrl: z.string().max(300).optional()
});

const staffCreateSchema = z.object({
  name: z.string().min(1).max(30),
  username: z.string().min(6).max(20),
  password: z.string().min(8).max(72),
  roleIds: z.array(z.string()).min(1),
  storeIds: z.array(z.string()).optional(),
  allStores: z.boolean().optional(),
  active: z.boolean().optional()
});

const staffUpdateSchema = z.object({
  name: z.string().min(1).max(30),
  password: z.string().min(8).max(72).optional(),
  roleIds: z.array(z.string()).min(1),
  storeIds: z.array(z.string()).optional(),
  allStores: z.boolean().optional(),
  active: z.boolean().optional()
});

const roleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(40),
  description: z.string().max(200).optional(),
  scope: z.enum(['ALL', 'STORES']).optional(),
  perms: z.array(z.string()).min(1)
});

const mappingSchema = z.object({
  id: z.string().optional(),
  externalId: z.string().min(1),
  productId: z.string().min(1),
  unit: z.string().max(20).optional(),
  factor: z.number().positive()
});

const couponCreateSchema = z.object({
  title: z.string().trim().min(1).max(40),
  scope: z.enum(['all', 'category']).default('all'),
  categoryId: z.string().trim().max(40).nullable().optional(),
  amountCents: z.number().int().min(1).max(1_000_000),
  minSpendCents: z.number().int().min(0).max(10_000_000).default(0),
  validFrom: z.string().trim().min(10).max(10),
  validTo: z.string().trim().min(10).max(10),
  note: z.string().max(200).optional()
});

const couponIssueSchema = z.object({
  phones: z.array(z.string().trim().min(1).max(20)).min(1).max(200)
});

@Controller('admin')
@UseGuards(StaffGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly finance: FinanceService,
    private readonly expenses: ExpensesService,
    private readonly approvals: ApprovalsService,
    private readonly losses: LossesService,
    private readonly admin: AdminService,
    private readonly catalog: CatalogService,
    private readonly coupons: CouponsService
  ) {}

  private async allStoreIds(): Promise<string[]> {
    const stores = await this.catalog.listStores();
    return stores.map((store) => store.id);
  }

  private async storeIdsOf(staff: StaffContext): Promise<string[]> {
    return staff.allStores ? this.allStoreIds() : staff.storeIds;
  }

  private async financeScope(staff: StaffContext): Promise<string[]> {
    const ids = await this.storeIdsOf(staff);
    return staff.allStores ? [...ids, 'brand'] : ids;
  }

  @Get('overview')
  @RequirePerm('dashboard:view')
  async overview(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(rangeSchema, query ?? {});
    const range = resolveRange(input);
    return {
      overview: await this.dashboard.overview({ range, storeIds: await this.financeScope(staff) })
    };
  }

  @Get('finance')
  @RequirePerm('finance:view')
  async financeList(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      rangeSchema.extend({
        type: z.string().optional(),
        q: z.string().optional(),
        storeId: z.string().optional()
      }),
      query ?? {}
    );
    const range = resolveRange(input);
    let storeIds = await this.financeScope(staff);
    if (input.storeId) {
      if (!storeIds.includes(input.storeId)) throw forbidden('当前账号没有该门店的数据权限');
      storeIds = [input.storeId];
    }
    const entries = await this.finance.list({
      range,
      storeIds,
      type: input.type,
      q: input.q
    });
    return {
      entries,
      summary: this.finance.summary(entries),
      range: { from: range.fromDate, to: range.toDate }
    };
  }

  @Get('profit')
  @RequirePerm('dashboard:profit')
  async profit(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(rangeSchema, query ?? {});
    const range = resolveRange(input);
    const report = await this.finance.profitReport({
      range,
      storeIds: await this.storeIdsOf(staff),
      includeBrand: staff.allStores
    });
    return {
      ...report,
      range: { from: range.fromDate, to: range.toDate },
      includesBrand: staff.allStores
    };
  }

  @Get('expenses')
  @RequirePerm('finance:view')
  async expenseList(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      rangeSchema.extend({
        category: z.string().optional(),
        includeVoided: z.coerce.boolean().optional()
      }),
      query ?? {}
    );
    const range = resolveRange(input);
    const storeIds = await this.financeScope(staff);
    return {
      expenses: await this.expenses.list({
        storeIds,
        range,
        includeVoided: input.includeVoided,
        category: input.category
      }),
      summary: await this.expenses.summary({ storeIds, range }),
      range: { from: range.fromDate, to: range.toDate }
    };
  }

  @Get('expenses/sample')
  @RequirePerm('finance:expense')
  async expenseSample(@Staff() staff: StaffContext) {
    return { text: await this.expenses.sample(staff, toDateString()) };
  }

  @Post('expenses')
  @RequirePerm('finance:expense')
  async addExpense(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(expenseSchema, body);
    return { expense: await this.expenses.add(staff, input) };
  }

  @Post('expenses/preview')
  @RequirePerm('finance:expense')
  async previewExpenses(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ text: z.string().min(1).max(200000) }), body);
    return this.expenses.preview(staff, input.text);
  }

  @Post('expenses/import')
  @RequirePerm('finance:expense')
  async importExpenses(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({ text: z.string().min(1).max(200000), source: z.string().max(20).optional() }),
      body
    );
    return this.expenses.commit(staff, input.text, input.source || 'import');
  }

  @Post('expenses/:id/void')
  @RequirePerm('finance:expense')
  async voidExpense(@Param('id') id: string, @Staff() staff: StaffContext) {
    return { expense: await this.expenses.void(staff, id) };
  }

  @Get('approvals')
  @RequirePerm('approval:view')
  async approvalList(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        status: z.string().optional(),
        kind: z.string().optional(),
        limit: z.coerce.number().optional()
      }),
      query ?? {}
    );
    const storeIds = await this.financeScope(staff);
    return {
      approvals: await this.approvals.list({
        storeIds,
        status: input.status,
        kind: input.kind,
        limit: input.limit
      }),
      counts: await this.approvals.counts(storeIds)
    };
  }

  @Post('approvals/:id/decide')
  async decideApproval(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({ decision: z.enum(['approve', 'reject']), comment: z.string().max(200).optional() }),
      body
    );
    return { approval: await this.approvals.decide(staff, id, input) };
  }

  @Get('losses')
  @RequirePerm('loss:view')
  async lossList(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(rangeSchema.extend({ status: z.string().optional() }), query ?? {});
    const storeIds = await this.storeIdsOf(staff);
    const range = resolveRange(input);
    return {
      losses: await this.losses.list({ storeIds, range, status: input.status, limit: 300 }),
      summary: await this.losses.summary({ range, storeIds }),
      policy: await this.losses.getPolicy(),
      range: { from: range.fromDate, to: range.toDate }
    };
  }

  @Get('loss-policy')
  @RequirePerm('loss:view')
  async lossPolicy() {
    return { policy: await this.losses.getPolicy() };
  }

  @Put('loss-policy')
  @RequirePerm('loss:config')
  async saveLossPolicy(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        enabled: z.boolean().optional(),
        monthlyRatio: z.number().min(0).max(100).optional(),
        approvalThresholdCents: z.number().int().min(0).optional(),
        approvers: z.array(z.string()).optional()
      }),
      body
    );
    return { policy: await this.losses.savePolicy(staff, input) };
  }

  @Get('products')
  @RequirePerm('product:view')
  async products() {
    return {
      products: await this.admin.listProducts(),
      categories: await this.admin.categoriesAdmin()
    };
  }

  @Post('products')
  @RequirePerm('product:edit')
  async createProduct(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(productSchema, body);
    return { product: await this.admin.createProduct(staff, input) };
  }

  /** 茶单顺序：同一系列同一分类内的商品整体提交新顺序。必须在 products/:id 之前注册。 */
  @Patch('products/order')
  @RequirePerm('product:edit')
  async reorderProducts(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }), body);
    return { products: await this.admin.reorderProducts(staff, input.ids) };
  }

  @Patch('products/:id')
  @RequirePerm('product:edit')
  async updateProduct(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(productSchema, body);
    return { product: await this.admin.updateProduct(staff, id, input) };
  }

  /** 商品图上传/移除：产品编辑权限即可，不需要价格权限。 */
  @Post('products/:id/image')
  @RequirePerm('product:edit')
  async uploadProductImage(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(productImageSchema, body);
    return { product: await this.admin.setProductImage(staff, id, input) };
  }

  @Delete('products/:id/image')
  @RequirePerm('product:edit')
  async removeProductImage(@Param('id') id: string, @Staff() staff: StaffContext) {
    return { product: await this.admin.clearProductImage(staff, id) };
  }

  @Post('categories')
  @RequirePerm('product:edit')
  async saveCategory(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        nameEn: z.string().optional(),
        kind: z.string().optional()
      }),
      body
    );
    return { category: await this.admin.saveCategory(staff, input) };
  }

  @Get('stores')
  @RequirePerm('store:config')
  async stores() {
    return { stores: await this.admin.listStoresAdmin() };
  }

  @Post('stores')
  @RequirePerm('store:config:edit')
  async createStore(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(storeCreateSchema, body);
    return { store: await this.admin.createStore(staff, input) };
  }

  @Patch('stores/:id')
  @RequirePerm('store:config:edit')
  async updateStore(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(storeSchema, body);
    return { store: await this.admin.updateStore(staff, id, input) };
  }

  @Get('seat-qr')
  @RequirePerm('store:config')
  async seatQr() {
    return this.admin.seatQrSettings();
  }

  @Put('seat-qr')
  @RequirePerm('store:config:edit')
  async saveSeatQr(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(seatQrSchema, body);
    return this.admin.saveSeatQrSettings(staff, input);
  }

  @Get('staff')
  @RequirePerm('rbac:view')
  async staffList() {
    return { staff: await this.admin.listStaff(), roles: await this.admin.listRoles() };
  }

  @Post('staff')
  @RequirePerm('rbac:edit')
  async createStaff(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(staffCreateSchema, body);
    return { staff: await this.admin.saveStaff(staff, input) };
  }

  @Patch('staff/:id')
  @RequirePerm('rbac:edit')
  async updateStaff(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(staffUpdateSchema, body);
    return { staff: await this.admin.saveStaff(staff, { ...input, id }) };
  }

  @Get('roles')
  @RequirePerm('rbac:view')
  async roles() {
    return { roles: await this.admin.listRoles(), catalog: this.admin.permissionCatalog() };
  }

  @Post('roles')
  @RequirePerm('rbac:edit')
  async saveRole(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(roleSchema, body);
    return { role: await this.admin.saveRole(staff, input) };
  }

  @Get('permissions')
  @RequirePerm('rbac:view')
  async permissions() {
    return this.admin.permissionCatalog();
  }

  @Get('logs')
  @RequirePerm('log:view')
  async logs(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      rangeSchema.extend({
        q: z.string().optional(),
        type: z.string().optional(),
        limit: z.coerce.number().int().optional()
      }),
      query ?? {}
    );
    const range = resolveRange(input);
    return {
      logs: await this.admin.listLogs({
        storeIds: staff.allStores ? null : staff.storeIds,
        q: input.q,
        type: input.type,
        limit: input.limit,
        from: range.from,
        to: range.to
      })
    };
  }

  @Get('mappings')
  @RequirePerm('mapping:view')
  async mappings() {
    return { mappings: await this.admin.listMappings(), products: await this.admin.listProducts() };
  }

  @Post('mappings')
  @RequirePerm('mapping:edit')
  async saveMapping(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(mappingSchema, body);
    return { mapping: await this.admin.saveMapping(staff, input) };
  }

  @Get('refund-flow')
  @RequirePerm('approval:view')
  async refundFlow() {
    return { flow: await this.finance.refundFlow() };
  }

  @Put('refund-flow')
  @RequirePerm('approval:config')
  async saveRefundFlow(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        enabled: z.boolean().optional(),
        thresholdCents: z.number().int().min(0).max(10_000_000).optional()
      }),
      body
    );
    return { flow: await this.finance.saveRefundFlow(staff, input) };
  }

  /** 优惠券模板：总部创建、限定品类与有效期，发放按手机号定位会员。 */
  @Get('coupons')
  @RequirePerm('coupon:view')
  async couponList() {
    return { coupons: await this.coupons.listTemplates() };
  }

  @Post('coupons')
  @RequirePerm('coupon:manage')
  async createCoupon(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(couponCreateSchema, body);
    // zod 的 default 在类型上可能被推断成可选，这里补齐后交给服务层，运行时仍是 'all' / 0。
    return {
      coupon: await this.coupons.createTemplate(
        { ...input, scope: input.scope ?? 'all', minSpendCents: input.minSpendCents ?? 0 },
        staff
      )
    };
  }

  @Patch('coupons/:id')
  @RequirePerm('coupon:manage')
  async updateCoupon(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({ active: z.boolean().optional(), note: z.string().max(200).optional() }),
      body ?? {}
    );
    return { coupon: await this.coupons.updateTemplate(id, input, staff) };
  }

  @Post('coupons/:id/issue')
  @RequirePerm('coupon:manage')
  async issueCoupon(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(couponIssueSchema, body);
    return this.coupons.issue(id, input.phones, staff);
  }

  @Get('me')
  async me(@Staff() staff: StaffContext) {
    return {
      permissions: Array.from(staff.perms),
      hasProfit: hasPerm(staff, 'dashboard:profit')
    };
  }
}
