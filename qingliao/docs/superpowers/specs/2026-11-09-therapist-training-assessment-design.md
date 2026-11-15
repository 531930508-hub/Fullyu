# Full愈轻疗 · 疗愈师培训考核（3 位内训师认证）设计规格

> 状态：待用户复核  
> 日期：2026-11-09  
> 范围：`tou-mall-server` + `tou-mall-admin-web`，测试环境先行，生产未授权  
> 关联现有实现：`s_massagist_training_cert`、`TrainingCalculator`、`IncentiveController`、`views/incentive/training`、`views/massagist/management`

---

## 1. 背景与目标

### 1.1 现状

- 运营在「接单奖励 → 培训考核」里，给某位疗愈师的某个培训项目手动登记一个**通过日期**。
- 认证表 `s_massagist_training_cert` 每位疗愈师每个项目只有一条记录，字段为 `passed_at`、`certifier_id/name`、`remark`。
- 培训奖励由 `TrainingCalculator` 按“通过日次日起累计有效订单”计算，认证表是唯一依据。
- 没有内训师身份、没有每次考核的记录、没有失败次数和通过率分析。

### 1.2 目标

1. 疗愈师档案增加“内训师”身份，并在技师列表里能看见“店长 / 内训师 / 疗愈师”。
2. 内训师在手机 H5 上记录每一次考核：谁、几月几号、考核哪个部位/项目、通过还是不通过、备注。
3. 3 位不同内训师都通过后，系统自动认证；通过日期取最后一次考核通过日期。
4. 认证后继续沿用现有培训奖励计算，不改奖励公式。
5. 后台能看整体考核情况：考核次数、失败次数、通过率、认证人数、平均认证次数/天数、重复失败名单，并能导出。
6. 历史人工登记的“已通过”记录继续有效，不影响已发/待发奖励。

### 1.3 不做

- 不改小程序顾客端。
- 不做疗愈师自己提交考核、自己看失败记录。
- 不做评分、照片、视频、签名。
- 不改培训奖励金额、目标单数、订单匹配规则。
- 不做自动发奖、自动打款；奖励仍按现有薪资/激励流程结算。

---

## 2. 已确认的业务规则

| 决策点 | 结论 |
|---|---|
| 内训师记录入口 | 手机端 H5 工作台；PC 同一页面自适应 |
| 3 人通过后改判 | 通过后锁定，后续不自动撤销 |
| 历史人工认证 | 保留并视为已通过，不要求补 3 位内训师 |
| 数据范围 | 内训师可跨店考核；整体看板/导出只给管理角色；内训师只看自己提交的记录 |
| 补记窗口 | 最多往回补记 30 天 |
| 人工特批 | 仅超级管理员可特批，必须填原因并留痕 |
| 考核时可见性 | 完全盲考：只看“待考核/已认证”，不看已通过人数、不看是谁、不看失败记录 |
| 通过日期口径 | 按考核日期；最后一次考核通过日期即认证通过日期 |

---

## 3. 角色、身份与入口

### 3.1 身份模型

在 `s_massagist` 增加：

- `is_trainer TINYINT NOT NULL DEFAULT 0`：是否内训师。
- `trainer_since DATE NULL`：成为内训师的日期，仅展示/审计用。

“店长”不新增字段，继续以 `f_approval_shop_manager` 为准，避免两套店长数据。技师列表和培训看板通过左连接/批量查询带出 `shopManager` 瞬态字段。

“疗愈师”是所有档案的基础身份。身份展示规则：

- 店长：`f_approval_shop_manager.massagist_id = s_massagist.id`
- 内训师：`s_massagist.is_trainer = 1`
- 疗愈师：始终显示
- 一个人可以同时是店长和内训师，标签并列展示。

### 3.2 后台账号

现有 `MassagistService.saveOrUpd` 新增疗愈师时会自动创建后台账号（用户名/初始密码为手机号）并写入 `ums_admin_id`。因此：

- 内训师必须有疗愈师档案，并关联后台账号，才能登录考核。
- 如果历史档案没有 `ums_admin_id`，可以在“账号关联疗愈师”里关联；未关联时档案允许标记内训师，但列表提示“待开通账号”，考核接口返回明确错误。
- 不做自动创建/自动重置密码。

### 3.3 入口

- 手机端页面路由：`/trainer-assess`，隐藏路由，移动端全屏。
- 入口放在后台右上角用户菜单：已标记内训师且账号有效的用户，会看到「内训考核」；与现有「我的接单奖励」入口同一模式。
- `/admin/info` 增加 `trainer` 布尔字段，前端存入 Vuex，用于显示入口。
- 不新增 RBAC 角色：内训师是业务身份，不是权限角色；API 以 `s_massagist.is_trainer` + 当前账号关联关系授权，避免“角色说他是、档案说不是”的两套身份。
- 管理端看板仍在「接单奖励 → 培训考核」侧栏菜单，按现有角色/门店范围控制。

> 如果后续希望内训师在侧栏也有独立菜单，可在不改 API 的前提下补一个菜单项；本规格不依赖它。

### 3.4 内训师资格

- `is_trainer = 1`
- 疗愈师状态 `status = 1`（合作中）
- 已关联后台账号，且后台账号启用
- 当前登录账号能反查到唯一疗愈师档案

不满足时：

- 未关联账号：`当前账号未关联疗愈师档案，无法进行内训考核`
- 已离职：`当前账号已结束合作，无法进行内训考核`
- 非内训师：`当前账号不是内训师，无法进入考核工作台`

---

## 4. 考核记录与认证规则

### 4.1 一次考核记录

每次内训师提交，写入一条不可覆盖的记录：

| 字段 | 说明 |
|---|---|
| 疗愈师 | 被考核人 `massagist_id` |
| 门店 | 被考核人当时所属门店 `shop_id`（快照） |
| 项目/部位 | `project_key` + `project_name` 快照 |
| 结果 | `result`：1 通过，0 不通过 |
| 考核日期 | `assess_date`，内训师选择，默认今天 |
| 备注 | `remark`，可选，最多 500 字 |
| 内训师 | `trainer_massagist_id` + `trainer_name` 快照 |
| 内训师门店 | `trainer_shop_id` 快照 |
| 提交时间 | `submitted_at` 服务端时间 |
| 提交账号 | `trainer_admin_id` |
| 作废 | `voided`、`voided_by`、`voided_at`、`void_reason` |

项目/部位直接复用现有 `s_training_project_config` 的启用项目（全感舒筋 6 个部位 + 头部水疗 60/90）。运营在「奖励参数」里增删项目，内训师端自动同步。

### 4.2 判定规则

1. 同一内训师对同一疗愈师同一项目可以多次考核；**认证前以最新一次为准**。
2. 不同内训师按 `trainer_massagist_id` 去重。
3. 取每位内训师最新一条有效记录（按 `submitted_at DESC, id DESC`；补记旧日期也以最后一次提交的结论为准）。
4. 最新结果为“通过”的内训师人数 ≥ 3，且当前没有认证记录 → 自动认证。
5. 通过日期 `passed_at` = 这 3 位内训师通过记录中**最大的考核日期**。
6. 认证写入时间 `certified_at` = 服务端当前时间，单独保留，便于追溯“什么时候凑齐 3 人”。
7. 认证后该项目在考核端关闭：后续提交一律拒绝，提示“该项目已认证，无需重复考核”。如需复核/纠错，只能由管理角色撤销认证。
8. 认证前，内训师可以再次提交改变自己的结论；例如先通过、后不通过，则以不通过为准，通过人数下降。
9. 历史内训师离职、取消内训师身份，不影响其历史考核记录；如记录有误，由管理员作废。
10. 内训师不能考核自己：`trainer_massagist_id != massagist_id`。
11. 被考核人必须是合作中 `status = 1`，且已分配门店。
12. 停用项目不能考核；项目被停用后历史记录仍保留。
13. 允许跨店考核；考核记录分别保留被考核人门店和内训师门店。
14. 考核日期不得晚于今天；不得早于今天减 30 天；有 `entry_day` 时不得早于入职日。
15. 同一内训师对同一疗愈师、同一项目、同一考核日期、同一结果，10 分钟内重复提交视为重复，拒绝并提示。

### 4.3 认证来源

认证表增加 `source`：

| source | 含义 | 通过日期 | 说明 |
|---|---|---|---|
| `LEGACY` | 历史人工登记 | 原 `passed_at` | 迁移时回填，继续算奖励 |
| `TEAM` | 3 位内训师 | 最后一次通过考核日期 | 正常新流程 |
| `MANUAL` | 超级管理员特批 | 超级管理员选择的日期 | 例外通道，单独统计 |

`team_size`：`LEGACY=0`、`TEAM=3`、`MANUAL=1`。

### 4.4 撤销与作废

- **作废单条考核**：仅认证前允许；管理角色填写原因后置 `voided=1`，系统重新判定。认证后拒绝，提示走撤销认证。
- **撤销认证**：仅超级管理员/总助/运营/财务（现有全局角色）允许；必须填写原因。撤销时：
  1. 删除当前认证记录；
  2. 将该疗愈师该项目全部有效考核记录置为作废，原因写“认证撤销”；
  3. 写认证变更日志，action=`REVOKE`；
  4. 该项目回到“未认证”，重新从 0 开始考核。
- 作废/撤销不物理删除考核记录，保留审计。

### 4.5 超级管理员特批

- 仅角色名 `超级管理员` / `admin`（现有超管口径）可操作。
- 必须填写 10–500 字原因。
- 只能在该疗愈师该项目**没有认证记录**时使用；已有认证先撤销。
- 通过日期可选任意不晚于今天的日期。
- 写入 `source=MANUAL`、`team_size=1`、`certified_at=now`，认证人记为超管。
- 看板、导出必须单独标记“特批”，不能与 3 人认证混在一起统计通过率。

### 4.6 并发与幂等

- 提交考核时先对 `s_massagist` 对应行加 `FOR UPDATE` 锁，保证同一疗愈师的考核串行判定。
- 认证表 `uk_massagist_project` 保持唯一；重复认证由唯一键兜底。
- 若两个内训师同时成为“第 3 位”，只有先拿到锁的事务能写认证，后一个事务看到已认证后拒绝提交。
- 考核记录插入与认证判定在同一事务内完成。

---

## 5. 数据模型

### 5.1 `s_massagist` 新增

| 字段 | 类型 | 说明 |
|---|---|---|
| `is_trainer` | TINYINT NOT NULL DEFAULT 0 | 是否内训师 |
| `trainer_since` | DATE NULL | 成为内训师日期 |

### 5.2 新表 `s_massagist_training_assessment`

```sql
CREATE TABLE s_massagist_training_assessment (
  id BIGINT NOT NULL AUTO_INCREMENT,
  massagist_id BIGINT NOT NULL COMMENT '被考核疗愈师ID',
  shop_id BIGINT NULL COMMENT '被考核疗愈师当时门店',
  project_key VARCHAR(64) NOT NULL COMMENT '培训项目编码',
  project_name VARCHAR(128) NOT NULL COMMENT '项目名称快照',
  assess_date DATE NOT NULL COMMENT '考核日期',
  result TINYINT NOT NULL COMMENT '1通过 0不通过',
  trainer_massagist_id BIGINT NOT NULL COMMENT '内训师疗愈师ID',
  trainer_name VARCHAR(64) NOT NULL COMMENT '内训师姓名快照',
  trainer_shop_id BIGINT NULL COMMENT '内训师当时门店',
  trainer_admin_id BIGINT NULL COMMENT '内训师后台账号ID',
  remark VARCHAR(500) NULL,
  submitted_at DATETIME NOT NULL COMMENT '提交时间',
  voided TINYINT NOT NULL DEFAULT 0 COMMENT '1已作废',
  voided_by BIGINT NULL,
  voided_at DATETIME NULL,
  void_reason VARCHAR(500) NULL,
  create_time DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_assess_target (massagist_id, project_key, assess_date),
  KEY idx_assess_trainer (trainer_massagist_id, assess_date),
  KEY idx_assess_shop (shop_id, assess_date),
  KEY idx_assess_result (result, assess_date),
  KEY idx_assess_submitted (submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='疗愈师培训考核明细';
```

不设唯一键：同一人同一项目允许多次考核、允许失败重考。

### 5.3 `s_massagist_training_cert` 新增

| 字段 | 类型 | 说明 |
|---|---|---|
| `source` | VARCHAR(16) NOT NULL DEFAULT 'LEGACY' | LEGACY/TEAM/MANUAL |
| `certified_at` | DATETIME NULL | 认证写入时间 |
| `team_size` | TINYINT NOT NULL DEFAULT 0 | 0/1/3 |

保留现有 `uk_massagist_project (massagist_id, project_key)`。撤销认证时删除该行，唯一键释放。

索引补充：

```sql
KEY idx_cert_source (source, passed_at)
```

### 5.4 `s_massagist_training_cert_log`

沿用现有表，`action` 新增：

- `TEAM_CERTIFY`：3 人认证
- `MANUAL_CERTIFY`：超管特批
- `REVOKE`：撤销认证

`remark` 记录认证团队/撤销原因；`operator_id/name` 记录完成认证的第 3 位内训师或操作管理员。

### 5.5 迁移回填

```sql
ALTER TABLE s_massagist
  ADD COLUMN is_trainer TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN trainer_since DATE NULL;

ALTER TABLE s_massagist_training_cert
  ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN certified_at DATETIME NULL,
  ADD COLUMN team_size TINYINT NOT NULL DEFAULT 0;

UPDATE s_massagist_training_cert
SET source = 'LEGACY',
    certified_at = TIMESTAMP(passed_at, '00:00:00'),
    team_size = 0
WHERE source = 'LEGACY' AND certified_at IS NULL;
```

迁移脚本必须幂等：执行前检查列是否存在，并校验 `DATABASE() = 'tou_mall_test'`，测试库以外只输出跳过提示。

---

## 6. 接口设计

### 6.1 内训师工作台

| 接口 | 方法 | 说明 |
|---|---|---|
| `/incentive/trainer/profile` | GET | 当前账号的内训师档案、门店、今日/本月提交数、是否可用 |
| `/incentive/trainer/therapists` | GET | 跨店搜索合作中疗愈师；参数 `keyword`、`shopId`、`limit` |
| `/incentive/trainer/therapists/{id}/projects` | GET | 该疗愈师当前项目列表 + 每项状态（PENDING/CERTIFIED + 认证日期） |
| `/incentive/trainer/assessments` | POST | 提交一次考核 |
| `/incentive/trainer/assessments/mine` | GET | 我的提交记录，分页 |

提交请求：

```json
{
  "massagistId": 123,
  "projectKey": "sujin_shoulder",
  "assessDate": "2026-11-09",
  "result": 1,
  "remark": "肩部手法已掌握"
}
```

返回：

```json
{
  "assessmentId": 9001,
  "certified": true,
  "passedAt": "2026-11-09",
  "message": "已记录；该项目已完成 3 位内训师认证"
}
```

盲考约束：

- `profile` 和 `projects` 不返回已通过人数、不返回其他内训师姓名/结果、不返回失败记录。
- 已认证项目只返回 `CERTIFIED` 和 `passedAt`，前端禁用提交。
- 提交成功后，如果未认证，只提示“已记录，等待其他内训师考核”，不提示还差几人。

### 6.2 管理看板

| 接口 | 方法 | 说明 |
|---|---|---|
| `/incentive/training-records` | GET | 现有认证矩阵接口，增加 `passCount`、`failCount`、`attemptCount`、`lastAssessDate`、`certSource`、`certifiedAt`、`teamSize` |
| `/incentive/training-assessments` | GET | 考核明细分页；筛选：日期范围、门店、内训师、疗愈师、项目、结果、是否作废、关键词 |
| `/incentive/training-assessments/summary` | GET | 考核分析汇总：总量、通过率、认证数、平均次数/天数、重复失败、按项目/内训师/门店、近 6 个月趋势、积压名单 |
| `/incentive/training-assessments/export` | GET | 导出考核明细 CSV |
| `/incentive/training-certifications/export` | GET | 导出认证汇总 CSV |
| `/incentive/training-assessments/{id}/void` | POST | 作废单条考核，body 含 `reason` |
| `/incentive/training-records/{certId}/revoke` | POST | 撤销认证，body 含 `reason` |
| `/incentive/training-records/manual` | POST | 超管特批，body 含 `massagistId`、`projectKey`、`passedAt`、`reason` |

现有 `POST /incentive/training-records` 保留为兼容入口，但只有超管调用时转成 `MANUAL` 特批；普通运营调用返回“请由内训师完成 3 人考核”。现有 `DELETE /incentive/training-records/{id}` 保留为撤销认证兼容入口，必须带原因。

### 6.3 权限与数据范围

| 功能 | 超管 | 总助/运营/财务 | 店长 | 内训师（仅身份） |
|---|---|---|---|---|
| 提交考核 | 仅本人也是内训师时 | 仅本人也是内训师时 | 仅本人也是内训师时 | 是 |
| 看自己的考核记录 | 是 | 是 | 是 | 是 |
| 认证矩阵/考核明细/分析 | 全量 | 全量 | 授权门店 | 否 |
| 导出 | 全量 | 全量 | 授权门店 | 否 |
| 作废单条考核 | 是 | 是 | 否 | 否 |
| 撤销认证 | 是 | 是 | 否 | 否 |
| 超管特批 | 是 | 否 | 否 | 否 |
| 标记内训师身份 | 按现有技师编辑权限 | 按现有技师编辑权限 | 否 | 否 |

“内训师仅身份”指：账号关联的疗愈师 `is_trainer=1`，且不具备全局管理角色、不是店长。若同时是店长/运营/财务，则按对应管理权限放开看板。

管理接口必须显式校验，不能只依赖前端隐藏：

- `requireManagement()`：管理看板、明细、分析、导出；全局角色看全量，店长按授权门店，内训师仅身份直接拒绝。
- `requireGlobal()`：作废单条、撤销认证、全量导出；店长的授权门店导出走 `requireManagement()`；超管特批再额外校验超管角色。
- `requireShopAccess(shopId)`：店长范围。
- `requireTrainer()`：内训师提交/自己的记录。
- 内训师仅身份访问管理接口 → 403“当前账号仅可进行内训考核”。

### 6.4 错误文案

| 场景 | 文案 |
|---|---|
| 未关联档案 | 当前账号未关联疗愈师档案，无法进行内训考核 |
| 非内训师 | 当前账号不是内训师，无法进入考核工作台 |
| 已离职 | 当前账号已结束合作，无法进行内训考核 |
| 考核自己 | 不能考核自己 |
| 疗愈师已离职 | 该疗愈师已结束合作，无法考核 |
| 项目停用 | 该项目已停用，无法考核 |
| 已认证 | 该项目已认证（通过日期 X），无需重复考核 |
| 未来日期 | 考核日期不能晚于今天 |
| 超过 30 天 | 最多补记最近 30 天，更早请由运营补录 |
| 早于入职日 | 考核日期不能早于该疗愈师入职日 |
| 重复提交 | 刚刚已提交过相同考核结果，请勿重复提交 |
| 认证后作废 | 该项目已认证，请先撤销认证 |
| 非超管特批 | 仅超级管理员可特批认证 |
| 特批无原因 | 请填写特批原因（10–500 字） |
| 少于 3 位内训师 | 当前可用内训师不足 3 位，无法完成认证 |

---

## 7. 前端设计

### 7.1 内训师手机端 `/trainer-assess`

沿用现有 `/my-rewards` 的移动端壳层（`mv-page` / `mv-shell`）和现有后台视觉 token，不新造一套风格。页面结构：

1. **顶部**：品牌、当前内训师姓名、所属门店、退出/返回。
2. **今日概览**：今日已提交 X 次、本月已提交 Y 次；不展示通过率。
3. **考核表单**：
   - 搜索/选择疗愈师：支持姓名、手机号、门店筛选；结果只显示姓名、门店、合作状态。
   - 选择项目/部位：按项目分组；已认证项目灰显“已认证”，停用项目不显示。
   - 结果：两个大按钮「通过」「不通过」；不通过时备注输入框提示“建议填写未通过原因”。
   - 考核日期：默认今天；可选最近 30 天；未来日期禁用。
   - 备注：最多 500 字。
   - 提交按钮：提交中禁用，防重复点击。
4. **提交结果**：
   - 未认证：绿色提示“已记录，等待其他内训师考核”。
   - 刚好第 3 位：庆祝态“已认证，通过日期 X”。
5. **我的考核记录**：按时间倒序，显示疗愈师、项目、结果、考核日期、备注；可筛选项目/结果。

交互约束：

- 不显示其他内训师姓名、通过人数、失败次数。
- 已认证的疗愈师+项目组合不能再次提交。
- 搜索疗愈师不返回手机号完整号码，后端返回脱敏号码；搜索仍支持完整号码匹配。
- 页面在 375px 宽度下可完整操作；PC 打开时居中显示手机宽度卡片，并提示“建议用手机打开”。

### 7.2 管理端「培训考核」页

现有页面升级为三个 Tab，保留原有筛选（月份、门店、合作状态、姓名）。

#### Tab 1：认证矩阵

- 行：疗愈师；列：项目/部位。
- 单元格状态：
  - 已认证（内训师）：`3/3` + 通过日期 + “内训师认证”
  - 已认证（历史）：`历史认证` + 通过日期
  - 已认证（特批）：`特批` + 通过日期
  - 进行中：`1/3` 或 `2/3` + 最近考核日期；有失败时显示 `失败 N 次`
  - 未开始：`未考核`
- 点击单元格打开右侧抽屉：
  - 认证信息：来源、通过日期、认证时间、认证人/3 位内训师。
  - 考核时间线：考核日期、内训师、结果、备注、提交时间、是否作废。
  - 操作：作废单条（认证前）、撤销认证（认证后，全局角色）、特批（无认证时，超管）。
- 顶部汇总：疗愈师数、已认证项目数、进行中项目数、本月考核次数、本月培训奖励。
- 少于 3 位可用内训师时，页面顶部显示黄色提示。

#### Tab 2：考核记录

- 筛选：日期范围、门店、内训师、疗愈师、项目、结果、是否作废、关键词。
- 表格列：考核日期、提交时间、疗愈师、门店、项目/部位、结果、内训师、备注、状态（有效/已作废）、认证状态。
- 分页，每页 20/50/100。
- 操作：查看详情、作废（认证前，全局角色）。
- 导出按钮：按当前筛选导出明细 CSV。

#### Tab 3：考核分析

- 筛选：近 6 个月/自定义日期、门店、项目、内训师。
- 指标卡：总考核次数、通过率、已认证人数（项目数）、平均认证次数、平均认证天数、重复失败人数。
- 图表/表格：
  - 月度趋势：考核次数、通过率。
  - 按项目：考核次数、通过率、已认证数。
  - 按内训师：提交次数、通过次数、失败次数、通过率、参与认证次数、最近活跃。
  - 按门店：考核次数、通过率、已认证数。
- 重复失败名单：同一疗愈师同一项目失败 ≥ 2 次；显示疗愈师、门店、项目、失败次数、最近失败日期、最近内训师、最近备注；未认证的排前面。
- 积压名单：已有 1–2 位通过、最近 14 天无新考核的疗愈师+项目；显示已通过人数、最近考核日期。
- 导出认证汇总 CSV。

### 7.3 技师列表与编辑

- 技师列表增加“身份”列：店长 / 内训师 / 疗愈师标签。
- 增加身份筛选：全部 / 店长 / 内训师；店长用 `EXISTS f_approval_shop_manager`，内训师用 `is_trainer=1`。
- 编辑弹窗增加“内训师”开关；勾选后提示“需关联后台账号才能登录考核”。
- 未关联账号的内训师，列表身份标签旁显示“待开通账号”。
- 店长身份仍由审批设置维护，技师编辑页只读展示，不在这里改。

---

## 8. 看板指标与导出

### 8.1 指标定义

| 指标 | 口径 |
|---|---|
| 考核次数 | 有效考核记录条数（默认不含作废；可切换含作废） |
| 通过次数 | `result=1` 的有效记录数 |
| 失败次数 | `result=0` 的有效记录数 |
| 通过率 | 通过次数 ÷ 考核次数 |
| 已认证项目数 | `s_massagist_training_cert` 条数，按 source 分列 |
| 平均认证次数 | 仅 `source=TEAM`：该项目从第一次考核到认证期间的有效考核条数 ÷ 认证数 |
| 平均认证天数 | 仅 `source=TEAM`：`passed_at - 第一次考核日期` 的平均天数 |
| 重复失败 | 同一疗愈师同一项目 `result=0` 的有效记录 ≥ 2 |
| 参与认证次数 | 内训师作为 3 位通过者之一出现在 `source=TEAM` 认证中的次数 |
| 积压 | 未认证且已通过人数 1–2，最近考核日期距今 > 14 天 |

### 8.2 导出

统一 CSV（UTF-8 BOM，Excel 可直接打开），沿用现有 `/incentive/export` 的响应方式。

**考核明细 CSV 列**：考核日期、提交时间、疗愈师、疗愈师门店、项目/部位、结果、内训师、内训师门店、备注、是否作废、认证状态、通过日期、认证来源。

**认证汇总 CSV 列**：疗愈师、门店、项目/部位、认证状态、认证来源、通过日期、认证时间、通过内训师、考核次数、失败次数、首次考核日期、最近考核日期。

- 单次导出上限 50,000 行；超过提示缩小筛选范围。
- 导出沿用现有 CSV 文本格式，日期 `yyyy-MM-dd`，时间 `yyyy-MM-dd HH:mm:ss`。
- 导出写入 `HttpServletResponse`，文件名 `培训考核明细_yyyyMMdd_HHmm.csv` / `培训认证汇总_yyyyMMdd_HHmm.csv`。

---

## 9. 奖励衔接与财务边界

1. 认证表仍是培训奖励唯一依据，`TrainingCalculator` 不改。
2. 新认证写入 `passed_at` 后，奖励从 `passed_at + 1` 天开始累计有效订单，沿用现有规则。
3. 历史认证 `source=LEGACY` 的 `passed_at` 不变，奖励结果不变。
4. 超管特批 `source=MANUAL` 与 3 人认证一样参与奖励，但看板和导出单独标记。
5. 30 天补记窗口限制内训师端的追溯范围；超管特批可更早，但必须填原因并留痕。
6. 撤销认证会删除认证行，相关月份奖励会按现有逻辑重新计算；如该月薪资已结算，由财务按现有调整流程处理，系统只负责留痕和可追溯。
7. 认证写入时间 `certified_at` 与奖励起算日 `passed_at` 分开显示，避免“什么时候认证”和“奖励从哪天算”混淆。

---

## 10. 服务端实现建议

### 10.1 代码落点

- 实体：
  - `com.macro.mall.entity.Massagist` 增加 `isTrainer`、`trainerSince`、瞬态 `shopManager`、瞬态 `trainerAccountReady`。
  - 新增 `com.macro.mall.incentive.entity.MassagistTrainingAssessment`。
  - `MassagistTrainingCert` 增加 `source`、`certifiedAt`、`teamSize`。
- Mapper：
  - `MassagistTrainingAssessmentMapper`（MyBatis-Plus）。
  - `TrainingAssessmentPageMapper`（明细分页、汇总、导出用动态 SQL）。
- Service：
  - `TrainingAssessmentService`：提交、作废、撤销、特批。
  - `TrainingCertificationService`：投票归一化、3 人判定、认证写入、日志。
  - `TrainingAnalyticsService`：看板汇总、重复失败、积压、导出。
  - `IncentiveAccessService` 增加 `requireTrainer()`、`requireManagement()`、`isShopManager()`、`isTrainerOnly()`。
- Controller：
  - `TrainingAssessmentController`（`/incentive/trainer/**`）。
  - `TrainingAnalyticsController`（`/incentive/training-assessments/**`、`/incentive/training-certifications/**`）。
  - 现有 `IncentiveController` 保留矩阵/进度接口，增加新字段。
- 前端：
  - `src/views/incentive/trainer/index.vue`（手机工作台）。
  - `src/views/incentive/training/index.vue` 增加三个 Tab、抽屉、筛选、导出。
  - `src/views/massagist/management/index.vue` + `MassagistForm.vue` 增加身份。
  - `src/api/incentive.js` 增加接口。
  - `src/router/index.js` 增加 `/trainer-assess` 隐藏路由。
  - `src/store/modules/user.js` 增加 `trainer` 状态；`Navbar.vue` 增加入口。

### 10.2 认证判定伪代码

```text
submitAssessment(targetId, projectKey, assessDate, result, remark):
  lock massagist row (targetId) for update
  reject if no trainer / not active / self / project disabled / date invalid
  reject if cert exists (massagistId, projectKey)
  reject duplicate within 10 minutes (same trainer/target/project/date/result)
  insert assessment
  votes = latest non-voided assessment per trainer for target+project
          ordered by submittedAt DESC, id DESC
  passVotes = votes where result = 1
  if passVotes.size >= 3:
      firstThree = passVotes sorted by (assessDate, submittedAt) take 3
      passedAt = max(firstThree.assessDate)
      insert cert(source=TEAM, teamSize=3, passedAt, certifiedAt=now)
      insert cert log(TEAM_CERTIFY, operator=current trainer, remark=3 trainer names)
      return {certified: true, passedAt}
  return {certified: false}
```

注意：`passVotes` 按“每位内训师最新一条提交”归一化，不是简单统计所有通过记录；否则同一位内训师多次通过会误判为多人。正常提交时第 3 位通过即触发，`passVotes` 恰好 3 条；批量回填时取最早满足条件的 3 位。

### 10.3 性能

- 矩阵页按当前页疗愈师 ID 批量查考核记录，一次查询后在内存构建 `massagistId|projectKey` 映射，不做 N+1。
- 明细页数据库分页；汇总页用聚合 SQL。
- 导出用流式 Writer，避免 5 万行全部拼在内存。
- 认证判定只查当前疗愈师+项目，数据量小；`s_massagist` 行锁粒度可接受。

### 10.4 开关

新增服务端开关 `incentive.team-cert-enabled`，默认 `false`：

- `false`：内训师入口隐藏、内训师接口返回“内训考核尚未开启”；保留现有手动登记接口，便于回滚。
- `true`：开放新流程，手动登记只保留超管特批。
- 测试环境通过配置打开，生产默认关闭，未经确认不打开。

---

## 11. 迁移与上线步骤

1. 测试库执行 `sql/2026-11-09-training-assessment.sql`，脚本校验 `DATABASE()='tou_mall_test'`。
2. 回填历史认证 `source=LEGACY`、`certified_at=passed_at 00:00:00`、`team_size=0`。
3. 在测试环境把至少 3 位疗愈师标记为内训师；确认其后台账号可登录。
4. 部署后端（开关默认关），编译通过，新增单元测试通过。
5. 构建后台前端，测试环境验证：
   - 内训师入口可见/不可见；
   - 3 人认证、盲考、锁定、撤销、特批；
   - 矩阵、明细、分析、导出；
   - 历史认证奖励金额不变。
6. 测试环境打开 `incentive.team-cert-enabled=true`，做端到端验收。
7. 生产不发版；等用户确认后另行走生产发布流程。

---

## 12. 测试与验收

### 12.1 后端单元测试

必须覆盖：

1. 0/1/2 位内训师通过 → 不认证。
2. 3 位不同内训师通过 → 认证，`passed_at` 取最大考核日期。
3. 同一位内训师 3 次通过 → 只算 1 票，不认证。
4. 内训师 A 先通过后不通过 → 认证前 A 不算通过。
5. 内训师 A 通过、B 通过、A 改不通过 → 只剩 B 通过。
6. 第 4 位通过时已认证 → 拒绝。
7. 历史认证 → 锁定，不再接受考核。
8. 特批认证 → source=MANUAL，锁定。
9. 撤销认证 → 认证删除、考核记录作废、可重新考核。
10. 认证后作废单条 → 拒绝。
11. 认证前作废一条通过 → 重新判定。
12. 30 天内补记 → 通过；31 天前 → 拒绝。
13. 未来日期、早于入职日 → 拒绝。
14. 考核自己 → 拒绝。
15. 停用项目、离职疗愈师 → 拒绝。
16. 跨店考核 → 允许。
17. 内训师仅身份访问管理接口 → 403；店长看授权门店；全局看全量。
18. 少于 3 位可用内训师 → 提示。
19. 并发第 3 位 → 只产生一条认证（事务/集成测试）。
20. 历史认证奖励金额与改造前一致。

### 12.2 前端验收

- 手机 375×812：完整选人、选项目、提交、看记录。
- 已认证项目不可提交，提示通过日期。
- 提交成功不泄露其他内训师信息。
- 管理端三 Tab 切换、筛选、分页、抽屉、导出正常。
- 技师列表身份标签和筛选正确。
- 现有培训奖励页面数字与改造前一致（历史认证）。

### 12.3 验收标准

- 内训师 A/B/C 分别提交通过，系统在 C 提交后自动认证，矩阵显示 `3/3`，通过日期为 C 的考核日期。
- A 提交通过后再提交不通过，且 B/C 尚未通过时，矩阵显示 A 的最新结论为不通过。
- 认证后任何内训师再提交，均被拒绝。
- 运营撤销认证后，矩阵回到未认证，考核记录显示已作废，重新考核可再次认证。
- 历史人工认证显示“历史认证”，奖励金额不变。
- 超管特批必须填原因，认证来源显示“特批”，统计不混入 3 人认证。
- 导出文件能直接用 Excel 打开，筛选条件与页面一致。
- 内训师账号看不到管理看板和导出；店长只看到授权门店。

---

## 13. 风险与运营注意

1. **追溯奖励**：内训师最多补记 30 天；如果补记跨过已结算月份，相关月份奖励会重算，需财务按现有调整流程处理。系统通过 `certified_at` 与 `passed_at` 分开显示来留痕。
2. **内训师独立性**：盲考只显示“待考核/已认证”，不显示人数和他人结论；管理端仍可看到全量，便于事后复盘。
3. **内训师数量**：少于 3 位可用内训师时无法认证；上线前需确认至少 3 位，并在看板顶部持续提示。
4. **身份与账号一致性**：内训师标记在疗愈师档案，登录用后台账号；未关联账号时不能考核。上线前批量检查 `is_trainer=1 && ums_admin_id IS NULL` 的档案。
5. **特批滥用**：仅超管可特批，必须填原因，单独统计；建议每月在看板复核特批数量。
6. **历史数据质量**：历史认证不做 3 人校验，保留原通过日期；如果历史日期有误，由运营撤销后重新走内训师考核。
7. **生产开关**：`incentive.team-cert-enabled` 默认关闭；生产未确认前不打开，不影响现有手动登记和奖励计算。
