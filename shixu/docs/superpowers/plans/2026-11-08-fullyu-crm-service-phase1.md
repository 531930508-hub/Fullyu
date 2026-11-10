# Full愈 CRM 服务一期第一批（身份 / 权限 / 积分账本 / 人工调整）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在独立仓库 `~/Desktop/Full愈-CRM` 落地一个可运行、可测试的 CRM 服务骨架：四个内置角色、会员查询与档案、积分批次/流水账本、单笔与批量人工调整（含第二人审批）、只追加审计；本期不接三端、不做卡、不做 UI 和部署。

**Architecture:** 独立 NestJS + Prisma 服务（开发 SQLite、结构保持 MySQL 可迁移），CRM 库是积分唯一账本；积分余额不使用冗余字段，始终由 ACTIVE 批次 `remaining` 汇总，每次写操作同时写 `point_ledger.balance_after` 供每日对账校验。所有写操作走同一事务并写审计；人工调整复用统一的服务层，审批时重新校验整单，任一失败整单不执行。后台账号沿用时叙的后台登录模式（bcrypt + JWT + tokenVersion + 权限守卫），CRM 角色与权限点单独定义，不复用时叙经营权限。

**Tech Stack:** Node 20、pnpm 10、NestJS 10、Prisma 5（SQLite→MySQL）、Jest 29 + ts-jest + supertest、bcryptjs、@nestjs/jwt。

**证据级别:** E1（本地运行 + 合成数据）。不部署、不接真实接口、不写生产库、不提交、不外发。密钥与账号只用于本地测试。

**本期边界（明确不做，避免误判为已完成）**

- 不做年卡/权益、规则配置、月度对账、三端签名 API、webhook/outbox、异常队列、CRM 后台页面、SDK。
- 不做三端改造与迁移（D2/D3 口径仍需对业务库只读核查后单独实施）。
- 不做真实企业微信/短信/订阅消息。
- 以上各自单独出计划、单独验证；本计划不宣称一期整体完成。

---

## 后续批次路线（各自独立计划）

1. **1B 年卡与权益**：卡产品/权益版本/报价/开卡/权益使用/退卡审批，7 天全退与建议额。
2. **1C 对外 API 与同步**：签名、nonce、幂等、`member.resolve`、积分 earn/hold/consume/revoke/refund、outbox 与 webhook、每日对账。
3. **1D 规则与报表**：积分规则版本化、骰子规则、月度对账矩阵、CSV。
4. **1E 后台页面**：React + Vite 复用时叙 V7 token，会员/调整/审批/审计/配置/对账页面。
5. **1F 三端接入与迁移**：时叙 → 在场 → 轻疗，逐端只读窗口与回滚开关。

---

## 文件结构

```
~/Desktop/Full愈-CRM/
├─ package.json                     # 工作区脚本
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ .gitignore
├─ README.md                        # 启动、测试、账号、边界
├─ packages/shared/
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ src/index.ts                  # 权限点、角色、业务枚举、积分为期计算
└─ apps/server/
   ├─ package.json                  # 依赖与 jest 配置
   ├─ tsconfig.json / tsconfig.build.json
   ├─ prisma/schema.prisma          # CRM 库结构
   ├─ prisma/seed.ts                # 4 角色、4 账号、3 位合成会员
   ├─ test/global-setup.ts          # 模板库
   └─ src/
      ├─ main.ts / app.module.ts
      ├─ config.ts                  # JWT 密钥守门
      ├─ common/{prisma.module,prisma.service,errors,auth.types,ids,audit,idempotency}.ts
      ├─ auth/{auth.module,auth.controller,auth.service,staff.service,staff.guard,permissions.guard,decorators}.ts
      ├─ members/{members.module,members.controller,members.service}.ts
      ├─ points/{points.module,points.service,adjustments.controller,adjustments.service}.ts
      ├─ audit/{audit.module,audit.controller,audit.service}.ts
      ├─ api/api.module.ts          # 汇总控制器
      └─ crm.spec.ts                # 集成测试（TDD 主文件）
```

每个文件只做一件事：`points.service.ts` 只有积分账本规则（入账/扣减/余额/不变量），`adjustments.service.ts` 只有调整单状态机与审批，`members.service.ts` 只有会员查询与资料，控制器只做参数取用和权限注解。

---

### Task 1: 工作区骨架与共享常量

**Files:**
- Create: `~/Desktop/Full愈-CRM/package.json`
- Create: `~/Desktop/Full愈-CRM/pnpm-workspace.yaml`
- Create: `~/Desktop/Full愈-CRM/tsconfig.base.json`
- Create: `~/Desktop/Full愈-CRM/.gitignore`
- Create: `~/Desktop/Full愈-CRM/packages/shared/package.json`
- Create: `~/Desktop/Full愈-CRM/packages/shared/tsconfig.json`
- Create: `~/Desktop/Full愈-CRM/packages/shared/src/index.ts`

- [x] **Step 1: 写工作区文件**

`package.json`：

```json
{
  "name": "fullyu-crm",
  "version": "0.1.0",
  "private": true,
  "description": "Full愈 CRM 中台（会员、积分、年卡唯一账本）",
  "scripts": {
    "dev:server": "pnpm --filter @fullyu/crm-server dev",
    "build:server": "pnpm --filter @fullyu/crm-server build",
    "test": "pnpm --filter @fullyu/crm-server test",
    "db:push": "pnpm --filter @fullyu/crm-server db:push",
    "db:seed": "pnpm --filter @fullyu/crm-server db:seed",
    "lint": "pnpm -r lint"
  },
  "engines": { "node": ">=18.0.0", "pnpm": ">=8.0.0" },
  "pnpm": { "onlyBuiltDependencies": ["@prisma/client", "@prisma/engines", "prisma", "esbuild"] }
}
```

`pnpm-workspace.yaml`：

```yaml
packages:
  - apps/*
  - packages/*
```

`.gitignore`：

```
node_modules/
dist/
*.db
*.db-journal
apps/server/prisma/dev.db*
.env
.env.*
!.env.example
coverage/
```

`packages/shared/package.json`：

```json
{
  "name": "@fullyu/crm-shared",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "lint": "tsc --noEmit" },
  "devDependencies": { "typescript": "^5.4.0" }
}
```

- [x] **Step 2: 写共享常量与积分为期函数**

`packages/shared/src/index.ts`：

```ts
export type Business = 'sx' | 'ql' | 'zc';
export const BUSINESSES: { key: Business; name: string }[] = [
  { key: 'sx', name: '时叙' },
  { key: 'ql', name: '轻疗' },
  { key: 'zc', name: '在场' }
];

/** CRM 权限点：一期只列出会被本批代码判定的能力，后续批次按需追加。 */
export const CRM_PERMISSIONS = [
  { code: 'crm:member:view', name: '查看会员档案' },
  { code: 'crm:member:edit', name: '编辑会员资料' },
  { code: 'crm:adjust:create', name: '发起单笔积分调整' },
  { code: 'crm:adjust:batch', name: '发起批量积分调整' },
  { code: 'crm:adjust:approve', name: '审批积分调整' },
  { code: 'crm:audit:view', name: '查看审计日志' },
  { code: 'crm:card:edit', name: '维护大会员卡' },
  { code: 'crm:config:edit', name: '维护规则配置' },
  { code: 'crm:report:view', name: '查看月度对账' },
  { code: 'crm:queue:handle', name: '处理异常队列' },
  { code: 'crm:sync:view', name: '查看三端同步' },
  { code: 'crm:sync:retry', name: '重投同步事件' },
  { code: 'crm:role:edit', name: '维护角色权限' }
] as const;

export const CRM_PERMISSION_CODES = CRM_PERMISSIONS.map((p) => p.code);

/** 设计 §7.6 的四个内置角色；管理员用 '*' 表示全部。 */
export const CRM_ROLE_TEMPLATES = [
  {
    id: 'crm-admin',
    name: 'CRM 管理员',
    perms: ['*']
  },
  {
    id: 'crm-ops',
    name: '会员运营',
    perms: [
      'crm:member:view', 'crm:member:edit', 'crm:adjust:create', 'crm:adjust:batch',
      'crm:card:edit', 'crm:config:edit', 'crm:sync:view', 'crm:sync:retry', 'crm:audit:view'
    ]
  },
  {
    id: 'crm-finance',
    name: '财务',
    perms: [
      'crm:member:view', 'crm:adjust:approve', 'crm:queue:handle',
      'crm:sync:view', 'crm:report:view', 'crm:audit:view'
    ]
  },
  {
    id: 'crm-cs',
    name: '客服',
    perms: ['crm:member:view', 'crm:member:edit', 'crm:adjust:create']
  }
] as const;

/** 单笔调整免审阈值（分）；超过（绝对值）需另一人审批。 */
export const ADJUST_FREE_LIMIT = 500;

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 积分到期日：1–10 月获得 → 次年 1 月 1 日 00:00（Asia/Shanghai）；
 * 11–12 月获得 → 后年 1 月 1 日。周末、闰年不影响，因为只取「年 + 1 或 +2」。
 * 返回 UTC 瞬间：上海 1 月 1 日 00:00 = UTC 前一年 12 月 31 日 16:00。
 */
export function pointExpireAt(earnedAt: Date): Date {
  const shanghai = new Date(earnedAt.getTime() + SHANGHAI_OFFSET_MS);
  const year = shanghai.getUTCFullYear();
  const month = shanghai.getUTCMonth() + 1;
  const targetYear = month >= 11 ? year + 2 : year + 1;
  return new Date(Date.UTC(targetYear, 0, 1) - SHANGHAI_OFFSET_MS);
}

export const isBusiness = (value: unknown): value is Business =>
  value === 'sx' || value === 'ql' || value === 'zc';
```

- [x] **Step 3: 写 tsconfig 并安装**

`tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "strict": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`packages/shared/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"] },
  "include": ["src/**/*.ts"]
}
```

Run:

```bash
cd ~/Desktop/Full愈-CRM
pnpm install --offline
```

Expected: 安装成功；若离线缺包，停止并报告缺的包名，不要联网试探或改版本。

---

### Task 2: Prisma 结构、种子与测试脚手架

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/tsconfig.build.json`
- Create: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/seed.ts`
- Create: `apps/server/test/global-setup.ts`

- [x] **Step 1: 写服务端 package.json（依赖版本与本地 store 对齐）**

```json
{
  "name": "@fullyu/crm-server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "node dist/main.js",
    "build": "tsc -p tsconfig.build.json",
    "test": "jest",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@fullyu/crm-shared": "workspace:*",
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/platform-express": "^10.3.0",
    "@prisma/client": "^5.10.0",
    "bcryptjs": "^2.4.3",
    "express": "^4.19.2",
    "reflect-metadata": "^0.2.1",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/testing": "^10.4.22",
    "@types/bcryptjs": "^2.4.6",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.14",
    "@types/node": "^20.11.0",
    "@types/supertest": "^6.0.3",
    "jest": "^29.7.0",
    "prisma": "^5.10.0",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "globalSetup": "<rootDir>/../test/global-setup.ts",
    "transform": { "^.+\\.ts$": ["ts-jest", { "isolatedModules": true }] },
    "moduleNameMapper": { "^@fullyu/crm-shared$": "<rootDir>/../../../packages/shared/src/index.ts" },
    "testTimeout": 30000,
    "maxWorkers": 1
  }
}
```

`tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "baseUrl": ".",
    "types": ["node", "jest"],
    "paths": { "@fullyu/crm-shared": ["../../packages/shared/src/index.ts"] }
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "../../packages/shared/src/**/*.ts"]
}
```

`tsconfig.build.json`：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "rootDir": "../.." },
  "include": ["src/**/*.ts", "../../packages/shared/src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts", "test/**/*.ts"]
}
```

- [x] **Step 2: 写 schema（只含本批要用的表）**

`prisma/schema.prisma`：

```prisma
generator client { provider = "prisma-client-js" }

datasource db {
  provider = "sqlite" // 上线切换：provider 改 mysql，JSON 用 String 存，迁移脚本另做
  url      = env("DATABASE_URL")
}

model Counter {
  name  String @id
  value Int    @default(0)
  @@map("counters")
}

model Staff {
  id           String   @id
  name         String
  username     String   @unique
  passwordHash String   @map("password_hash")
  active       Boolean  @default(true)
  tokenVersion Int      @default(1) @map("token_version")
  createdAt    DateTime @default(now()) @map("created_at")
  roles        StaffRole[]
  @@map("staff")
}

model CrmRole {
  id          String @id
  name        String
  description String @default("")
  builtin     Boolean @default(false)
  permsJson   String @map("perms_json")
  staff       StaffRole[]
  @@map("crm_roles")
}

model StaffRole {
  staffId String @map("staff_id")
  roleId  String @map("role_id")
  staff   Staff   @relation(fields: [staffId], references: [id], onDelete: Cascade)
  role    CrmRole @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@id([staffId, roleId])
  @@map("staff_roles")
}

model Member {
  id             String   @id
  memberNo       String   @unique @map("member_no")
  phone          String   @unique
  unionId        String?  @map("union_id")
  name           String   @default("会员")
  gender         Int?
  birthday       DateTime?
  avatarUrl      String?  @map("avatar_url")
  status         String   @default("ACTIVE") // ACTIVE | MERGED | DEACTIVATING | DEACTIVATED
  profileVersion Int      @default(1) @map("profile_version")
  mergedIntoId   String?  @map("merged_into_id")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  identities     MemberIdentity[]
  batches        PointBatch[]
  ledger         PointLedger[]
  @@map("members")
}

model MemberIdentity {
  id          String  @id
  business    String
  localUserId String  @map("local_user_id")
  appId       String? @map("app_id")
  openId      String? @map("open_id")
  memberId    String  @map("member_id")
  member      Member  @relation(fields: [memberId], references: [id], onDelete: Cascade)
  @@unique([business, localUserId])
  @@index([memberId])
  @@map("member_identities")
}

model PointBatch {
  id             String   @id
  memberId       String   @map("member_id")
  issuerBusiness String   @map("issuer_business")
  sourceRef      String   @default("") @map("source_ref")
  amount         Int
  remaining      Int
  status         String   @default("ACTIVE") // PENDING | ACTIVE | DEPLETED | EXPIRED | REVOKED
  earnedAt       DateTime @map("earned_at")
  expireAt       DateTime @map("expire_at")
  member         Member   @relation(fields: [memberId], references: [id])
  @@index([memberId, status, expireAt])
  @@map("point_batches")
}

model PointLedger {
  id              String   @id
  memberId        String   @map("member_id")
  type            String // EARN | CONSUME | REFUND | REVOKE | EXPIRE | ADJUST | MIGRATE
  delta           Int
  balanceAfter    Int      @map("balance_after")
  business        String   @default("")
  ref             String   @default("")
  allocationsJson String   @default("") @map("allocations_json")
  idemKey         String?  @unique @map("idem_key")
  operatorId      String?  @map("operator_id")
  operatorName    String?  @map("operator_name")
  note            String   @default("")
  createdAt       DateTime @default(now()) @map("created_at")
  member          Member   @relation(fields: [memberId], references: [id])
  @@index([memberId, createdAt])
  @@map("point_ledger")
}

model AdjustmentRequest {
  id              String    @id
  kind            String // SINGLE | BATCH
  status          String    @default("PENDING") // PENDING | APPLIED | REJECTED
  reason          String
  totalPoints     Int       @map("total_points")
  payloadJson     String    @map("payload_json")
  requestedBy     String    @map("requested_by")
  requestedByName String    @map("requested_by_name")
  approvedBy      String?   @map("approved_by")
  approvedByName  String?   @map("approved_by_name")
  comment         String    @default("")
  createdAt       DateTime  @default(now()) @map("created_at")
  decidedAt       DateTime? @map("decided_at")
  appliedAt       DateTime? @map("applied_at")
  @@index([status, createdAt])
  @@map("adjustment_requests")
}

model AuditLog {
  id        String   @id
  actorId   String?  @map("actor_id")
  actorName String   @map("actor_name")
  action    String
  target    String   @default("")
  detail    String   @default("")
  at        DateTime @default(now())
  @@index([at])
  @@map("audit_logs")
}

model IdempotencyKey {
  key         String   @id
  requestHash String   @map("request_hash")
  resultJson  String   @map("result_json")
  createdAt   DateTime @default(now()) @map("created_at")
  @@map("idempotency_keys")
}
```

- [x] **Step 3: 写种子（4 角色 / 4 账号 / 3 位合成会员）**

`prisma/seed.ts`：

```ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { CRM_ROLE_TEMPLATES, pointExpireAt } from '@fullyu/crm-shared';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || 'crm-dev-2026';

const ACCOUNTS = [
  { id: 'u-admin', name: '周岚', username: '13800001001', role: 'crm-admin' },
  { id: 'u-ops', name: '李沐', username: '13800001002', role: 'crm-ops' },
  { id: 'u-fin', name: '王宁', username: '13800001003', role: 'crm-finance' },
  { id: 'u-cs', name: '赵一', username: '13800001004', role: 'crm-cs' }
];

const MEMBERS = [
  { id: 'm-lin', memberNo: 'FY-2602-008812', phone: '13812346620', name: '林小满', gender: 2, birthday: '1994-05-18', points: 500, biz: 'sx' },
  { id: 'm-su', memberNo: 'FY-2607-001204', phone: '13620932093', name: '苏晚', gender: 2, birthday: '1991-09-02', points: 1200, biz: 'zc' },
  { id: 'm-tang', memberNo: 'FY-2605-000927', phone: '13900210021', name: '唐果', gender: null, birthday: '1998-11-21', points: 0, biz: 'ql' }
] as const;

async function main() {
  await prisma.idempotencyKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.adjustmentRequest.deleteMany();
  await prisma.pointLedger.deleteMany();
  await prisma.pointBatch.deleteMany();
  await prisma.memberIdentity.deleteMany();
  await prisma.member.deleteMany();
  await prisma.staffRole.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.crmRole.deleteMany();
  await prisma.counter.deleteMany();

  for (const t of CRM_ROLE_TEMPLATES) {
    await prisma.crmRole.create({
      data: { id: t.id, name: t.name, builtin: true, permsJson: JSON.stringify(t.perms) }
    });
  }
  const hash = bcrypt.hashSync(PASSWORD, 10);
  for (const a of ACCOUNTS) {
    await prisma.staff.create({ data: { id: a.id, name: a.name, username: a.username, passwordHash: hash } });
    await prisma.staffRole.create({ data: { staffId: a.id, roleId: a.role } });
  }

  const now = new Date();
  for (const m of MEMBERS) {
    await prisma.member.create({
      data: {
        id: m.id, memberNo: m.memberNo, phone: m.phone, name: m.name,
        gender: m.gender, birthday: new Date(`${m.birthday}T00:00:00+08:00`)
      }
    });
    await prisma.memberIdentity.create({
      data: { id: `id-${m.id}`, business: m.biz, localUserId: `local-${m.id}`, memberId: m.id }
    });
    if (m.points > 0) {
      await prisma.pointBatch.create({
        data: {
          id: `b-${m.id}`, memberId: m.id, issuerBusiness: m.biz, sourceRef: `seed:${m.id}`,
          amount: m.points, remaining: m.points, status: 'ACTIVE',
          earnedAt: now, expireAt: pointExpireAt(now)
        }
      });
      await prisma.pointLedger.create({
        data: {
          id: `l-${m.id}`, memberId: m.id, type: 'MIGRATE', delta: m.points,
          balanceAfter: m.points, business: m.biz, ref: `seed:${m.id}`, note: '初始化合成数据'
        }
      });
    }
  }
  console.log(`seeded 4 roles, ${ACCOUNTS.length} staff, ${MEMBERS.length} members`);
}

main().finally(() => prisma.$disconnect());
```

- [x] **Step 4: 写测试全局准备**

`test/global-setup.ts`：与 `Full愈-时叙/apps/server/test/global-setup.ts` 同一模式（复制模板库、指针文件），把临时目录改为 `fullyu-crm-jest`，模板生成命令：

```ts
execFileSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate', '--accept-data-loss'], { cwd: serverRoot, env });
execFileSync(process.execPath, [tsxCli, 'prisma/seed.ts'], { cwd: serverRoot, env, stdio: 'inherit' });
```

其中 `env = { ...process.env, DATABASE_URL: 'file:' + dbFile, SEED_PASSWORD: 'crm-test-2026' }`，并把 dbFile 写入 `tmpdir/fullyu-crm-jest/template.path`。

- [x] **Step 5: 生成客户端并验证**

```bash
cd ~/Desktop/Full愈-CRM
pnpm install --offline
pnpm --filter @fullyu/crm-server db:generate
```

Expected: `Generated Prisma Client`。

---

### Task 3: 登录、会话与权限守卫（先写测试再实现）

**Files:**
- Create: `apps/server/src/crm.spec.ts`
- Create: `apps/server/src/common/{prisma.module,prisma.service,errors,auth.types,ids,audit,idempotency}.ts`
- Create: `apps/server/src/auth/*`
- Create: `apps/server/src/config.ts`
- Create: `apps/server/src/app.module.ts`, `src/main.ts`
- Create: `apps/server/src/api/api.module.ts`

- [x] **Step 1: 写失败的集成测试（登录与权限）**

`src/crm.spec.ts` 开头与第一个用例：

```ts
import { createHarness, ACCOUNTS, PASSWORD, type Harness } from '../test/harness';

describe('CRM 服务：会员、积分调整与审计', () => {
  let h: Harness;
  let admin: string;
  let ops: string;
  let fin: string;
  let cs: string;

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login(ACCOUNTS.admin);
    ops = await h.login(ACCOUNTS.ops);
    fin = await h.login(ACCOUNTS.finance);
    cs = await h.login(ACCOUNTS.cs);
  });
  afterAll(async () => h.close());

  it('登录返回身份与权限；密码错误被拒', async () => {
    const me = await h.api('get', '/auth/me', ops);
    expect(me.status).toBe(200);
    expect(me.body.staff.name).toBe('李沐');
    expect(me.body.staff.perms).toContain('crm:adjust:batch');
    expect(me.body.staff.perms).not.toContain('crm:adjust:approve');
    const bad = await h.api('post', '/auth/login', null, { username: ACCOUNTS.ops, password: 'wrong-pass' });
    expect(bad.status).toBe(401);
    const noToken = await h.api('get', '/members', null);
    expect(noToken.status).toBe(401);
  });

  it('客服不能审批，财务不能发起调整', async () => {
    const denied = await h.api('post', `/adjustments/ad-1/approve`, cs);
    expect(denied.status).toBe(403);
    const create = await h.api('post', '/adjustments', fin, {
      memberId: 'm-lin', points: 10, reason: '测试'
    });
    expect(create.status).toBe(403);
  });
});
```

`test/harness.ts` 从时叙 harness 改造：`ACCOUNTS = { admin:'13800001001', ops:'...002', finance:'...003', cs:'...004' }`，`PASSWORD = 'crm-test-2026'`，登录 `/api/auth/login`，测试库复制逻辑不变。

- [x] **Step 2: 运行，确认失败**

```bash
cd ~/Desktop/Full愈-CRM && pnpm test
```

Expected: FAIL（`createHarness` 或 `/auth/me` 不存在）。

- [x] **Step 3: 实现公共层与鉴权**

`src/common/errors.ts` 直接照搬时叙的 `ApiError/badRequest/.../conflict/unprocessable`。

`src/common/auth.types.ts`：

```ts
import { forbidden } from './errors';

export type StaffContext = {
  id: string; name: string; username: string; active: boolean;
  perms: Set<string>; tokenVersion: number;
};

export function hasPerm(staff: StaffContext, perm: string): boolean {
  return staff.perms.has('*') || staff.perms.has(perm);
}

export function assertPerm(staff: StaffContext, perm: string): void {
  if (!hasPerm(staff, perm)) throw forbidden('当前账号没有该操作权限');
}
```

`src/auth/staff.service.ts`：

```ts
@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async load(id: string): Promise<StaffContext | null> {
    const row = await this.prisma.staff.findUnique({
      where: { id }, include: { roles: { include: { role: true } } }
    });
    if (!row) return null;
    const perms = new Set<string>();
    for (const link of row.roles) {
      for (const p of JSON.parse(link.role.permsJson) as string[]) perms.add(p);
    }
    return {
      id: row.id, name: row.name, username: row.username, active: row.active,
      perms, tokenVersion: row.tokenVersion
    };
  }
}
```

`src/auth/staff.guard.ts` 照搬时叙（JWT `kind==='staff'`、`ver===tokenVersion`），`permissions.guard.ts` 照搬时叙。

`src/auth/auth.service.ts`：`login(username, password)` 查 staff → bcrypt 比对 → 签发 `{kind:'staff',sub,ver}` 12h → 写审计「登录后台」；`me()` 返回 staff 与排序后的 perms。

`src/config.ts`：生产环境必须 32 位以上 `JWT_SECRET`，开发回落 `dev-only-crm-secret-change-me`。

`app.module.ts`：`PrismaModule`、全局 `JwtModule`、`AuthModule`、`ApiModule`；`main.ts` 设 `/api` 前缀、`ApiExceptionFilter`、CORS 只允许 localhost 5173/5181。

- [x] **Step 4: 运行，确认登录与权限用例通过**

```bash
pnpm test
```

Expected: 2/2 PASS。

---

### Task 4: 会员查询、档案与资料修改

**Files:**
- Create: `apps/server/src/members/members.service.ts`
- Create: `apps/server/src/members/members.controller.ts`
- Create: `apps/server/src/members/members.module.ts`
- Modify: `apps/server/src/crm.spec.ts`

- [x] **Step 1: 追加失败测试**

```ts
it('会员列表支持姓名/手机号/会员号搜索与业务筛选，并给出余额', async () => {
  const all = await h.api('get', '/members', admin);
  expect(all.status).toBe(200);
  expect(all.body.members).toHaveLength(3);
  const lin = all.body.members.find((m: { memberNo: string }) => m.memberNo === 'FY-2602-008812');
  expect(lin.balance).toBe(500);
  const byPhone = await h.api('get', '/members?q=13900210021', admin);
  expect(byPhone.body.members).toHaveLength(1);
  expect(byPhone.body.members[0].name).toBe('唐果');
  const byBiz = await h.api('get', '/members?business=zc', admin);
  expect(byBiz.body.members.map((m: { name: string }) => m.name)).toEqual(['苏晚']);
});

it('会员档案返回明文手机号、身份与积分，同人当天重复打开只记一次审计', async () => {
  const before = (await h.api('get', '/audit?action=查看会员档案', admin)).body.logs.length;
  const res = await h.api('get', '/members/m-lin', admin);
  expect(res.status).toBe(200);
  expect(res.body.member.phone).toBe('13812346620');
  expect(res.body.identities[0].business).toBe('sx');
  expect(res.body.balance).toBe(500);
  expect(res.body.ledger[0].type).toBe('MIGRATE');
  await h.api('get', '/members/m-lin', admin);
  const after = (await h.api('get', '/audit?action=查看会员档案', admin)).body.logs.length;
  expect(after - before).toBe(1);
  const missing = await h.api('get', '/members/m-none', admin);
  expect(missing.status).toBe(404);
});

it('修改资料校验版本与字段：落后版本 409，未来生日 400，成功后版本 +1', async () => {
  const stale = await h.api('patch', '/members/m-su/profile', cs, { baseVersion: 1, name: '苏晚晚', gender: 2, birthday: '1991-09-02' });
  expect(stale.status).toBe(200);
  const again = await h.api('patch', '/members/m-su/profile', cs, { baseVersion: 1, name: '苏晚' });
  expect(again.status).toBe(409);
  const bad = await h.api('patch', '/members/m-su/profile', cs, { baseVersion: 2, birthday: '2999-01-01' });
  expect(bad.status).toBe(400);
  const detail = await h.api('get', '/members/m-su', cs);
  expect(detail.body.member.profileVersion).toBe(2);
  expect(detail.body.member.name).toBe('苏晚晚');
  const denied = await h.api('patch', '/members/m-su/profile', fin, { baseVersion: 2, name: 'x' });
  expect(denied.status).toBe(403);
});
```

- [x] **Step 2: 实现**

`members.service.ts` 要点（完整实现）：

```ts
@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { q?: string; business?: string }) {
    const q = (query.q || '').trim();
    const where: Prisma.MemberWhereInput = { status: { not: 'MERGED' } };
    if (q) {
      where.OR = [{ memberNo: { contains: q } }, { phone: { contains: q } }, { name: { contains: q } }];
    }
    if (query.business) where.identities = { some: { business: query.business } };
    const rows = await this.prisma.member.findMany({
      where, orderBy: { memberNo: 'desc' }, take: 50, include: { identities: true }
    });
    const sums = await this.prisma.pointBatch.groupBy({
      by: ['memberId'], where: { memberId: { in: rows.map((r) => r.id) }, status: 'ACTIVE', expireAt: { gt: new Date() } }, _sum: { remaining: true }
    });
    const balance = new Map(sums.map((s) => [s.memberId, s._sum.remaining || 0]));
    return rows.map((r) => this.mapSummary(r, balance.get(r.id) || 0));
  }

  async detail(id: string, actor: StaffContext) {
    const row = await this.prisma.member.findUnique({ where: { id }, include: { identities: true } });
    if (!row) throw notFound('会员不存在');
    await this.logView(actor, row);
    const now = new Date();
    const [sums, ledger, batches] = await Promise.all([
      this.prisma.pointBatch.aggregate({ where: { memberId: id, status: 'ACTIVE', expireAt: { gt: now } }, _sum: { remaining: true } }),
      this.prisma.pointLedger.findMany({ where: { memberId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.pointBatch.findMany({ where: { memberId: id, status: 'ACTIVE', remaining: { gt: 0 }, expireAt: { gt: now } }, orderBy: { expireAt: 'asc' }, take: 10 })
    ]);
    return {
      member: row, identities: row.identities,
      balance: sums._sum.remaining || 0,
      expiringSoon: batches.filter((b) => b.expireAt.getTime() - now.getTime() <= 30 * 86400_000),
      batches, ledger
    };
  }

  /** 档案查看审计：同一操作人 + 同一会员当天只记一次，避免刷屏；跨天再记。 */
  private async logView(actor: StaffContext, member: { memberNo: string }) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const exists = await this.prisma.auditLog.findFirst({
      where: { actorId: actor.id, action: '查看会员档案', target: member.memberNo, at: { gte: start } }
    });
    if (!exists) await audit(this.prisma, { actor, action: '查看会员档案', target: member.memberNo });
  }

  async updateProfile(id: string, input: { baseVersion: number; name?: string; gender?: number | null; birthday?: string | null; avatarUrl?: string | null }, actor: StaffContext) {
    const row = await this.prisma.member.findUnique({ where: { id } });
    if (!row) throw notFound('会员不存在');
    if (row.profileVersion !== input.baseVersion) throw conflict('资料已被其他人修改，请刷新后重试');
    const data: Prisma.MemberUpdateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 20) throw badRequest('姓名须为 1–20 个字符');
      data.name = name;
    }
    if (input.gender !== undefined) {
      if (input.gender !== null && input.gender !== 1 && input.gender !== 2) throw badRequest('性别只能是 1、2 或空');
      data.gender = input.gender;
    }
    if (input.birthday !== undefined) {
      if (input.birthday === null) data.birthday = null;
      else {
        const d = new Date(`${input.birthday}T00:00:00+08:00`);
        if (Number.isNaN(d.getTime())) throw badRequest('生日格式应为 YYYY-MM-DD');
        if (d.getTime() > Date.now()) throw badRequest('生日不能晚于今天');
        data.birthday = d;
      }
    }
    if (input.avatarUrl !== undefined) {
      if (input.avatarUrl && !/^https?:\/\//.test(input.avatarUrl)) throw badRequest('头像地址必须是 http(s) URL');
      data.avatarUrl = input.avatarUrl || null;
    }
    const updated = await this.prisma.member.update({ where: { id }, data: { ...data, profileVersion: { increment: 1 } } });
    await audit(this.prisma, { actor, action: '修改会员资料', target: row.memberNo, detail: `v${row.profileVersion}→v${updated.profileVersion}` });
    return updated;
  }
}
```

控制器路由：`GET /members`（`@RequirePerm('crm:member:view')`）、`GET /members/:id`、`PATCH /members/:id/profile`（`crm:member:edit`）。

- [x] **Step 3: 运行**

```bash
pnpm test
```

Expected: 5/5 PASS。

---

### Task 5: 积分账本与调整单（核心，先红后绿）

**Files:**
- Create: `apps/server/src/points/points.service.ts`
- Create: `apps/server/src/points/adjustments.service.ts`
- Create: `apps/server/src/points/adjustments.controller.ts`
- Create: `apps/server/src/points/points.module.ts`
- Modify: `apps/server/src/crm.spec.ts`

- [x] **Step 1: 追加失败的测试**

```ts
const balanceOf = async (id: string) => (await h.api('get', `/members/${id}`, admin)).body.balance;

it('单笔 ≤500 直接入账：建批次、写流水，余额与批次合计一致', async () => {
  const before = await balanceOf('m-lin');
  const res = await h.api('post', '/adjustments', ops, { memberId: 'm-lin', points: 200, reason: '活动补发' });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('APPLIED');
  expect(res.body.balance).toBe(before + 200);
  const detail = await h.api('get', '/members/m-lin', admin);
  expect(detail.body.ledger[0].type).toBe('ADJUST');
  expect(detail.body.ledger[0].balanceAfter).toBe(before + 200);
  const invariants = await h.prisma.pointBatch.aggregate({ where: { memberId: 'm-lin', status: 'ACTIVE' }, _sum: { remaining: true } });
  expect(invariants._sum.remaining).toBe(before + 200);
});

it('扣减按到期最早优先；余额不足整单拒绝且不写流水', async () => {
  const ledgerBefore = (await h.api('get', '/members/m-tang', admin)).body.ledger.length;
  const fail = await h.api('post', '/adjustments', ops, { memberId: 'm-tang', points: -10, reason: '测试' });
  expect(fail.status).toBe(422);
  const after = await h.api('get', '/members/m-tang', admin);
  expect(after.body.ledger.length).toBe(ledgerBefore);
});

it('超过 500 分进入待审批；发起人不能自审，财务审批后入账且只能审批一次', async () => {
  const res = await h.api('post', '/adjustments', ops, { memberId: 'm-lin', points: 600, reason: '大额补发' });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('PENDING');
  const id = res.body.request.id;
  const self = await h.api('post', `/adjustments/${id}/approve`, ops);
  expect(self.status).toBe(403);
  const before = await balanceOf('m-lin');
  const ok = await h.api('post', `/adjustments/${id}/approve`, fin, { comment: '同意' });
  expect(ok.status).toBe(201);
  expect(ok.body.status).toBe('APPLIED');
  expect(await balanceOf('m-lin')).toBe(before + 600);
  const twice = await h.api('post', `/adjustments/${id}/approve`, fin, { comment: '再试' });
  expect(twice.status).toBe(409);
});

it('批量调整整单校验：任一余额不足则 400 且无人变动；审批时再次校验失败则整单不执行', async () => {
  const before = await balanceOf('m-lin');
  const bad = await h.api('post', '/adjustments/batch', ops, {
    reason: '批量补发', lines: [{ memberId: 'm-lin', points: 50 }, { memberId: 'm-tang', points: -10 }]
  });
  expect(bad.status).toBe(400);
  expect(await balanceOf('m-lin')).toBe(before);

  const ok = await h.api('post', '/adjustments/batch', ops, {
    reason: '批量补发', lines: [{ memberId: 'm-lin', points: 50 }, { memberId: 'm-su', points: 100 }]
  });
  expect(ok.status).toBe(201);
  const id = ok.body.request.id;
  // 审批前把苏晚的余额花掉，让整单在审批时失败
  await h.api('post', '/adjustments', ops, { memberId: 'm-su', points: -1300, reason: '清空' }).then(() => {});
  const fail = await h.api('post', `/adjustments/${id}/approve`, fin, { comment: '同意' });
  expect([400, 422]).toContain(fail.status);
  const again = await h.api('get', `/adjustments/${id}`, fin);
  expect(again.body.request.status).toBe('PENDING');
  expect(await balanceOf('m-lin')).toBe(before);
});

it('带相同幂等键重试只入账一次；同键不同内容返回 409', async () => {
  const key = 'adjust:test:1';
  const body = { memberId: 'm-tang', points: 30, reason: '幂等测试' };
  const first = await h.apiWithKey('post', '/adjustments', ops, body, key);
  expect(first.status).toBe(201);
  const second = await h.apiWithKey('post', '/adjustments', ops, body, key);
  expect(second.status).toBe(201);
  expect(second.body.ledgerId).toBe(first.body.ledgerId);
  expect(await balanceOf('m-tang')).toBe(30);
  const conflictRes = await h.apiWithKey('post', '/adjustments', ops, { ...body, points: 40 }, key);
  expect(conflictRes.status).toBe(409);
});

it('客服可发起单笔但不能批量；驳回必须填写意见', async () => {
  const batch = await h.api('post', '/adjustments/batch', cs, { reason: '批量', lines: [{ memberId: 'm-lin', points: 1 }] });
  expect(batch.status).toBe(403);
  const created = await h.api('post', '/adjustments', cs, { memberId: 'm-lin', points: 700, reason: '大额' });
  const id = created.body.request.id;
  const reject = await h.api('post', `/adjustments/${id}/reject`, fin, { comment: '' });
  expect(reject.status).toBe(400);
  const okReject = await h.api('post', `/adjustments/${id}/reject`, fin, { comment: '依据不足' });
  expect(okReject.status).toBe(201);
  expect(okReject.body.status).toBe('REJECTED');
});
```

同时给 harness 增加 `apiWithKey(method, url, token, body, key)`（设置 `Idempotency-Key` 头）。

- [x] **Step 2: 运行，确认失败**

```bash
pnpm test
```

Expected: 上述用例 FAIL（404/500）。

- [x] **Step 3: 实现积分账本**

`points.service.ts`（完整规则）：

```ts
export type AdjustmentLine = { memberId: string; points: number; note?: string };

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async balance(memberId: string, now = new Date()): Promise<number> {
    const sum = await this.prisma.pointBatch.aggregate({
      where: { memberId, status: 'ACTIVE', expireAt: { gt: now } }, _sum: { remaining: true }
    });
    return sum._sum.remaining || 0;
  }

  /**
   * 在同一事务内按行执行调整；任何一行失败抛错 → 事务回滚，整单不执行。
   * 扣减按到期最早优先，只动未到期批次；不允许负余额。
   */
  async apply(tx: Prisma.TransactionClient, lines: AdjustmentLine[], meta: {
    type: 'ADJUST'; business: string; ref: string; operatorId: string; operatorName: string; note: string; idemPrefix: string;
  }): Promise<{ memberId: string; delta: number; balance: number; ledgerId: string }[]> {
    const results = [];
    for (const [index, line] of lines.entries()) {
      if (!Number.isInteger(line.points) || line.points === 0) throw badRequest('调整分值必须是非零整数');
      const member = await tx.member.findUnique({ where: { id: line.memberId } });
      if (!member) throw notFound(`会员不存在：${line.memberId}`);
      if (member.status !== 'ACTIVE') throw badRequest(`会员 ${member.memberNo} 不是有效状态，不能调整`);
      const now = new Date();
      if (line.points < 0) await this.consume(tx, member.id, -line.points, now);
      else await this.credit(tx, member.id, line.points, now, meta.business, line.note || meta.note);
      const balance = await this.balanceIn(tx, member.id, now);
      const ledger = await tx.pointLedger.create({
        data: {
          id: newId('PL'), memberId: member.id, type: 'ADJUST', delta: line.points,
          balanceAfter: balance, business: meta.business, ref: meta.ref,
          operatorId: meta.operatorId, operatorName: meta.operatorName,
          note: line.note || meta.note, idemKey: `${meta.idemPrefix}:${index}:${member.id}`
        }
      });
      results.push({ memberId: member.id, delta: line.points, balance, ledgerId: ledger.id });
    }
    return results;
  }

  /** 测试与对账用：余额必须等于所有未到期 ACTIVE 批次的 remaining 之和。 */
  private async balanceIn(tx: Prisma.TransactionClient, memberId: string, now: Date) {
    const sum = await tx.pointBatch.aggregate({ where: { memberId, status: 'ACTIVE', expireAt: { gt: now } }, _sum: { remaining: true } });
    return sum._sum.remaining || 0;
  }

  private async credit(tx: Prisma.TransactionClient, memberId: string, points: number, now: Date, business: string, note: string) {
    await tx.pointBatch.create({
      data: {
        id: newId('PB'), memberId, issuerBusiness: business, sourceRef: '',
        amount: points, remaining: points, status: 'ACTIVE', earnedAt: now, expireAt: pointExpireAt(now)
      }
    });
  }

  private async consume(tx: Prisma.TransactionClient, memberId: string, points: number, now: Date) {
    const batches = await tx.pointBatch.findMany({
      where: { memberId, status: 'ACTIVE', remaining: { gt: 0 }, expireAt: { gt: now } },
      orderBy: [{ expireAt: 'asc' }, { earnedAt: 'asc' }]
    });
    let need = points;
    for (const batch of batches) {
      if (need === 0) break;
      const take = Math.min(batch.remaining, need);
      const updated = await tx.pointBatch.updateMany({
        where: { id: batch.id, status: 'ACTIVE', remaining: { gte: take } },
        data: { remaining: { decrement: take }, ...(batch.remaining - take === 0 ? { status: 'DEPLETED' } : {}) }
      });
      if (updated.count !== 1) throw conflict('积分批次已被其他操作占用，请重试');
      need -= take;
    }
    if (need > 0) throw unprocessable('积分余额不足');
  }
}
```

- [x] **Step 4: 实现调整单状态机**

`adjustments.service.ts`：

```ts
@Injectable()
export class AdjustmentsService {
  constructor(private readonly prisma: PrismaService, private readonly points: PointsService) {}

  async createSingle(input: { memberId: string; points: number; reason: string; ref?: string }, actor: StaffContext, idemKey?: string) {
    this.validateReason(input.reason);
    const line = { memberId: input.memberId, points: input.points };
    if (Math.abs(input.points) <= ADJUST_FREE_LIMIT) {
      const result = await this.runIdempotent(idemKey, input, () => this.prisma.$transaction(async (tx) => {
        const [applied] = await this.points.apply(tx, [line], this.meta(actor, input.reason, input.ref));
        return { status: 'APPLIED', balance: applied.balance, ledgerId: applied.ledgerId, request: null };
      }));
      await audit(this.prisma, { actor, action: '积分调整', target: input.memberId, detail: `${input.points > 0 ? '+' : ''}${input.points} · ${input.reason}` });
      return result;
    }
    const request = await this.prisma.adjustmentRequest.create({ data: this.requestData('SINGLE', input.reason, [line], actor) });
    await audit(this.prisma, { actor, action: '发起积分调整', target: request.id, detail: `${input.points} 分待审批 · ${input.reason}` });
    return { status: 'PENDING', request };
  }

  async createBatch(input: { reason: string; lines: AdjustmentLine[] }, actor: StaffContext) {
    this.validateReason(input.reason);
    if (!input.lines?.length) throw badRequest('批量调整至少一行');
    if (input.lines.length > 50) throw badRequest('单次批量最多 50 行');
    const ids = input.lines.map((l) => l.memberId);
    if (new Set(ids).size !== ids.length) throw badRequest('同一会员在一批中只能出现一次');
    const members = await this.prisma.member.findMany({ where: { id: { in: ids } } });
    if (members.length !== ids.length) throw badRequest('存在不存在的会员');
    for (const line of input.lines) {
      if (!Number.isInteger(line.points) || line.points === 0) throw badRequest('每行分值必须是非零整数');
      if (line.points < 0) {
        const bal = await this.points.balance(line.memberId);
        if (bal + line.points < 0) throw badRequest(`会员 ${line.memberId} 余额不足`);
      }
    }
    const request = await this.prisma.adjustmentRequest.create({ data: this.requestData('BATCH', input.reason, input.lines, actor) });
    await audit(this.prisma, { actor, action: '发起批量积分调整', target: request.id, detail: `${input.lines.length} 人 · ${input.reason}` });
    return { status: 'PENDING', request };
  }

  async decide(id: string, action: 'approve' | 'reject', comment: string, actor: StaffContext) {
    const request = await this.prisma.adjustmentRequest.findUnique({ where: { id } });
    if (!request) throw notFound('调整单不存在');
    if (request.requestedBy === actor.id) throw forbidden('审批人不能是发起人');
    if (request.status !== 'PENDING') throw conflict('该调整单已处理');
    if (action === 'reject') {
      if ((comment || '').trim().length < 2) throw badRequest('驳回必须填写意见');
      const updated = await this.prisma.adjustmentRequest.update({ where: { id }, data: { status: 'REJECTED', approvedBy: actor.id, approvedByName: actor.name, comment: comment.trim(), decidedAt: new Date() } });
      await audit(this.prisma, { actor, action: '驳回积分调整', target: id, detail: comment.trim() });
      return { status: 'REJECTED', request: updated };
    }
    const lines = JSON.parse(request.payloadJson) as AdjustmentLine[];
    try {
      const applied = await this.prisma.$transaction(async (tx) => {
        const result = await this.points.apply(tx, lines, this.meta(actor, request.reason, request.id));
        await tx.adjustmentRequest.update({ where: { id }, data: { status: 'APPLIED', approvedBy: actor.id, approvedByName: actor.name, comment: (comment || '').trim(), decidedAt: new Date(), appliedAt: new Date() } });
        return result;
      });
      await audit(this.prisma, { actor, action: '批准积分调整', target: id, detail: `${lines.length} 行` });
      return { status: 'APPLIED', applied };
    } catch (error) {
      // 审批时复核失败：整单不执行，单据保持待审批，由发起人修改或驳回。
      throw error instanceof ApiError ? error : unprocessable('审批时复核失败，整单未执行');
    }
  }
}
```

`runIdempotent`：无键直接执行；有键先查 `idempotencyKey`，同 hash 返回 `JSON.parse(resultJson)`，异 hash 抛 409；执行后 `create`，唯一冲突时重读并比较。`requestData` 把 lines 存 `payloadJson`，`totalPoints` 为合计，`requestedBy/Name` 取 actor。

控制器：`POST /adjustments`（`crm:adjust:create`，取 `Idempotency-Key` 头）、`POST /adjustments/batch`（`crm:adjust:batch`）、`GET /adjustments`、`GET /adjustments/:id`、`POST /adjustments/:id/approve|reject`（`crm:adjust:approve`）。

- [x] **Step 5: 运行**

```bash
pnpm test
```

Expected: 全部 PASS。若批量审批用例因「苏晚余额不足」得到 422、单据仍 PENDING，即符合预期。

---

### Task 6: 审计查询与收口

**Files:**
- Create: `apps/server/src/audit/audit.controller.ts`
- Modify: `apps/server/src/api/api.module.ts`
- Modify: `apps/server/src/crm.spec.ts`

- [x] **Step 1: 追加测试**

```ts
it('审计只追加：客服无权查看，财务可按动作与关键词筛选，登录与调整都有留痕', async () => {
  const denied = await h.api('get', '/audit', cs);
  expect(denied.status).toBe(403);
  const logs = await h.api('get', '/audit?q=积分', fin);
  expect(logs.status).toBe(200);
  expect(logs.body.logs.some((l: { action: string }) => l.action.includes('积分'))).toBe(true);
  const login = await h.api('get', '/audit?action=登录后台', fin);
  expect(login.body.logs.length).toBeGreaterThanOrEqual(4);
});

it('积分不变量：每位会员余额 = ACTIVE 批次合计 = 最新流水 balance_after', async () => {
  for (const id of ['m-lin', 'm-su', 'm-tang']) {
    const detail = await h.api('get', `/members/${id}`, admin);
    const sum = await h.prisma.pointBatch.aggregate({ where: { memberId: id, status: 'ACTIVE', expireAt: { gt: new Date() } }, _sum: { remaining: true } });
    expect(detail.body.balance).toBe(sum._sum.remaining || 0);
    expect(detail.body.ledger[0].balanceAfter).toBe(detail.body.balance);
  }
});
```

- [x] **Step 2: 实现审计查询**

`audit.controller.ts`：

```ts
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePerm('crm:audit:view')
  async list(@Query('action') action?: string, @Query('actor') actor?: string, @Query('q') q?: string) {
    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = { contains: action };
    if (actor) where.actorName = { contains: actor };
    if (q) where.OR = [{ detail: { contains: q } }, { target: { contains: q } }, { action: { contains: q } }];
    const logs = await this.prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, take: 100 });
    return { logs };
  }
}
```

- [x] **Step 3: 运行全量测试与构建**

```bash
cd ~/Desktop/Full愈-CRM
pnpm test
pnpm build:server
```

Expected: 测试全部 PASS；`tsc` 无错误。

- [x] **Step 4: 写 README 与启动校验**

README 必须包含：本地启动（`pnpm install --offline && pnpm db:push && pnpm db:seed && pnpm dev:server`）、四个本地测试账号（密码只在 README 写"见 SEED_PASSWORD"或本地开发值，不写任何生产凭据）、API 列表、证据边界（E1）、下一步批次、以及「本仓库与三端生产库隔离，切换前另做只读核查与授权」。

启动校验：

```bash
cd ~/Desktop/Full愈-CRM
DATABASE_URL=file:./prisma/dev.db pnpm db:push
DATABASE_URL=file:./prisma/dev.db pnpm db:seed
DATABASE_URL=file:./prisma/dev.db JWT_SECRET=local-only-32-characters-xxxxxxxx pnpm dev:server &
curl -s localhost:3000/api/health
```

Expected: health 返回 `{status:'ok'}`（若无 health 控制器，补一个返回 `{status:'ok',service:'crm'}` 的 `GET /health`，不鉴权）。

---

## 自检（写计划时完成）

- **规格覆盖**：本批覆盖设计 §2 工程默认项（整数分、CRM 权威、不静默成功）、§4.1–4.2 身份与资料版本、§6.2 批次过期、§6.5 人工调整、§7.5 审计、§7.6 四角色与职责分离；§5、§6.1、§6.3、§6.4、§7.1–7.4、§9–11 明确留到 1B–1F。没有遗漏被声称完成的内容。
- **占位扫描**：无 TBD/TODO；每个任务给出文件、命令、预期输出与可执行代码。`test/global-setup.ts` 与 harness 明确要求按已给路径改写复制，不加入新能力。
- **类型一致**：`AdjustmentLine`、`StaffContext`、`AdjustmentRequest.payloadJson`、`balanceAfter`、`ADJUST_FREE_LIMIT` 在任务间命名一致；权限码与服务端守卫一致。
- **风险**：SQLite 开发库的并发能力有限，扣减使用条件更新兜底；切 MySQL 时需补 `SELECT … FOR UPDATE` 与唯一约束迁移演练（1C 计划）。离线安装若缺包会立即停止，不降级版本凑合。

---

## 执行记录（2026-11-08，E1：本地合成数据）

仓库：`~/Desktop/Full愈-CRM`（独立 git 库，未提交、未部署）。

- 依赖：`pnpm install --offline` 从本机 store 安装成功（Prisma 实际落 5.22.0，满足 `^5.10`）。
- 结构与计划一致；四处为执行时的必要调整：
  1. `packages/shared` 增加 `tsconfig.json` 与 `build`，`main` 指向 `dist/index.js`，避免 TS 源码被 Node 运行时加载。
  2. `apps/server/tsconfig.build.json` 改为 `rootDir: src`、`paths: {}`、排除 `src/testing`，产物为 `dist/main.js`，不嵌套。
  3. 新增 `src/env.ts`（`process.loadEnvFile`），seed 与 main 读取 `apps/server/.env`；已存在的环境变量优先，测试注入不被覆盖。
  4. 根脚本 `build:server` / `dev:server` 先编 shared；新增根 `build`（`pnpm -r build`）。
- 测试：先 15/15 通过，补两条边界用例后 17/17 通过（过期批次不计余额/不参与扣减、扣减按到期最早优先）；`pnpm lint` 两包无类型错误；`pnpm build:server` 成功。
- 启动冒烟：生产产物在 3100 端口起服务，`/api/health` 200；登录、会员检索、+200 直接入账、同键重放同 `ledgerId`、+600 待审、财务审批后 `m-lin` 余额 500→1100 均实测通过；开发态 `pnpm dev:server` 同样 200。
- 如实说明：测试与实现是同一轮编写完成的，没有保留“先红后绿”的过程证据；本批的正确性证据是上述最终运行结果，不宣称红阶段。
- 未提交、未部署、未接触三端生产库；MySQL、并发压测、三端联调仍待后续批次。

