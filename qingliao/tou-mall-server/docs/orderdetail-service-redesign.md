# OrderDetailService 重构设计（预约写入链路）

配套文件：`docs/booking-invariants-checklist.md`（下文 `B1/M1/...` 均指该清单编号）

---

## 1 现状诊断

`OrderDetailService` 2671 行 / 44 个方法 / 12 个 `@Autowired`，同时承担 6 类职责：

| 职责 | 典型方法 |
|---|---|
| 可用性校验 | `checkAndBuildOrderList:189`、`pcNoCheckAndBuildOrderList:493`、`…0410:2374` |
| 资源分配（选床 / 选人 / 排序） | 上述方法后半段、`sortMassagist:926`、`findAvailableBedId:2114` |
| 落库 + 排班顺延 | `saveBatch` + `extendShifts` |
| 状态流转 | `doingService:1205`、`finish:1175`、`refundOrder:1328`、`rearrangementBed:1345` |
| 展示装配 | `buildBedName:1000`、`buildMassagist:1039`、`buildOrder:1072`…（7 个 `build*`） |
| 排期视图 | `schedulingMap:1427`、`timeList:1108` |

四个可直接量化的问题：

1. **同一段校验复制 4 份**：`checkAndBuildOrderList` / `pcNoCheckAndBuildOrderList` / `pcNoCheckAndBuildOrderList0410` / `buildReceptionDetailList` 是同一逻辑的 4 个漂移版本——第 2 份名字叫 NoCheck 实际校验床位，第 3 份把床位校验丢了，第 4 份连产能都换了算法。**B1 在路径 6 失效就是复制的结果**。
2. **两套容量算法并存**：`freeCount`（整段最低空闲）vs 15 分钟切片循环（`2474-2511`）。→ G3
3. **校验与写库同一事务、锁在事务内**：`synchronized` 包裹 `saveBatch`，事务提交在方法返回之后，锁已释放 → 即便单实例也存在"读旧数据"窗口。→ C1 / G1
4. **改单路径没有统一入口**：`createDetail`（创建）、`createDetail0410`（PC 改单）、`updateDetail`（拖拽）三条路各写一套改期语义，导致 B1/M1 在路径 6/7 各自失效。

结论：不是"代码丑"，而是 **规则没有单一实现**，所以每加一条路径就丢一条规则。重构目标就一个：**校验只写一次，所有路径只能调用它**。

---

## 2 目标架构

新包 `com.macro.mall.booking`，`OrderDetailService` 退化为薄委托层（保留方法签名，内部转调），分 6 批下线：

```
booking/
├─ command/  BookingCommandService      ← 唯一写入入口（下单 / 改单 / 接待）
│              ├ create(BookingCommand)
│              └ reschedule(BookingCommand)   // 带 excludeDetailIds
├─ conflict/ BookingGuard               ← 唯一校验入口，按序执行规则，首错即抛
│              ├ ResourceSnapshot       // 一次加载当天明细 + 排班 + 床位池
│              └ rules: DateRule, ShopRule, ShiftRule, BedRule,
│                       TherapistRule, CapacityRule, BlockRule
├─ plan/     BookingPlanner             ← 校验通过后分配床/人/排序，产出明细草稿（不落库）
├─ query/    AvailabilityQueryService   ← arriveTimeList / schedulingMap 只读视图
└─ vo/       OrderDetailAssembler       ← 7 个 build* 合并
```

依赖方向：`command → conflict + plan`，`query`、`vo` 只被 controller 调用。**`conflict` 不依赖 `plan`**，规则可单测。

### 统一校验入口

```java
// BookingCommand: shopId, projectId, start, duration, persons,
//                 therapistIds(可空=不指定), bedIds(可空), excludeDetailIds(改单排除自身)
// ignoreRules: 仅用于"覆盖"场景白名单，必须记录审计
BookingGuard.check(BookingCommand cmd, Channel channel, Set<Rule> ignoreRules);
```

规则执行顺序即文案优先级（首条命中的文案返回给用户，避免一次报 3 个错）：

| 序 | 规则 | 覆盖不变量 | 说明 |
|---|---|---|---|
| 1 | `DateRule` | P2 | 仅 `channel = MINI` 生效 |
| 2 | `ShopRule` | — | 门店可用 / 项目类型存在 |
| 3 | `ShiftRule` | M2 M3 M4 | 排班即请假裁剪后的结果，不单独判请假（D7 唯一入口） |
| 4 | `BedRule` | B1 B2 B3 | D1+D2；`excludeDetailIds` 排除被改明细自身 |
| 5 | `TherapistRule` | M1 M6 | gap=0；同单人员去重 |
| 6 | `CapacityRule` | M5 | 统一 15 分钟切片（D8），全量 + 项目两口径 |
| 7 | `BlockRule` | S1 | 仅 `channel = MINI` |

`ResourceSnapshot` 内 `load(shopId, date)` 只查一次：当天明细 + 全量排班 + 项目排班 + 床位池，供 4/5/6 共用，顺带消掉现有 4 份重复查询。

---

## 3 方法迁移映射

| 现有 | 迁移到 | 处理方式 |
|---|---|---|
| `createDetail:100` | `BookingCommandService.create` | 按 `isManage` 决定 `Channel`，不再选两套实现 |
| `checkAndBuildOrderList:189` | `BookingGuard.check` + `BookingPlanner.plan` | 拆分校验与分配 |
| `pcNoCheckAndBuildOrderList:493` | 同上 | **删除**（与 189 仅差 BlockRule） |
| `createDetail0410:2302` + `…0410:2374` | `BookingCommandService.reschedule` | `excludeDetailIds` + `ignoreRules=∅`（默认硬校验，见 Q1） |
| `buildReceptionDetailList:1806` | `BookingPlanner.planReception` | 接待不占床，用同一 Guard 的 M5 |
| `findArriveTimeList` 系列 9 个入口（`OrderService:1267/1271/1279/3739/3744/4469/4589` + 2 个私有重载） | `AvailabilityQueryService.arriveTimes(query)` | 参数化差异（是否含整理期、是否含已选人），一套实现 |
| `buildBedName` / `buildMassagist` / `buildOrder` / `buildCustomer` / `buildCoefficient` / `buildOrderType` / `buildProjectTitle` | `OrderDetailAssembler` | 纯函数，可单测 |
| `updateDetail:1581` | `BookingCommandService.reschedule` + 显式 `ExchangePolicy` | 交换语义显式化；`1614` 恢复床位校验 |
| `refundOrder:1328` / `rearrangementBed:1345` | `DetailLifecycle.release` + `BookingPlanner` | 重排复用，避免第五条实现 |
| `sortMassagist:926` / `updateMassagistSort:971` / `recoverSortId:985` | `MassagistSortService` | 独立，与校验无关 |
| `doingService` / `finish` / `finishScheduled` | `DetailLifecycle` | 只做状态机 |

---

## 4 分批迁移（每批可单独上线 / 回滚）

| 批 | 内容 | 验收 |
|---|---|---|
| 0 | 落 `booking-invariants-checklist.md`；把 `BookingAvailability` 补成完整纯函数集（`bedsAvailable`、`capacityAt`、`planSlices`） | 单测覆盖清单第 5 节 9 条用例 |
| 1 | 引入 `BookingGuard` + `ResourceSnapshot`，**只接路径 7（拖拽）**，开关 `booking.conflict.strict-drag` | 撞档期由"自动交换"改为"先校验后交换"，关闭开关回到旧行为 |
| 2 | 路径 6（`pcUpdateOrder`）切 Guard，开关 `booking.conflict.strict-pc-edit` | 后台改单命中 B1 时拒绝并提示冲突明细 |
| 3 | 4 套 build 合并到 `plan`，golden test：同输入下新旧产出逐字段比对 | 逐字段相等，允许字段顺序差异 |
| 4 | 9 个 `arriveTimeList` 入口归一（当前 6 套变体），黄金时间轴比对（含调店、跨零点） | 输出时间点集合完全一致 |
| 5 | `OrderDetailService` 剩下 `build*` 拆到 assembler，接口 DTO 不变 | 前端无感 |
| 6 | 分布式锁替换 `synchronized`（锁包在事务外，key = `booking:{shopId}:{date}`） | 并发压测：同床同时段 2 请求仅 1 成功 |

每批都满足：**不修改 HTTP 接口出入参、不修改用户可见文案**（文案在规则里集中，改造前后 diff 为 0）。

---

## 5 与清单的对应

| 清单 ID | 落点 |
|---|---|
| B1 B2 B3 | `conflict/rules/BedRule` + `ResourceSnapshot` |
| M1 M6 | `conflict/rules/TherapistRule` |
| M2 M3 M4 | `conflict/rules/ShiftRule`（请假由排班裁剪体现） |
| M5 | `conflict/rules/CapacityRule`（唯一 15 分钟切片实现） |
| S1 / P2 | `channels` 判定 + `BlockRule` / `DateRule` |
| C1 / G1 | `BookingCommandService` 事务边界外加锁 |
| G4 | `MassagistLeaveService` 审批前调 `BookingGuard.check` 反向扫描 |
| G6 | 迁 0 批时一并核实索引 |

---

## 6 明确不做

- 不改表结构（仅补索引）、不改前端契约、不改文案。
- 不一次性重写：`OrderDetailService` 保留为 façade，方法体逐个下沉，任何一批都可独立回滚。
- 不在本设计里解决 P4 / Q1–Q6 的业务空白，等产品确认后按同一套 `Rule` 追加。
