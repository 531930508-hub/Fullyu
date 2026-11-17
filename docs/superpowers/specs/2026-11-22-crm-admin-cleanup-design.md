# CRM 后台整理与清库 · 设计规格

- 日期：2026-11-22
- 范围：`crm/**`（后台、服务端、共享包、脚本、文档）
- 目标环境：`test-crm.fullyu.cn`（8.133.6.18，库 `crm_test`）与 `crm.fullyu.cn`（121.40.119.57，库 RDS `crm`）
- 生产数据事实（2026-11-22 只读盘点）：生产 9,918 位会员（9,911 位有手机号，多数来自轻疗身份）、1,237 条积分流水、47 张会员卡期、4 个后台账号；测试库为生产数据的近同源副本。

## 1. 目标

1. 清空测试与生产的业务数据，只保留登录账号、角色与配置，从零开始运营。
2. 删除"业务会员卡"模块（后台页面、服务端接口、数据库表）。
3. 后台左侧一级菜单改为手风琴：同一时间只展开一个分组，进入页面时自动展开所在分组。
4. 增加用户与角色管理：新增/编辑/停用/重置密码后台用户，新增/编辑/删除自定义角色，保留内置角色保护。

## 2. 非目标

- 不改登录方式（仍为账号 + 密码，JWT 12 小时）。
- 不改三端对外接口契约（`/brand-member` 等）。
- 不做会员数据恢复、跨库迁移或数据脱敏导出。
- 不新增数据库结构迁移（用户与角色复用现有 `staff` / `crm_roles` / `staff_roles`）。

## 3. 数据清理

### 3.1 清空表（25）

`members`、`member_identities`、`point_batches`、`point_ledger`、`adjustment_requests`、`brand_card_quotes`、`member_brand_cards`、`member_orders`、`pickup_vouchers`、`member_game_states`、`game_tickets`、`dice_ledger`、`game_rolls`、`game_prizes`、`member_invites`、`member_notices`、`member_feedback`、`feedback_stories`、`gift_campaigns`、`gift_claims`、`outbox_events`、`business_sync_states`、`idempotency_keys`、`api_nonces`、`audit_logs`。

`business_card_catalog` 不清理，随模块删除直接 `DROP TABLE`。

### 3.2 保留表（7）

`staff`、`staff_roles`、`crm_roles`、`rule_set_versions`、`brand_card_products`、`brand_card_versions`、`counters`。

`counters` 保留会员号序列，避免删除后新会员复用历史号码。

### 3.3 执行顺序与安全措施

1. 停服务（`systemctl stop fullyu-crm` / `fullyu-crm-test`），避免同步接口在清理期间回写。
2. 全库备份：`mysqldump --single-transaction --routines --triggers` 压缩到 `/root/backups/crm-pre-wipe-<ts>.sql.gz`，本地另存 `~/fullyu-backups/`；校验 `gunzip -t`、SHA256、表清单。
3. 记录清理前逐表行数。
4. 单事务内按外键安全顺序 `DELETE`，提交后逐表校验为 0。
5. 起服务，记录清理后逐表行数。
6. 探针：`/api/health` 200、后台登录成功、会员列表为空、审计日志仅有本次登录记录。

测试环境先完整演练；生产环境在展示备份路径与前后行数、并获得最终一句确认后执行。预计停机小于 2 分钟。

## 4. 删除业务会员卡模块

- 后台：删除 `NAV` 中 `business-cards`、`pageBusinessCards`、`PAGES` 映射及相关样式/文案。
- 服务端：删除 `business-cards.controller.ts`、`business-cards.service.ts`、模块注册、相关测试、seed 中的目录数据与统计。
- Prisma：从 `schema.prisma` 与 `schema.mysql.prisma` 删除 `BusinessCardCatalog` 模型，重新生成客户端。
- 数据库：两端 `DROP TABLE business_card_catalog`（执行前已全库备份）。
- 对外 `/brand-member` 的 `businessCards: []` 保持不变。
- 共享权限 `crm:card:view` 名称去掉"业务卡目录"。

## 5. 菜单手风琴

- `NAV` 分组标题渲染为按钮，带 `aria-expanded` 与箭头。
- 点击分组：展开该组并收起其他组；再次点击当前组则全部收起。
- 路由切换时自动展开当前页所在分组。
- 展开分组记录在 `localStorage`（键：`fullyu.crm.navGroup`），刷新后恢复；无记录时展开当前页分组。
- 宽度小于 900px 时保持现有平铺样式，隐藏分组按钮。

## 6. 用户与角色管理

### 6.1 权限

- 新增权限点 `crm:staff:edit`（维护后台用户与角色）。
- CRM 管理员通过 `*` 自动拥有；其他角色默认不授予，可在角色页勾选。

### 6.2 服务端接口

用户：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/staff` | 用户列表：姓名、账号、角色、启用状态、创建时间 |
| POST | `/staff` | 新增：姓名、账号、初始密码、角色、启用状态 |
| PATCH | `/staff/:id` | 修改姓名、角色、启用状态 |
| POST | `/staff/:id/password` | 重置密码 |

校验与保护：

- 账号唯一，去空白，长度 3–32；密码最少 8 位；角色必须存在。
- 不能停用自己；不能移除自己的 CRM 管理员角色。
- 系统始终保留至少一个启用中的 CRM 管理员。
- 重置密码与停用会递增 `tokenVersion`，旧 JWT 立即失效。
- 所有写操作写审计（新增用户 / 修改用户 / 重置密码）。

角色：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/roles` | 现有接口，扩展返回每个角色的人数 |
| POST | `/roles` | 新增自定义角色：名称、说明、权限 |
| PATCH | `/roles/:id` | 修改名称、说明、权限 |
| DELETE | `/roles/:id` | 删除自定义角色，已分配用户时拒绝 |

保护：

- 内置角色不可删除；`crm-admin` 权限固定 `*`，不可修改。
- 内置角色可改说明与权限（`crm-admin` 除外），名称保持不变。
- 删除角色前检查 `staff_roles`，有分配则返回 409 并提示先改派。

### 6.3 后台页面

- 原"角色权限"菜单改为"用户与角色"，权限为 `crm:staff:edit` 或 `crm:role:edit`。
- 用户标签页：表格 + 新增用户表单 + 编辑/停用/重置密码操作。
- 角色标签页：角色列表（名称、说明、人数、权限数）+ 新建角色 + 权限矩阵编辑 + 删除。
- 仅拥有 `crm:role:edit` 的账号只看到角色标签页；仅拥有 `crm:staff:edit` 的账号只看到用户标签页。

## 7. 测试

- 服务端单测：新增用户、重复账号、弱密码、角色不存在、停用自己、移除最后管理员、重置密码后 tokenVersion 递增；角色新增/改名/删除、内置角色保护、已分配角色删除拒绝。
- 现有 `external.spec.ts`、`brand-cards.spec.ts` 等回归通过。
- 构建：`scripts/release-check.sh --project crm --full`，MySQL schema 构建通过。
- 测试环境走查：菜单折叠、用户新增与登录、角色增删、业务会员卡页面与接口消失、清库后空列表与登录正常。

## 8. 部署与回滚

- 代码：新分支只提交本次触碰的 `crm/**` 与设计文档；合并 `main` 后按 CRM 手工流程构建（MySQL）。
- 测试环境：备份 dist → 覆盖 → `systemctl restart fullyu-crm-test` → 探针。
- 生产环境：单独授权后执行；先备份库与 dist，再清库、部署、探针。
- 回滚：
  - 代码：恢复 dist 备份并重启；数据库结构删除不可逆，依靠 `business_card_catalog` 全库备份恢复。
  - 数据：清库不可逆，依靠清理前 dump 恢复；恢复演练先在测试库做一次。

## 9. 验收标准

1. 两端业务表行数为 0（保留表不变），登录正常，会员/流水/卡期列表为空。
2. 后台无"业务会员卡"入口，`/business-cards` 返回 404；两端无 `business_card_catalog` 表。
3. 菜单同时只展开一个分组，进入页面自动展开所在分组，刷新后保持。
4. 管理员可新增用户并用新账号登录；可停用、重置密码；旧会话失效。
5. 可新增自定义角色并分配权限；内置角色保护生效；有用户的角色不可删。
6. 所有写操作在审计日志可查（清库后新产生的日志）。