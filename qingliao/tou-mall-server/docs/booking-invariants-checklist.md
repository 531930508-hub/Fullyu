# 预约冲突校验清单（Booking Conflict Checklist）

适用：`mall-admin` 中所有写入 / 修改 `oms_order_detail` 的路径。
用法：
1. 动手改校验前，先读「0 口径」，口径只有一个来源，不允许各路径自定义。
2. 新增任何写入路径，必须在「2 路径矩阵」登记，否则视为漏校验。
3. 判定某条规则落在哪，查「1 不变量」的"现状/锚点"列。

图例：✅ 已实现 | ⚠️ 部分实现或口径不一致 | ❌ 缺失 | ❓ 待产品确认

---

## 0 判定口径（全局唯一）

| 编号 | 口径 | 定义 | 唯一来源 |
|---|---|---|---|
| D1 | 时间区间 | 半开 `[start, end)`；冲突 ⇔ `s1 < e2 && s2 < e1`；上一单结束 == 下一单开始 **不算冲突** | `BookingAvailability.overlaps` |
| D2 | 床位整理期 | 床位占用区间 `[start, end + 15min)`；疗愈师 `0` 分钟 | `BED_TURNOVER_MINUTES` |
| D3 | 无效占用剔除 | `state∈{2 已完成, 3 已取消}` 且 `start > now` 不占资源；**其余一律占用**（含 0 未到店、1 已到店、以及已过去的时段） | `withoutFinishedFuture` |
| D4 | 门店归属 | 明细按 `d.shopId` 归属；排班按调店后门店 `effectiveShopId`（`targetShopId>0` 优先） | `BookingAvailability.effectiveShopId` |
| D5 | 资源池 | 床位 = `(shopId, type = project.type, status = 生效)`；疗愈师 = 当天在**该门店**且**具备该项目技能**的排班 | `listByStatusAndTypeAndShopId` / `findListByProjectIdAndShopId` |
| D6 | 跨天 | `end` 落到次日按次日时刻比较；排班 `end <= start` 视为跨夜到次日 | `scheduledIds` / `shiftToExtend` |
| D7 | 数据入口 | 只允许 `findSimpleListByStartDateAndShop`、`findListByProjectIdAndShopId`、`BookingAvailability`；不得再内联写重叠判断 | — |
| D8 | 容量粒度 | 按 **15 分钟切片**逐片判定，不用"整段最低空闲"两套算法并存 | 见 G3 |

---

## 1 不变量

| ID | 主语 | 不变量（判定式） | 冲突文案 | 现状 | 锚点 |
|---|---|---|---|---|---|
| B1 | 床位 | 同一 `shopId + bedId` 的占用明细，按 D1 + D2 互不重叠 | 抱歉，没有可用的床位 | ⚠️ | 下单 ✅ `OrderDetailService:249-266`；PC 改单 ❌ `createDetail0410:2374`（无床位校验）；拖拽 ❌ `updateDetail:1614`（校验被注释） |
| B2 | 床位 | `bed.shopId = shopId` 且 `bed.type = project.type` 且 `bed.status = 生效` | 床位已经被关闭了 / 项目类型有误 | ⚠️ | 关闭态只在拖拽校验 `updateDetail:1586-1589`；换床跨类型时项目被"顺手改"（`1617-1648`），未校验新床与项目类型 |
| B3 | 床位 | 改时长 / 换床后必须重新满足 B1 | — | ❌ | `updateDetail` bedId 分支直接改库；`rearrangementBed:1345` 自动重排无兜底 |
| M1 | 疗愈师 | 同一 `massagistId` 的占用明细，按 D1（gap=0）互不重叠 | 所选疗愈师在该时段已有预约，请选择其他时段 | ⚠️ | 下单 ✅ `310-321`；拖拽撞档期时**交换两人档期**而非拒绝 `1684-1712` |
| M2 | 疗愈师 | 当天在预约门店有排班，且 `start ∈ [班次start, 班次end)` | 所选疗愈师在当前门店没有该时段排班… | ✅ | `211-217`、`310-316` |
| M3 | 疗愈师 | 排班含该项目技能 | 抱歉，没有疗愈师排班数据 | ✅ | `findListByProjectIdAndShopId(projectId)` |
| M4 | 疗愈师 | 休息（请假）时段不可被约 | — | ⚠️ | 请假通过 = 裁剪排班（`MassagistLeaveService:211-250`），**已存在的明细不回查** |
| M5 | 人数 | 任一 15 分钟切片：`personCount + 该切片占用 ≤ 在班人数`，全部口径与项目口径各判一次 | 抱歉，疗愈师不满足人数要求 | ⚠️ | 下单用 `freeCount`（`306-309`，整段最低空闲）；改单用切片循环（`2474-2511`）；两套算法 |
| M6 | 疗愈师 | 同一单内多人不得指向同一疗愈师 | — | ❓ | 未定义、未校验 |
| S1 | 客户 | 客户已「暂别」的疗愈师不可被指定 | 该疗愈师暂不可预约，请选择其他疗愈师 | ✅ | 客用端硬校验 `OrderService:2606`；其它路径仅软排除 `368/789/2560` |
| C1 | 并发 | 同门店同时段并发写只有一个成功 | — | ❌ | JVM `synchronized`（`createDetail:102`、`buildOrder:180`、`updateDetail:1596`）多实例无效；且锁在 `@Transactional` 方法体内，**释放早于事务提交** |
| P1 | 状态 | `state=2 已完成` 的明细不得改期 / 换人 | — | ⚠️ | 仅有零散 `state != 2` 判断（`1624`），无统一入口 |
| P2 | 日期 | 客用端只能约"今天及以后" | 只能约今天及以后的日期 | ✅ | `OrderService.buildOrder:182-192`（仅 `!isManage`） |
| P3 | 订单 | 取消 / 退款后时段立即释放（按 D3） | — | ✅ | `withoutFinishedFuture` |
| P4 | 客户 | 同一客户同一时段不得重复下单 | — | ❓ | 未定义（现存只有疗愈师维度提示） |

---

## 2 路径矩阵

| # | 路径 | 入口 | 校验函数 | 床位 | 疗愈师 | 容量 | 缺口 |
|---|---|---|---|---|---|---|---|
| 1 | 客用端下单 | `OrderController:117` → `fullyMiniCreateOrder` | `buildOrder:180` → `createDetail:100(!isManage)` → `checkAndBuildOrderList:189` | ✅ | ✅ | ✅ | C1 |
| 2 | 客用端改单 | `OrderController:184` → `updateOrder` | 同上 | ✅ | ✅ | ✅ | C1 |
| 3 | 后台预约 | `OrderController:131` → `appointmentOrder` | `buildOrder(true)` → `createDetail(true)` → `pcNoCheckAndBuildOrderList:493` | ✅ | ✅ | ✅ | 与 1 重复实现 |
| 4 | 电话 / AI 预约 | `OrderService:3139`、`BotChatRecordService:264` | `buildOrder(false)` | ✅ | ✅ | ✅ | C1 |
| 5 | 接待单 | `OrderController:138` → `appointmentReceptionOrder` | `createReceptionDetail:1790` → `buildReceptionDetailList:1806` | 不占床 | ✅ | ⚠️ 另套算法 | 第四套实现 |
| 6 | PC 改单（改期 / 改人） | `OrderController:194/204` → `pcUpdateOrder` | `createDetail0410:2302` → `pcNoCheckAndBuildOrderList0410:2374` | ❌ | ⚠️ 仅容量 | ⚠️ | `OrderService:1027-1031` 注释掉床位校验 |
| 7 | 拖拽排单 | `OrderDetailController:79` → `updateDetail:1581` | `updateDetail` | ❌ | ⚠️ 交换 | ❌ | `1614` 注释；冲突即交换档期；`1660-1669` 静默换床 |
| 8 | 取消 / 退款 / 重新排床 | `refundOrder:1328` → `rearrangementBed:1345` | 重排 | ⚠️ | ⚠️ | — | 无回滚保护 |
| 9 | 请假审批通过 | `MassagistLeaveService:211` | 裁剪排班 | — | ❌ 不回查 | ❌ | 产生"无排班孤儿订单" |
| 10 | 到店 / 完成 | `doingService:1205`、`finish:1175` | 仅状态 | — | ✅ 释放未来 | — | — |

---

## 3 待修缺口（优先级从高到低）

| ID | 缺口 | 影响 | 建议 |
|---|---|---|---|
| G1 | C1 锁不是分布式，且释放早于事务提交 | 并发下真实产生重复预约（唯一能绕开所有校验的缝隙） | 按 `shopId + 日期` 加 Redis 锁，锁包在事务外 |
| G2 | 路径 6 / 7 无床位校验 | 后台可把两张单人床压成一张 → 业务方看到的"重复预约" | 统一走 `BookingGuard`，见 `orderdetail-service-redesign.md` |
| G3 | M5 两套容量算法（整段最低空闲 vs 15 分钟切片） | 同一时段两种结论 | 统一为 D8 切片口径，删除 `freeCount` 旧用法或反之 |
| G4 | M4 请假不回查已有明细 | 客户到店无疗愈师 | 审批通过前扫当天明细，命中即要求改约 |
| G5 | M6 / P4 规则未定义 | 语义空白 | 产品确认后入表 |
| G6 | 索引 | `findSimpleListByStartDateAndShop` 按 `(shop_id, 日期)` 扫；现只有 `idx_duration_page(state,end_time,shop_id,massagist_id)` | 核实并补 `(shop_id, start_time)`、`(bed_id, start_time)` |

---

## 4 待确认（需产品 / 业务拍板）

| # | 问题 | 现状默认 |
|---|---|---|
| Q1 | 后台改单 / 拖拽撞档期：**硬拦截**还是允许"覆盖 + 二次确认 + 审计"？ | 拖拽=自动交换；改单=静默覆盖 |
| Q2 | 拖拽撞档期时"自动交换两人档期"是否为预期？ | 是（代码即此行为） |
| Q3 | 15 分钟床位整理期是否也约束后台拖拽？（`BookingAvailability` 类注释说"手动排单不使用床位间隔"） | 后台不校验 |
| Q4 | 同一单多人能否指定同一疗愈师？ | 未校验 |
| Q5 | 同一客户同一时段能否下两单（不同疗愈师）？ | 未校验 |
| Q6 | `state=2 已完成` 但时间还没到，是否仍占位？（D3 当前释放） | 释放 |

---

## 5 回归用例（改校验必须跑）

| 用例 | 预期 |
|---|---|
| 床位 [10:00-11:00]，再约 [11:00-12:00] 同床 | 允许（D1 边界） |
| 床位 [10:00-11:00]，再约 [11:10-12:00] 同床 | 拒绝（D2 整理期） |
| 同疗愈师 [10:00-11:00] + [11:00-12:00] | 允许（gap=0） |
| 已取消单占据 [14:00-15:00]（未来），再约该时段 | 允许（D3） |
| 调店排班（`targetShopId`）在 A 店下单 | 拒绝；提示说明当天在 B 店（M2） |
| 3 人单、在班 5 人、该时段已占 3 人 | 拒绝（M5） |
| 跨零点 [23:00-01:00] | 按 D6 比较，不越界 |
| 后台拖拽把 B 床拖到已占用的 A 床 | 拒绝并提示冲突明细（修复后行为） |
| 并发 2 个请求同床同时段 | 仅 1 个成功（G1 修复后） |
