# 疗愈师内训考核（三人认证）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让内训师在手机 H5 上按“疗愈师 + 部位 + 考核日期 + 通过/不通过”提交考核，三名不同内训师通过后自动认证，并把考核记录、认证结果、看板和导出接入现有培训奖励体系。

**Architecture:** 新增只追加的考核流水表 `s_massagist_training_assessment`，现有认证表 `s_massagist_training_cert` 继续作为奖励计算读取的投影。提交时对目标疗愈师行加锁，按“每位内训师最新一次提交”计票，三人通过即写入认证；奖励计算 `TrainingCalculator` 不改。管理端在现有“培训考核”页扩展为认证矩阵、考核记录、考核分析三个页签；内训师使用独立隐藏路由 `/trainer-assess`。

**Tech Stack:** Java 8、Spring Boot、MyBatis-Plus、MySQL 5.7/8.0、Vue 2、Element UI、Vuex、Node `node:test`。

---

## 实施边界（先读）

- 只改测试环境，生产不部署、不执行 SQL、不打开开关。
- 功能开关 `incentive.team-cert-enabled` 默认 `false`；测试服务器通过环境变量 `INCENTIVE_TEAM_CERT_ENABLED=true` 打开。开关关闭时，原有“手工登记/删除认证”接口保持旧行为。
- 不改 `TrainingCalculator` 的 `passedAt + 1` 起算、目标单数、金额逻辑。认证来源只影响展示和审计。
- 不新增 UMS 角色。内训师身份落在 `s_massagist.is_trainer`，店长身份继续从 `f_approval_shop_manager` 推导。
- 不实现扫码、动态码、顾客端入口、内训师自评。
- 工作区 `/Users/th/Desktop/Full愈-轻疗` 不是 git 仓库；父目录 `/Users/th/Desktop/Full愈` 才是。未获得用户明确授权前不执行 `git commit`。每个阶段以“编译 + 定向测试 + 可回滚”作为检查点。
- 绝不运行 `OssServiceImplTest`（项目已知约束）。
- `GlobalExceptionHandler` 目前把 `BusinessException` 统一包成 HTTP 200 + `code=500`，不会返回真实 403。接口测试断言业务文案，不臆造 HTTP 403；真正的 403 语义不在本计划范围。

---

## 文件结构

### 后端（`tou-mall-server`）

| 文件 | 责任 |
|---|---|
| `sql/2026-11-09-training-team-cert.sql` | 仅测试库迁移：身份字段、认证来源字段、考核流水表 |
| `mall-admin/.../incentive/entity/MassagistTrainingAssessment.java` | 考核流水实体 |
| `mall-admin/.../incentive/mapper/MassagistTrainingAssessmentMapper.java` | 流水增查、目标行锁、重复提交检查 |
| `mall-admin/.../incentive/mapper/TrainingAssessmentQueryMapper.java` | 记录分页、分析取数、导出取数 |
| `mall-admin/.../incentive/calc/TrainingCertificationPolicy.java` | 纯计票规则 |
| `mall-admin/.../incentive/calc/TrainingAnalyticsCalculator.java` | 纯看板指标计算 |
| `mall-admin/.../incentive/service/TrainingTeamCertProperties.java` | 开关、补记窗口、防重窗口 |
| `mall-admin/.../incentive/service/TrainingCertificationService.java` | 认证写入、撤销、人工特批 |
| `mall-admin/.../incentive/service/TrainingAssessmentService.java` | 提交校验、行锁、自动认证、作废 |
| `mall-admin/.../incentive/service/TrainingAssessmentQueryService.java` | 记录、分析、详情、导出 |
| `mall-admin/.../incentive/controller/TrainerAssessmentController.java` | 内训师 H5 接口 |
| `mall-admin/.../incentive/controller/IncentiveController.java` | 管理端新增接口与旧接口兼容 |
| `mall-admin/.../incentive/service/IncentiveAccessService.java` | 管理/内训师/超管权限 |
| `mall-admin/.../entity/Massagist.java` | `isTrainer`、`trainerSince`、瞬态身份字段 |
| `mall-admin/.../incentive/entity/MassagistTrainingCert.java` | `source`、`certifiedAt`、`teamSize` |
| `mall-admin/.../incentive/dto/TrainingRecordView.java` | 矩阵考核次数与认证来源 |
| `mall-admin/.../incentive/service/IncentiveDataService.java` | 矩阵聚合、旧接口开关分流 |
| `mall-admin/.../controller/UmsAdminController.java` | `/admin/info` 返回 `trainer`、`shopManager` |
| `mall-admin/.../service/MassagistService.java` | 身份保存、列表身份筛选、账号就绪标记 |
| `mall-admin/.../service/ApprovalShopManagerService.java` | 批量查询店长身份 |

### 前端（`tou-mall-admin-web`）

| 文件 | 责任 |
|---|---|
| `src/api/incentive.js` | 内训师与管理端新接口 |
| `src/router/index.js` | 隐藏路由 `/trainer-assess` |
| `src/store/modules/user.js`、`src/store/getters.js` | `trainer` 状态 |
| `src/views/layout/components/Navbar.vue` | 内训师入口 |
| `src/views/incentive/trainer/index.vue` | 手机 H5 考核页 |
| `src/views/incentive/training/index.vue` | 三页签外壳 |
| `src/views/incentive/training/components/AssessmentDrawer.vue` | 认证矩阵详情抽屉、作废/撤销 |
| `src/views/incentive/training/components/AssessmentRecords.vue` | 考核记录页签 |
| `src/views/incentive/training/components/AssessmentAnalytics.vue` | 考核分析页签 |
| `src/views/incentive/training/components/ManualCertDialog.vue` | 超管人工特批 |
| `src/views/massagist/management/index.vue` | 身份列、筛选、账号提示 |
| `src/views/massagist/management/MassagistForm.vue` | 内训师开关 |

---

## 阶段 1：数据模型与服务端基础（任务 1–6）

### Task 1: 测试库迁移与实体字段

**Files:**
- Create: `tou-mall-server/sql/2026-11-09-training-team-cert.sql`
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/entity/Massagist.java`
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/entity/MassagistTrainingCert.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/TrainingSchemaContractTest.java`

- [ ] **Step 1: 写迁移脚本（每段都做数据库名与列存在性双重保护）**

`sql/2026-11-09-training-team-cert.sql`：

```sql
-- Full愈 疗愈师内训三人考核。仅测试库执行；生产未授权。
-- 不使用 mysql --force。每段先校验 DATABASE()，重复执行不会报“列已存在”。
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist' AND COLUMN_NAME='is_trainer');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `s_massagist` ADD COLUMN `is_trainer` TINYINT NOT NULL DEFAULT 0 COMMENT ''是否内训师：1是 0否''',
    'SELECT ''s_massagist.is_trainer exists'''),
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist' AND COLUMN_NAME='trainer_since');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `s_massagist` ADD COLUMN `trainer_since` DATE NULL COMMENT ''成为内训师的日期''',
    'SELECT ''s_massagist.trainer_since exists'''),
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist_training_cert' AND COLUMN_NAME='source');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `s_massagist_training_cert` ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT ''LEGACY'' COMMENT ''LEGACY/TEAM/MANUAL''',
    'SELECT ''s_massagist_training_cert.source exists'''),
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist_training_cert' AND COLUMN_NAME='certified_at');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `s_massagist_training_cert` ADD COLUMN `certified_at` DATETIME NULL COMMENT ''认证写入时间''',
    'SELECT ''s_massagist_training_cert.certified_at exists'''),
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist_training_cert' AND COLUMN_NAME='team_size');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `s_massagist_training_cert` ADD COLUMN `team_size` TINYINT NOT NULL DEFAULT 0 COMMENT ''认证团队人数；历史/人工为0''',
    'SELECT ''s_massagist_training_cert.team_size exists'''),
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF(DATABASE()='tou_mall_test',
  'CREATE TABLE IF NOT EXISTS `s_massagist_training_assessment` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `massagist_id` BIGINT NOT NULL COMMENT ''被考核疗愈师'',
    `shop_id` BIGINT NULL COMMENT ''被考核疗愈师所属门店（提交时快照）'',
    `project_key` VARCHAR(64) NOT NULL,
    `project_name` VARCHAR(128) NOT NULL,
    `assess_date` DATE NOT NULL COMMENT ''考核日期'',
    `result` TINYINT NOT NULL COMMENT ''1通过 0不通过'',
    `trainer_massagist_id` BIGINT NOT NULL,
    `trainer_name` VARCHAR(64) NOT NULL,
    `trainer_shop_id` BIGINT NULL,
    `trainer_admin_id` BIGINT NULL,
    `remark` VARCHAR(500) NULL,
    `submitted_at` DATETIME NOT NULL,
    `voided` TINYINT NOT NULL DEFAULT 0,
    `voided_by` BIGINT NULL,
    `voided_at` DATETIME NULL,
    `void_reason` VARCHAR(500) NULL,
    `create_time` DATETIME NULL,
    PRIMARY KEY (`id`),
    KEY `idx_assess_target` (`massagist_id`,`project_key`,`assess_date`),
    KEY `idx_assess_trainer` (`trainer_massagist_id`,`assess_date`),
    KEY `idx_assess_shop` (`shop_id`,`assess_date`),
    KEY `idx_assess_result` (`result`,`assess_date`),
    KEY `idx_assess_submitted` (`submitted_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT=''内训师考核流水''',
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 历史认证补齐展示字段；不改变 passed_at，不影响奖励。
SET @ddl := IF(DATABASE()='tou_mall_test',
  'UPDATE `s_massagist_training_cert` SET `certified_at`=`passed_at` WHERE `certified_at` IS NULL',
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```

- [ ] **Step 2: 加实体字段**

`Massagist.java` 增加：

```java
@ApiModelProperty("是否内训师：1是 0否")
private Integer isTrainer;

@ApiModelProperty("成为内训师的日期")
private LocalDate trainerSince;

@TableField(exist = false)
@ApiModelProperty("是否本店店长（列表派生，不落库）")
private Boolean shopManager = false;

@TableField(exist = false)
@ApiModelProperty("后台账号是否可登录（列表派生，不落库）")
private Boolean trainerAccountReady = false;
```

`MassagistTrainingCert.java` 增加：

```java
@ApiModelProperty("认证来源：LEGACY历史/TEAM三人认证/MANUAL人工特批")
private String source;

@ApiModelProperty("认证写入时间")
private LocalDateTime certifiedAt;

@ApiModelProperty("认证团队人数；历史与人工为0")
private Integer teamSize;
```

- [ ] **Step 3: 写 schema 契约测试**

`TrainingSchemaContractTest.java` 读取 SQL 文本并断言：

```java
package com.macro.mall.incentive;

import org.junit.jupiter.api.Test;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;

class TrainingSchemaContractTest {
    private String sql() throws Exception {
        return new String(Files.readAllBytes(Paths.get(
                "..", "sql", "2026-11-09-training-team-cert.sql")), "UTF-8");
    }

    @Test void migrationIsTestDatabaseOnly() throws Exception {
        String sql = sql();
        assertTrue(sql.contains("DATABASE()='tou_mall_test'"));
        assertTrue(sql.contains("fullyu_training_team_migration_requires_tou_mall_test"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_current"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_demo"));
    }

    @Test void assessmentTableKeepsAuditAndVoteColumns() throws Exception {
        String sql = sql();
        assertTrue(sql.contains("`trainer_massagist_id`"));
        assertTrue(sql.contains("`submitted_at`"));
        assertTrue(sql.contains("`voided`"));
        assertTrue(sql.contains("`idx_assess_target`"));
        assertTrue(sql.contains("`certified_at`"));
        assertTrue(sql.contains("`team_size`"));
    }
}
```

- [ ] **Step 4: 编译并跑契约测试**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-server
mvn -pl mall-admin -am -DskipTests compile
mvn -pl mall-admin -am -Dtest=TrainingSchemaContractTest -DfailIfNoTests=false test
```

Expected: `BUILD SUCCESS`；测试 2 个通过。

- [ ] **Step 5: 暂不执行 SQL**

SQL 在任务 2 的契约测试和任务 18 的验收前，只对 `tou_mall_test` 执行。执行前先确认：

```bash
mysql -h <test-host> -u <user> -p -e "SELECT DATABASE(); SHOW DATABASES LIKE 'tou_mall_%';"
```

Expected: 当前库为 `tou_mall_test` 才继续；否则停止。

---

### Task 2: 考核流水实体、Mapper 与计票取数

**Files:**
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/entity/MassagistTrainingAssessment.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/mapper/MassagistTrainingAssessmentMapper.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/TrainingAssessmentMapperTest.java`

- [ ] **Step 1: 实体**

```java
package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@TableName("s_massagist_training_assessment")
public class MassagistTrainingAssessment {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long massagistId;
    private Long shopId;
    private String projectKey;
    private String projectName;
    private LocalDate assessDate;
    private Integer result;
    private Long trainerMassagistId;
    private String trainerName;
    private Long trainerShopId;
    private Long trainerAdminId;
    private String remark;
    private LocalDateTime submittedAt;
    private Integer voided;
    private Long voidedBy;
    private LocalDateTime voidedAt;
    private String voidReason;
    private LocalDateTime createTime;
}
```

- [ ] **Step 2: Mapper**

```java
package com.macro.mall.incentive.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.macro.mall.incentive.entity.MassagistTrainingAssessment;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

public interface MassagistTrainingAssessmentMapper extends BaseMapper<MassagistTrainingAssessment> {

    @Select("SELECT * FROM s_massagist_training_assessment "
            + "WHERE massagist_id=#{massagistId} AND project_key=#{projectKey} AND voided=0 "
            + "ORDER BY submitted_at DESC, id DESC")
    List<MassagistTrainingAssessment> latestVotes(@Param("massagistId") Long massagistId,
                                                  @Param("projectKey") String projectKey);

    @Select("SELECT id FROM s_massagist WHERE id=#{id} FOR UPDATE")
    Long lockMassagist(@Param("id") Long id);

    @Select("SELECT COUNT(*) FROM s_massagist_training_assessment "
            + "WHERE trainer_massagist_id=#{trainerId} AND massagist_id=#{massagistId} "
            + "AND project_key=#{projectKey} AND voided=0 AND submitted_at>=#{since}")
    int countRecent(@Param("trainerId") Long trainerId,
                    @Param("massagistId") Long massagistId,
                    @Param("projectKey") String projectKey,
                    @Param("since") LocalDateTime since);
}
```

- [ ] **Step 3: 写 SQL 契约测试**

用现有 `TrainingRecordPageTest` 的 MyBatis `Configuration` + `BoundSql` 方式，断言：

```java
@Test void latestVotesReadsNonVoidedAndStableOrder() throws Exception {
    Method method = MassagistTrainingAssessmentMapper.class
            .getMethod("latestVotes", Long.class, String.class);
    BoundSql sql = boundSql(method, 7L, "sujin_head");
    assertEquals("SELECT * FROM s_massagist_training_assessment "
            + "WHERE massagist_id=? AND project_key=? AND voided=0 "
            + "ORDER BY submitted_at DESC, id DESC", sql.getSql().replaceAll("\\s+", " ").trim());
}

@Test void lockUsesForUpdate() throws Exception {
    Method method = MassagistTrainingAssessmentMapper.class.getMethod("lockMassagist", Long.class);
    assertTrue(boundSql(method, 7L).getSql().contains("FOR UPDATE"));
}
```

（`boundSql` 辅助方法照抄 `TrainingRecordPageTest` 中的 `Configuration` 构造方式；`@Select` 注解解析用 `configuration.addMapper`。）

- [ ] **Step 4: 跑测试**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-server
mvn -pl mall-admin -am -Dtest=TrainingAssessmentMapperTest -DfailIfNoTests=false test
```

Expected: 2 个测试通过。

---

### Task 3: 权限扩展（管理 / 内训师 / 超管）

**Files:**
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/service/IncentiveAccessService.java`
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/service/ApprovalShopManagerService.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/service/TrainingTeamCertProperties.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/TrainingAccessTest.java`

- [ ] **Step 1: 配置属性类**

```java
package com.macro.mall.incentive.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class TrainingTeamCertProperties {
    @Value("${incentive.team-cert-enabled:false}")
    private boolean enabled;
    @Value("${incentive.team-cert-backfill-days:30}")
    private int backfillDays;
    @Value("${incentive.team-cert-duplicate-minutes:10}")
    private int duplicateMinutes;

    public boolean enabled() { return enabled; }
    public int backfillDays() { return backfillDays; }
    public int duplicateMinutes() { return duplicateMinutes; }
}
```

在 `application.yml` 增加（显式默认关闭）：

```yaml
incentive:
  team-cert-enabled: false
  team-cert-backfill-days: 30
  team-cert-duplicate-minutes: 10
```

- [ ] **Step 2: `IncentiveAccessService` 增加身份方法**

```java
@Autowired
@Lazy
private ApprovalShopManagerService approvalShopManagerService;

@Autowired
@Lazy
private TrainingTeamCertProperties teamCertProperties;

public boolean isSuperAdmin() {
    UmsAdmin admin = currentAdmin();
    if (Long.valueOf(1L).equals(admin.getId())) return true;
    List<UmsRole> roles = adminService.getRoleList(admin.getId());
    if (CollectionUtils.isEmpty(roles)) return false;
    for (UmsRole role : roles) {
        if (role.getName() != null && "超级管理员".equals(role.getName().trim())) return true;
    }
    return false;
}

public boolean isShopManager() {
    Long massagistId = currentMassagistIdOrNull();
    return massagistId != null && approvalShopManagerService.findByMassagistId(massagistId) != null;
}

public Long currentMassagistIdOrNull() {
    UmsAdmin admin = currentAdmin();
    if (admin.getMassagistId() != null) return admin.getMassagistId();
    Massagist massagist = massagistService.getOne(new LambdaQueryWrapper<Massagist>()
            .eq(Massagist::getUmsAdminId, admin.getId())
            .last("LIMIT 1"), false);
    return massagist == null ? null : massagist.getId();
}

public Massagist requireTrainer() {
    if (!teamCertProperties.enabled()) {
        throw new BusinessException("内训考核功能尚未开放");
    }
    Long massagistId = currentMassagistIdOrNull();
    if (massagistId == null) {
        throw new BusinessException("当前账号未关联疗愈师档案，无法进行内训考核");
    }
    Massagist trainer = massagistService.getById(massagistId);
    if (trainer == null) {
        throw new BusinessException("疗愈师档案不存在");
    }
    if (!Integer.valueOf(1).equals(trainer.getIsTrainer())) {
        throw new BusinessException("当前账号不是内训师，无法进行内训考核");
    }
    if (!Integer.valueOf(1).equals(trainer.getStatus())) {
        throw new BusinessException("当前内训师已不在职");
    }
    UmsAdmin admin = currentAdmin();
    if (!Integer.valueOf(1).equals(admin.getStatus())) {
        throw new BusinessException("当前后台账号不可用");
    }
    return trainer;
}

public void requireManagement() {
    if (isGlobal() || isShopManager()) return;
    if (isTrainerOnly()) {
        throw new BusinessException("当前账号仅可进行内训考核");
    }
    throw new BusinessException("仅运营/财务/店长可查看考核数据");
}

public void requireSuperAdmin() {
    if (!isSuperAdmin()) {
        throw new BusinessException("仅超级管理员可执行该操作");
    }
}

public boolean isTrainerOnly() {
    if (!teamCertProperties.enabled() || isGlobal() || isShopManager()) return false;
    Long id = currentMassagistIdOrNull();
    if (id == null) return false;
    Massagist massagist = massagistService.getById(id);
    return massagist != null && Integer.valueOf(1).equals(massagist.getIsTrainer());
}
```

导入 `com.macro.mall.service.ApprovalShopManagerService`、`org.springframework.context.annotation.Lazy`。

- [ ] **Step 3: 店长批量身份查询**

`ApprovalShopManagerService` 增加：

```java
public java.util.Set<Long> managerMassagistIds(java.util.Collection<Long> massagistIds) {
    java.util.Set<Long> result = new java.util.HashSet<>();
    if (massagistIds == null || massagistIds.isEmpty()) return result;
    for (ApprovalShopManager rule : list(new LambdaQueryWrapper<ApprovalShopManager>()
            .in(ApprovalShopManager::getMassagistId, massagistIds))) {
        result.add(rule.getMassagistId());
    }
    return result;
}
```

- [ ] **Step 4: 写权限测试**

覆盖：

```java
@Test void trainerRequiresFeatureFlag() { /* flag false -> “内训考核功能尚未开放” */ }
@Test void nonTrainerCannotSubmit() { /* isTrainer=0 -> “当前账号不是内训师” */ }
@Test void trainerOnlyGetsExplicitManagementDenial() { /* flag true, 非全局/非店长/是内训师 -> “当前账号仅可进行内训考核” */ }
@Test void shopManagerCanManageButNotSuperAdminActions() { /* isShopManager true -> requireManagement 通过；requireSuperAdmin 抛错 */ }
@Test void superAdminByRoleNameNotOnlyId() { /* 角色名“超级管理员” -> true */ }
```

用 `ReflectionTestUtils` 注入 mock 的 `UmsAdminService`、`MassagistService`、`ApprovalShopManagerService`、`TrainingTeamCertProperties`，mock `SecurityContextHolder` 的 `AdminUserDetails`（照抄 `SchedulePermissionTest` 的认证构造方式）。

- [ ] **Step 5: 跑测试**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-server
mvn -pl mall-admin -am -Dtest=TrainingAccessTest -DfailIfNoTests=false test
```

Expected: 5 个测试通过。

---

### Task 4: 纯计票规则（TDD）

**Files:**
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/calc/TrainingCertificationPolicy.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/calc/TrainingCertificationPolicyTest.java`

- [ ] **Step 1: 先写失败测试**

```java
package com.macro.mall.incentive.calc;

import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class TrainingCertificationPolicyTest {
    private final LocalDateTime base = LocalDateTime.of(2026, 11, 9, 10, 0);
    private TrainingCertificationPolicy.Vote vote(long trainer, int result, String assessDate, int minutes) {
        return new TrainingCertificationPolicy.Vote(trainer, result, LocalDate.parse(assessDate),
                base.plusMinutes(minutes), trainer * 100 + minutes);
    }

    @Test void threeDistinctPassesCertifyOnLatestAssessmentDate() {
        TrainingCertificationPolicy.Decision d = new TrainingCertificationPolicy().evaluate(Arrays.asList(
                vote(1, 1, "2026-11-01", 1),
                vote(2, 1, "2026-11-03", 2),
                vote(3, 1, "2026-11-02", 3)));
        assertTrue(d.isCertified());
        assertEquals(LocalDate.parse("2026-11-03"), d.getPassedAt());
        assertEquals(Arrays.asList(1L, 2L, 3L), d.getTrainerIds());
    }

    @Test void latestVotePerTrainerWins() {
        TrainingCertificationPolicy.Decision d = new TrainingCertificationPolicy().evaluate(Arrays.asList(
                vote(1, 1, "2026-11-01", 1),
                vote(1, 0, "2026-11-05", 9),
                vote(2, 1, "2026-11-03", 2),
                vote(3, 1, "2026-11-04", 3)));
        assertFalse(d.isCertified());
    }

    @Test void twoPassesAndOneFailDoNotCertify() {
        TrainingCertificationPolicy.Decision d = new TrainingCertificationPolicy().evaluate(Arrays.asList(
                vote(1, 1, "2026-11-01", 1),
                vote(2, 1, "2026-11-02", 2),
                vote(3, 0, "2026-11-03", 3)));
        assertFalse(d.isCertified());
        assertNull(d.getPassedAt());
    }

    @Test void backdatedCorrectionStillWinsBySubmissionOrder() {
        TrainingCertificationPolicy.Decision d = new TrainingCertificationPolicy().evaluate(Arrays.asList(
                vote(1, 1, "2026-11-09", 1),
                vote(1, 0, "2026-10-20", 5),
                vote(2, 1, "2026-11-02", 2),
                vote(3, 1, "2026-11-03", 3)));
        assertFalse(d.isCertified());
    }

    @Test void fourthPassDoesNotMovePassedAt() {
        TrainingCertificationPolicy.Decision d = new TrainingCertificationPolicy().evaluate(Arrays.asList(
                vote(1, 1, "2026-11-01", 1),
                vote(2, 1, "2026-11-02", 2),
                vote(3, 1, "2026-11-03", 3),
                vote(4, 1, "2026-11-08", 4)));
        assertTrue(d.isCertified());
        assertEquals(LocalDate.parse("2026-11-03"), d.getPassedAt());
        assertEquals(3, d.getTrainerIds().size());
    }

    @Test void fewerThanThreeVotesDoNotCertify() {
        assertFalse(new TrainingCertificationPolicy().evaluate(Collections.singletonList(
                vote(1, 1, "2026-11-01", 1))).isCertified());
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-server
mvn -pl mall-admin -am -Dtest=TrainingCertificationPolicyTest -DfailIfNoTests=false test
```

Expected: 编译失败，`TrainingCertificationPolicy` 不存在。

- [ ] **Step 3: 实现**

```java
package com.macro.mall.incentive.calc;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/** 三人认证计票：每位内训师只看最新一次提交；按提交顺序取最早三个通过票。 */
public class TrainingCertificationPolicy {
    public static final int REQUIRED_TRAINERS = 3;

    public Decision evaluate(List<Vote> votes) {
        if (votes == null || votes.isEmpty()) return Decision.rejected();
        List<Vote> ordered = new ArrayList<>(votes);
        ordered.sort(Comparator.comparing(Vote::getSubmittedAt).reversed()
                .thenComparing(Vote::getId, Comparator.nullsLast(Comparator.<Long>reverseOrder())));
        Map<Long, Vote> latestByTrainer = new LinkedHashMap<>();
        for (Vote vote : ordered) {
            if (!latestByTrainer.containsKey(vote.getTrainerId())) {
                latestByTrainer.put(vote.getTrainerId(), vote);
            }
        }
        List<Vote> passing = latestByTrainer.values().stream()
                .filter(v -> Integer.valueOf(1).equals(v.getResult()))
                .sorted(Comparator.comparing(Vote::getSubmittedAt)
                        .thenComparing(Vote::getId, Comparator.nullsLast(Comparator.<Long>naturalOrder())))
                .collect(Collectors.toList());
        if (passing.size() < REQUIRED_TRAINERS) return Decision.rejected();
        List<Vote> firstThree = passing.subList(0, REQUIRED_TRAINERS);
        LocalDate passedAt = firstThree.stream().map(Vote::getAssessDate)
                .filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null);
        if (passedAt == null) return Decision.rejected();
        return new Decision(true, passedAt,
                firstThree.stream().map(Vote::getTrainerId).collect(Collectors.toList()));
    }

    public static class Vote {
        private final Long trainerId;
        private final Integer result;
        private final LocalDate assessDate;
        private final LocalDateTime submittedAt;
        private final Long id;
        public Vote(Long trainerId, Integer result, LocalDate assessDate,
                    LocalDateTime submittedAt, Long id) {
            this.trainerId = trainerId; this.result = result; this.assessDate = assessDate;
            this.submittedAt = submittedAt; this.id = id;
        }
        public Long getTrainerId() { return trainerId; }
        public Integer getResult() { return result; }
        public LocalDate getAssessDate() { return assessDate; }
        public LocalDateTime getSubmittedAt() { return submittedAt; }
        public Long getId() { return id; }
    }

    public static class Decision {
        private final boolean certified;
        private final LocalDate passedAt;
        private final List<Long> trainerIds;
        private Decision(boolean certified, LocalDate passedAt, List<Long> trainerIds) {
            this.certified = certified; this.passedAt = passedAt; this.trainerIds = trainerIds;
        }
        static Decision rejected() { return new Decision(false, null, Collections.emptyList()); }
        public boolean isCertified() { return certified; }
        public LocalDate getPassedAt() { return passedAt; }
        public List<Long> getTrainerIds() { return trainerIds; }
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
mvn -pl mall-admin -am -Dtest=TrainingCertificationPolicyTest -DfailIfNoTests=false test
```

Expected: 6 个测试通过。

- [ ] **Step 5: 检查与既有奖励测试兼容**

```bash
mvn -pl mall-admin -am -Dtest=TrainingCalculatorTest -DfailIfNoTests=false test
```

Expected: 原有培训奖励测试全部通过，不需要修改。

---

### Task 5: 认证写入、撤销与人工特批

**Files:**
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/service/TrainingCertificationService.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/TrainingCertificationServiceTest.java`

- [ ] **Step 1: 实现服务**

```java
package com.macro.mall.incentive.service;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.incentive.calc.TrainingCertificationPolicy;
import com.macro.mall.incentive.entity.TrainingProjectConfig;
import com.macro.mall.incentive.entity.MassagistTrainingAssessment;
import com.macro.mall.incentive.entity.MassagistTrainingCert;
import com.macro.mall.incentive.entity.MassagistTrainingCertLog;
import com.macro.mall.incentive.mapper.MassagistTrainingAssessmentMapper;
import com.macro.mall.incentive.mapper.MassagistTrainingCertLogMapper;
import com.macro.mall.incentive.mapper.MassagistTrainingCertMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Service
public class TrainingCertificationService {

    @Autowired private MassagistTrainingCertMapper certMapper;
    @Autowired private MassagistTrainingCertLogMapper certLogMapper;
    @Autowired private MassagistTrainingAssessmentMapper assessmentMapper;
    @Autowired private IncentiveAccessService accessService;

    @Transactional(rollbackFor = Exception.class)
    public MassagistTrainingCert certifyTeam(Massagist target, TrainingProjectConfig project,
                                             TrainingCertificationPolicy.Decision decision,
                                             Long operatorId, String operatorName) {
        if (!decision.isCertified()) throw new BusinessException("尚未达到三人认证条件");
        MassagistTrainingCert existing = findByTargetAndProject(target.getId(), project.getProjectKey());
        if (existing != null) throw new BusinessException("该疗愈师该项目已认证");
        MassagistTrainingCert cert = new MassagistTrainingCert();
        cert.setMassagistId(target.getId());
        cert.setShopId(target.getShopId());
        cert.setProjectKey(project.getProjectKey());
        cert.setPassedAt(decision.getPassedAt());
        cert.setCertifierId(operatorId);
        cert.setCertifierName("内训师团队");
        cert.setRemark("3位内训师考核通过");
        cert.setSource("TEAM");
        cert.setCertifiedAt(LocalDateTime.now());
        cert.setTeamSize(TrainingCertificationPolicy.REQUIRED_TRAINERS);
        certMapper.insert(cert);
        writeLog(cert, "TEAM_CERTIFY", null, cert.getPassedAt(), operatorId, operatorName,
                "内训师ID：" + decision.getTrainerIds());
        return cert;
    }

    @Transactional(rollbackFor = Exception.class)
    public void revoke(Long certId, String reason) {
        accessService.requireSuperAdmin();
        String safeReason = requireReason(reason);
        MassagistTrainingCert cert = certMapper.selectById(certId);
        if (cert == null) throw new BusinessException("考核记录不存在");
        writeLog(cert, "REVOKE", cert.getPassedAt(), null,
                accessService.currentAdmin().getId(), accessService.currentOperatorName(), safeReason);
        assessmentMapper.update(null, new UpdateWrapper<MassagistTrainingAssessment>()
                .eq("massagist_id", cert.getMassagistId())
                .eq("project_key", cert.getProjectKey())
                .eq("voided", 0)
                .set("voided", 1)
                .set("voided_by", accessService.currentAdmin().getId())
                .set("voided_at", LocalDateTime.now())
                .set("void_reason", safeReason));
        certMapper.deleteById(certId);
    }

    @Transactional(rollbackFor = Exception.class)
    public MassagistTrainingCert manualCert(Massagist target, TrainingProjectConfig project,
                                            LocalDate passedAt, String reason) {
        accessService.requireSuperAdmin();
        String safeReason = requireReason(reason);
        if (passedAt == null) throw new BusinessException("通过日期不能为空");
        if (passedAt.isAfter(LocalDate.now())) throw new BusinessException("通过日期不能晚于今天");
        if (findByTargetAndProject(target.getId(), project.getProjectKey()) != null) {
            throw new BusinessException("该疗愈师该项目已认证");
        }
        MassagistTrainingCert cert = new MassagistTrainingCert();
        cert.setMassagistId(target.getId());
        cert.setShopId(target.getShopId());
        cert.setProjectKey(project.getProjectKey());
        cert.setPassedAt(passedAt);
        cert.setCertifierId(accessService.currentAdmin().getId());
        cert.setCertifierName(accessService.currentOperatorName());
        cert.setRemark(safeReason);
        cert.setSource("MANUAL");
        cert.setCertifiedAt(LocalDateTime.now());
        cert.setTeamSize(0);
        certMapper.insert(cert);
        writeLog(cert, "MANUAL_CERTIFY", null, passedAt,
                accessService.currentAdmin().getId(), accessService.currentOperatorName(), safeReason);
        return cert;
    }

    public MassagistTrainingCert findByTargetAndProject(Long massagistId, String projectKey) {
        return certMapper.selectOne(new LambdaQueryWrapper<MassagistTrainingCert>()
                .eq(MassagistTrainingCert::getMassagistId, massagistId)
                .eq(MassagistTrainingCert::getProjectKey, projectKey)
                .last("LIMIT 1"));
    }

    public void voidAssessment(Long assessmentId, String reason) {
        accessService.requireSuperAdmin();
        String safeReason = requireReason(reason);
        MassagistTrainingAssessment row = assessmentMapper.selectById(assessmentId);
        if (row == null) throw new BusinessException("考核记录不存在");
        if (Integer.valueOf(1).equals(row.getVoided())) throw new BusinessException("该记录已作废");
        if (findByTargetAndProject(row.getMassagistId(), row.getProjectKey()) != null) {
            throw new BusinessException("该项目已认证，请先撤销认证再作废单条考核");
        }
        row.setVoided(1);
        row.setVoidedBy(accessService.currentAdmin().getId());
        row.setVoidedAt(LocalDateTime.now());
        row.setVoidReason(safeReason);
        assessmentMapper.updateById(row);
    }

    private void writeLog(MassagistTrainingCert cert, String action, LocalDate oldDate,
                          LocalDate newDate, Long operatorId, String operatorName, String remark) {
        MassagistTrainingCertLog log = new MassagistTrainingCertLog();
        log.setCertId(cert.getId());
        log.setMassagistId(cert.getMassagistId());
        log.setShopId(cert.getShopId());
        log.setProjectKey(cert.getProjectKey());
        log.setAction(action);
        log.setOldPassedAt(oldDate);
        log.setNewPassedAt(newDate);
        log.setOperatorId(operatorId);
        log.setOperatorName(operatorName);
        log.setRemark(remark);
        certLogMapper.insert(log);
    }

    private String requireReason(String reason) {
        if (reason == null || reason.trim().isEmpty()) throw new BusinessException("请填写作废/撤销原因");
        String trimmed = reason.trim();
        if (trimmed.length() > 500) throw new BusinessException("原因不能超过500个字符");
        return trimmed;
    }
}
```

- [ ] **Step 2: 测试**

`TrainingCertificationServiceTest` 用 mock mapper + mock access：

```java
@Test void teamCertificationWritesSourceAndLog() {
    // 注入 mock，stub 无既有认证，调用 certifyTeam
    // verify certMapper.insert 捕获 source=TEAM, teamSize=3, passedAt=decision.passedAt
    // verify certLogMapper.insert action=TEAM_CERTIFY
}
@Test void existingCertBlocksSecondTeamCert() { /* find 返回认证 -> 抛“已认证” */ }
@Test void revokeRequiresReasonAndVoidsAllVotes() { /* 空原因抛错；有效原因 verify update + delete + REVOKE 日志 */ }
@Test void manualCertRequiresSuperAdmin() { /* access.requireSuperAdmin 抛错时不写库 */ }
@Test void voidingSingleVoteBlockedAfterCert() { /* find 返回认证 -> “请先撤销认证” */ }
```

- [ ] **Step 3: 跑测试**

```bash
mvn -pl mall-admin -am -Dtest=TrainingCertificationServiceTest -DfailIfNoTests=false test
```

Expected: 5 个测试通过。

---

### Task 6: 提交考核与自动认证

**Files:**
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/dto/AssessmentSubmitRequest.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/dto/AssessmentSubmitResult.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/service/TrainingAssessmentService.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/TrainingAssessmentServiceTest.java`

- [ ] **Step 1: 请求/响应 DTO**

```java
@Getter @Setter
public class AssessmentSubmitRequest {
    private Long massagistId;
    private String projectKey;
    private LocalDate assessDate;
    private Integer result;      // 1 通过 0 不通过
    private String remark;
}

@Getter @Setter
public class AssessmentSubmitResult {
    private boolean recorded = true;
    private boolean certified;
    private String projectKey;
    private String projectName;
    private String message;
}
```

- [ ] **Step 2: 实现服务**

```java
@Service
public class TrainingAssessmentService {
    @Autowired private TrainingTeamCertProperties properties;
    @Autowired private IncentiveAccessService accessService;
    @Autowired private IncentiveConfigService configService;
    @Autowired private MassagistService massagistService;
    @Autowired private MassagistTrainingAssessmentMapper assessmentMapper;
    @Autowired private TrainingCertificationService certificationService;

    @Transactional(rollbackFor = Exception.class)
    public AssessmentSubmitResult submit(AssessmentSubmitRequest request) {
        Massagist trainer = accessService.requireTrainer();
        if (request == null || request.getMassagistId() == null
                || request.getProjectKey() == null || request.getProjectKey().trim().isEmpty()
                || request.getAssessDate() == null || request.getResult() == null) {
            throw new BusinessException("疗愈师、项目、考核日期和结果不能为空");
        }
        if (request.getResult() != 0 && request.getResult() != 1) {
            throw new BusinessException("考核结果不正确");
        }
        if (request.getMassagistId().equals(trainer.getId())) {
            throw new BusinessException("不能给自己做考核");
        }
        LocalDate today = LocalDate.now();
        LocalDate earliest = today.minusDays(properties.backfillDays());
        if (request.getAssessDate().isAfter(today)) throw new BusinessException("考核日期不能晚于今天");
        if (request.getAssessDate().isBefore(earliest)) {
            throw new BusinessException("最多补记" + properties.backfillDays() + "天内的考核");
        }
        String remark = request.getRemark() == null ? null : request.getRemark().trim();
        if (remark != null && remark.length() > 500) throw new BusinessException("备注不能超过500个字符");

        Massagist target = massagistService.getById(request.getMassagistId());
        if (target == null) throw new BusinessException("疗愈师档案不存在");
        if (Integer.valueOf(0).equals(target.getStatus())) throw new BusinessException("该疗愈师已离职，不能考核");

        String projectKey = request.getProjectKey().trim();
        TrainingProjectConfig project = configService.bundleForMonth(IncentiveMath.currentMonth())
                .getTrainingProjects().stream()
                .filter(p -> projectKey.equals(p.getProjectKey()) && Integer.valueOf(1).equals(p.getEnabled()))
                .findFirst().orElse(null);
        if (project == null) throw new BusinessException("培训项目不存在或已停用");

        if (assessmentMapper.countRecent(trainer.getId(), target.getId(), projectKey,
                LocalDateTime.now().minusMinutes(properties.duplicateMinutes())) > 0) {
            throw new BusinessException("刚刚已提交过该疗愈师的考核，请勿重复提交");
        }

        // 认证判断与写入必须串行化到同一目标。
        assessmentMapper.lockMassagist(target.getId());
        if (certificationService.findByTargetAndProject(target.getId(), projectKey) != null) {
            throw new BusinessException("该疗愈师该项目已认证，无需再考核");
        }

        MassagistTrainingAssessment row = new MassagistTrainingAssessment();
        row.setMassagistId(target.getId());
        row.setShopId(target.getShopId());
        row.setProjectKey(project.getProjectKey());
        row.setProjectName(project.getProjectName());
        row.setAssessDate(request.getAssessDate());
        row.setResult(request.getResult());
        row.setTrainerMassagistId(trainer.getId());
        row.setTrainerName(trainer.getName());
        row.setTrainerShopId(trainer.getShopId());
        row.setTrainerAdminId(accessService.currentAdmin().getId());
        row.setRemark(remark);
        row.setSubmittedAt(LocalDateTime.now());
        row.setVoided(0);
        row.setCreateTime(LocalDateTime.now());
        assessmentMapper.insert(row);

        List<TrainingCertificationPolicy.Vote> votes = new ArrayList<>();
        for (MassagistTrainingAssessment vote : assessmentMapper.latestVotes(target.getId(), projectKey)) {
            votes.add(new TrainingCertificationPolicy.Vote(vote.getTrainerMassagistId(), vote.getResult(),
                    vote.getAssessDate(), vote.getSubmittedAt(), vote.getId()));
        }
        TrainingCertificationPolicy.Decision decision = new TrainingCertificationPolicy().evaluate(votes);

        AssessmentSubmitResult result = new AssessmentSubmitResult();
        result.setProjectKey(project.getProjectKey());
        result.setProjectName(project.getProjectName());
        if (decision.isCertified()) {
            certificationService.certifyTeam(target, project, decision,
                    accessService.currentAdmin().getId(), accessService.currentOperatorName());
            result.setCertified(true);
            result.setMessage("已记录，该项目已完成三人认证");
        } else {
            result.setMessage("已记录本次考核");
        }
        return result;
    }
}
```

导入 `IncentiveMath`、`TrainingProjectConfig`、`Massagist`、`BusinessException`、`@Transactional`。

- [ ] **Step 3: 测试**

`TrainingAssessmentServiceTest`：

```java
@Test void rejectsSelfAssessment()
@Test void rejectsFutureAndOutOfWindowDates()
@Test void rejectsDuplicateWithinTenMinutes()
@Test void rejectsWhenAlreadyCertifiedBeforeInsert()
@Test void thirdDistinctPassCertifiesWithLatestAssessmentDate()
@Test void latestTrainerFailCancelsEarlierPass()
@Test void responseNeverExposesVoteCounts()  // JSON/字段层面只允许 recorded/certified/message
@Test void disabledFeatureFailsBeforeAnyWrite()
```

第三个通过票场景：stub `latestVotes` 返回 3 条不同内训师通过（含本次），断言 `certificationService.certifyTeam` 被调用一次，`passedAt` 为三者最大考核日。

- [ ] **Step 4: 跑测试**

```bash
mvn -pl mall-admin -am -Dtest=TrainingAssessmentServiceTest -DfailIfNoTests=false test
```

Expected: 8 个测试通过。

- [ ] **Step 5: 阶段检查点**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-server
mvn -pl mall-admin -am -Dtest='TrainingSchemaContractTest,TrainingAssessmentMapperTest,TrainingAccessTest,TrainingCertificationPolicyTest,TrainingCertificationServiceTest,TrainingAssessmentServiceTest,TrainingCalculatorTest' -DfailIfNoTests=false test
```

Expected: 全部通过。此时还没有改任何前端、没有执行 SQL、开关仍为关闭。

---

## 阶段 2：接口与管理端矩阵（任务 7–11）

### Task 7: 内训师接口（盲考、跨店、只看本人）

**Files:**
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/dto/TrainerProfileView.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/dto/TrainerTherapistOption.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/dto/TrainerProjectOption.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/dto/TrainerAssessmentView.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/service/TrainingAssessmentQueryService.java`（先只实现内训师查询部分）
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/controller/TrainerAssessmentController.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/TrainerAssessmentControllerTest.java`

- [ ] **Step 1: DTO**

```java
@Getter @Setter
public class TrainerProfileView {
    private Long trainerId;
    private String trainerName;
    private Long shopId;
    private String shopName;
    private String trainerSince;
    private int monthSubmissions;
    private int todaySubmissions;
}

@Getter @Setter
public class TrainerTherapistOption {
    private Long id;
    private String name;
    private Long shopId;
    private String shopName;
    private Integer status;
}

@Getter @Setter
public class TrainerProjectOption {
    private String projectKey;
    private String projectGroup;
    private String projectName;
    private Integer durationMinutes;
    private String status;       // PENDING / CERTIFIED
    private String statusLabel;  // 待考核 / 已认证
}

@Getter @Setter
public class TrainerAssessmentView {
    private Long id;
    private String massagistName;
    private String shopName;
    private String projectName;
    private LocalDate assessDate;
    private Integer result;
    private String resultLabel;
    private String remark;
    private LocalDateTime submittedAt;
    private String auditStatus;  // 有效 / 已作废
}
```

- [ ] **Step 2: 查询服务（内训师部分）**

`TrainingAssessmentQueryService`：

```java
@Service
public class TrainingAssessmentQueryService {
    @Autowired private IncentiveAccessService accessService;
    @Autowired private MassagistService massagistService;
    @Autowired private ShopService shopService;
    @Autowired private IncentiveConfigService configService;
    @Autowired private TrainingCertificationService certificationService;
    @Autowired private MassagistTrainingAssessmentMapper assessmentMapper;
    @Autowired private MassagistTrainingCertMapper certMapper;
    @Autowired private TrainingAssessmentQueryMapper queryMapper;

    public TrainerProfileView trainerProfile() {
        Massagist trainer = accessService.requireTrainer();
        TrainerProfileView view = new TrainerProfileView();
        view.setTrainerId(trainer.getId());
        view.setTrainerName(trainer.getName());
        view.setShopId(trainer.getShopId());
        Shop shop = trainer.getShopId() == null ? null : shopService.getById(trainer.getShopId());
        view.setShopName(shop == null ? null : shop.getName());
        view.setTrainerSince(trainer.getTrainerSince() == null ? null : trainer.getTrainerSince().toString());
        LocalDate monthStart = LocalDate.now().withDayOfMonth(1);
        view.setMonthSubmissions(assessmentMapper.selectCount(
                new LambdaQueryWrapper<MassagistTrainingAssessment>()
                        .eq(MassagistTrainingAssessment::getTrainerMassagistId, trainer.getId())
                        .eq(MassagistTrainingAssessment::getVoided, 0)
                        .ge(MassagistTrainingAssessment::getAssessDate, monthStart)).intValue());
        view.setTodaySubmissions(assessmentMapper.selectCount(
                new LambdaQueryWrapper<MassagistTrainingAssessment>()
                        .eq(MassagistTrainingAssessment::getTrainerMassagistId, trainer.getId())
                        .eq(MassagistTrainingAssessment::getVoided, 0)
                        .eq(MassagistTrainingAssessment::getAssessDate, LocalDate.now())).intValue());
        return view;
    }

    public List<TrainerTherapistOption> trainerTherapists(String keyword, Long shopId) {
        accessService.requireTrainer();
        LambdaQueryWrapper<Massagist> wrapper = new LambdaQueryWrapper<Massagist>()
                .eq(Massagist::getStatus, 1)
                .orderByAsc(Massagist::getName).orderByAsc(Massagist::getId)
                .last("LIMIT 200");
        if (shopId != null) wrapper.eq(Massagist::getShopId, shopId);
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.like(Massagist::getName, keyword.trim());
        }
        List<Massagist> list = massagistService.list(wrapper);
        Map<Long, Shop> shops = new HashMap<>();
        for (Shop shop : shopService.listByIds(list.stream().map(Massagist::getShopId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList()))) {
            shops.put(shop.getId(), shop);
        }
        List<TrainerTherapistOption> result = new ArrayList<>();
        for (Massagist massagist : list) {
            TrainerTherapistOption option = new TrainerTherapistOption();
            option.setId(massagist.getId());
            option.setName(massagist.getName());
            option.setShopId(massagist.getShopId());
            Shop shop = massagist.getShopId() == null ? null : shops.get(massagist.getShopId());
            option.setShopName(shop == null ? null : shop.getName());
            option.setStatus(massagist.getStatus());
            result.add(option);
        }
        return result;
    }

    public List<TrainerProjectOption> trainerProjects(Long massagistId) {
        accessService.requireTrainer();
        if (massagistId == null) throw new BusinessException("请选择疗愈师");
        if (massagistService.getById(massagistId) == null) throw new BusinessException("疗愈师档案不存在");
        List<TrainerProjectOption> result = new ArrayList<>();
        for (TrainingProjectConfig project : configService.bundleForMonth(IncentiveMath.currentMonth())
                .getTrainingProjects()) {
            if (!Integer.valueOf(1).equals(project.getEnabled())) continue;
            TrainerProjectOption option = new TrainerProjectOption();
            option.setProjectKey(project.getProjectKey());
            option.setProjectGroup(project.getProjectGroup());
            option.setProjectName(project.getProjectName());
            option.setDurationMinutes(project.getDurationMinutes());
            boolean certified = certificationService.findByTargetAndProject(
                    massagistId, project.getProjectKey()) != null;
            option.setStatus(certified ? "CERTIFIED" : "PENDING");
            option.setStatusLabel(certified ? "已认证" : "待考核");
            result.add(option);
        }
        return result;
    }

    public Map<String, Object> myAssessments(String month, int page, int size) {
        Massagist trainer = accessService.requireTrainer();
        if (page < 1 || page > 100000 || size < 1 || size > 100) {
            throw new BusinessException("分页参数不正确");
        }
        LocalDate start = LocalDate.parse(IncentiveMath.normalizeMonth(month) + "-01");
        LocalDate end = start.plusMonths(1).minusDays(1);
        LambdaQueryWrapper<MassagistTrainingAssessment> wrapper =
                new LambdaQueryWrapper<MassagistTrainingAssessment>()
                        .eq(MassagistTrainingAssessment::getTrainerMassagistId, trainer.getId())
                        .between(MassagistTrainingAssessment::getAssessDate, start, end)
                        .orderByDesc(MassagistTrainingAssessment::getSubmittedAt)
                        .orderByDesc(MassagistTrainingAssessment::getId);
        long total = assessmentMapper.selectCount(wrapper).longValue();
        // MyBatis-Plus 的 selectPage 需要分页插件；此处显式 last(limit) 避免影响其他查询。
        wrapper.last("LIMIT " + ((page - 1) * size) + "," + size);
        List<MassagistTrainingAssessment> rows = assessmentMapper.selectList(wrapper);
        List<Long> targetIds = rows.stream().map(MassagistTrainingAssessment::getMassagistId)
                .distinct().collect(Collectors.toList());
        Map<Long, Massagist> targets = targetIds.isEmpty() ? Collections.emptyMap()
                : massagistService.listByIds(targetIds).stream()
                .collect(Collectors.toMap(Massagist::getId, e -> e));
        Map<Long, Shop> shops = shopsOf(targets.values().stream().map(Massagist::getShopId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList()));
        List<TrainerAssessmentView> list = new ArrayList<>();
        for (MassagistTrainingAssessment row : rows) {
            TrainerAssessmentView view = new TrainerAssessmentView();
            view.setId(row.getId());
            Massagist target = targets.get(row.getMassagistId());
            view.setMassagistName(target == null ? null : target.getName());
            Shop shop = target == null || target.getShopId() == null ? null : shops.get(target.getShopId());
            view.setShopName(shop == null ? null : shop.getName());
            view.setProjectName(row.getProjectName());
            view.setAssessDate(row.getAssessDate());
            view.setResult(row.getResult());
            view.setResultLabel(Integer.valueOf(1).equals(row.getResult()) ? "通过" : "不通过");
            view.setRemark(row.getRemark());
            view.setSubmittedAt(row.getSubmittedAt());
            view.setAuditStatus(Integer.valueOf(1).equals(row.getVoided()) ? "已作废" : "有效");
            list.add(view);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("list", list);
        response.put("total", total);
        response.put("pageNum", page);
        response.put("pageSize", size);
        return response;
    }

    private Map<Long, Shop> shopsOf(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return Collections.emptyMap();
        return shopService.listByIds(ids).stream()
                .collect(Collectors.toMap(Shop::getId, e -> e));
    }
}
```

注意：`ShopService` 包路径是 `com.macro.mall.service.shop.ShopService`。

- [ ] **Step 3: Controller**

```java
@RestController
@RequestMapping("/incentive/trainer")
@Api(tags = "内训师考核")
public class TrainerAssessmentController {
    @Autowired private TrainingAssessmentService assessmentService;
    @Autowired private TrainingAssessmentQueryService queryService;

    @GetMapping("/profile")
    public CommonResult<TrainerProfileView> profile() {
        return CommonResult.success(queryService.trainerProfile());
    }

    @GetMapping("/therapists")
    public CommonResult<List<TrainerTherapistOption>> therapists(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long shopId) {
        return CommonResult.success(queryService.trainerTherapists(keyword, shopId));
    }

    @GetMapping("/projects")
    public CommonResult<List<TrainerProjectOption>> projects(@RequestParam Long massagistId) {
        return CommonResult.success(queryService.trainerProjects(massagistId));
    }

    @PostMapping("/assessments")
    public CommonResult<AssessmentSubmitResult> submit(@RequestBody AssessmentSubmitRequest request) {
        return CommonResult.success(assessmentService.submit(request), "考核已记录");
    }

    @GetMapping("/assessments")
    public CommonResult<Map<String, Object>> mine(
            @RequestParam(required = false) String month,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return CommonResult.success(queryService.myAssessments(
                month == null || month.trim().isEmpty() ? IncentiveMath.currentMonth() : month.trim(),
                page, size));
    }
}
```

- [ ] **Step 4: 测试**

`TrainerAssessmentControllerTest` 用 mock 服务直接测 controller：

```java
@Test void profileNeverReturnsOtherTrainersData() { /* verify 只使用 requireTrainer 返回的人，不读请求参数 */ }
@Test void projectsOnlyReturnStatusAndLabel() { /* JSON 字段无 passCount/failCount/trainerNames */ }
@Test void therapistsAreLimitedTo200AndActiveOnly() { /* 检查 wrapper SQL 含 status=1、LIMIT 200 */ }
@Test void myAssessmentsScopesToCurrentTrainer() { /* wrapper 条件含 trainerMassagistId=当前人 */ }
```

盲考断言：

```java
assertEquals(new HashSet<>(Arrays.asList("id", "name", "shopId", "shopName", "status")),
        fieldNames(TrainerTherapistOption.class));
assertEquals(new HashSet<>(Arrays.asList("projectKey", "projectGroup", "projectName",
        "durationMinutes", "status", "statusLabel")), fieldNames(TrainerProjectOption.class));
```

- [ ] **Step 5: 跑测试**

```bash
mvn -pl mall-admin -am -Dtest=TrainerAssessmentControllerTest -DfailIfNoTests=false test
```

Expected: 4 个测试通过。

---

### Task 8: 认证矩阵扩展与旧接口开关分流

**Files:**
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/dto/TrainingRecordView.java`
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/service/IncentiveDataService.java`
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/controller/IncentiveController.java`
- Modify: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/service/TrainingRecordPageTest.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/TrainingMatrixTest.java`

- [ ] **Step 1: DTO 增加字段**

`TrainingRecordView.CertItem`：

```java
private Integer passCount = 0;
private Integer failCount = 0;
private Integer attemptCount = 0;
private LocalDate lastAssessDate;
private String certSource;
private LocalDateTime certifiedAt;
private Integer teamSize = 0;
```

- [ ] **Step 2: 矩阵聚合**

`IncentiveDataService` 注入：

```java
@Autowired private MassagistTrainingAssessmentMapper assessmentMapper;
@Autowired private TrainingCertificationService certificationService;
@Autowired private TrainingTeamCertProperties teamCertProperties;
```

`trainingViews` 改为：

```java
private List<TrainingRecordView> trainingViews(List<Massagist> massagists,
                                               IncentiveConfigBundle bundle,
                                               List<MassagistTrainingCert> certs,
                                               List<MassagistTrainingAssessment> assessments) {
    Map<Long, Shop> shops = shopsOf(massagists);
    Map<String, MassagistTrainingCert> certByKey = new HashMap<>();
    for (MassagistTrainingCert cert : certs) {
        certByKey.put(cert.getMassagistId() + "|" + cert.getProjectKey(), cert);
    }
    Map<String, List<MassagistTrainingAssessment>> votesByKey = new HashMap<>();
    for (MassagistTrainingAssessment row : assessments) {
        votesByKey.computeIfAbsent(row.getMassagistId() + "|" + row.getProjectKey(),
                k -> new ArrayList<>()).add(row);
    }
    List<TrainingRecordView> result = new ArrayList<>();
    for (Massagist massagist : massagists) {
        TrainingRecordView view = new TrainingRecordView();
        view.setMassagistId(massagist.getId());
        view.setMassagistName(massagist.getName());
        view.setShopId(massagist.getShopId());
        Shop shop = massagist.getShopId() == null ? null : shops.get(massagist.getShopId());
        view.setShopName(shop == null ? null : shop.getName());
        view.setCooperationStatus(cooperationStatus(massagist));
        view.setEntryDay(massagist.getEntryDay());
        int certified = 0;
        for (TrainingProjectConfig project : bundle.getTrainingProjects()) {
            String key = massagist.getId() + "|" + project.getProjectKey();
            TrainingRecordView.CertItem item = new TrainingRecordView.CertItem();
            item.setProjectKey(project.getProjectKey());
            item.setProjectGroup(project.getProjectGroup());
            item.setProjectName(project.getProjectName());
            item.setProjectId(project.getProjectId());
            item.setDurationMinutes(project.getDurationMinutes());
            List<MassagistTrainingAssessment> votes = votesByKey.get(key);
            if (votes != null) {
                int pass = 0, fail = 0;
                LocalDate last = null;
                for (MassagistTrainingAssessment vote : votes) {
                    if (Integer.valueOf(1).equals(vote.getResult())) pass++; else fail++;
                    if (vote.getAssessDate() != null
                            && (last == null || vote.getAssessDate().isAfter(last))) {
                        last = vote.getAssessDate();
                    }
                }
                item.setPassCount(pass);
                item.setFailCount(fail);
                item.setAttemptCount(pass + fail);
                item.setLastAssessDate(last);
            }
            MassagistTrainingCert cert = certByKey.get(key);
            if (cert != null) {
                certified++;
                item.setCertId(cert.getId());
                item.setPassedAt(cert.getPassedAt());
                item.setCertifierName(cert.getCertifierName());
                item.setRemark(cert.getRemark());
                item.setCertSource(cert.getSource() == null ? "LEGACY" : cert.getSource());
                item.setCertifiedAt(cert.getCertifiedAt());
                item.setTeamSize(cert.getTeamSize() == null ? 0 : cert.getTeamSize());
            }
            view.getCerts().add(item);
        }
        view.setCertifiedCount(certified);
        result.add(view);
    }
    return result;
}
```

两个调用点（`trainingRecords`、`trainingRecordsPage`）都改为先查流水。

`trainingRecords` 中：

```java
List<Long> ids = massagists.stream().map(Massagist::getId).collect(Collectors.toList());
List<MassagistTrainingAssessment> assessments = ids.isEmpty() ? new ArrayList<>()
        : assessmentMapper.selectList(new LambdaQueryWrapper<MassagistTrainingAssessment>()
        .in(MassagistTrainingAssessment::getMassagistId, ids)
        .eq(MassagistTrainingAssessment::getVoided, 0));
List<TrainingRecordView> result = trainingViews(massagists, bundle, certs, assessments);
```

`trainingRecordsPage` 的 `if (!massagists.isEmpty())` 内，已有 `ids` 之后、`rows = trainingViews(...)` 之前：

```java
List<MassagistTrainingAssessment> assessments = assessmentMapper.selectList(
        new LambdaQueryWrapper<MassagistTrainingAssessment>()
                .in(MassagistTrainingAssessment::getMassagistId, ids)
                .eq(MassagistTrainingAssessment::getVoided, 0));
rows = trainingViews(massagists, bundle, certs, assessments);
```

- [ ] **Step 3: 旧接口按开关分流**

`saveCert` 开头：

```java
if (teamCertProperties.enabled()) {
    accessService.requireSuperAdmin();
    if (request == null || request.getRemark() == null || request.getRemark().trim().isEmpty()) {
        throw new BusinessException("人工特批必须填写原因");
    }
    // 复用下方原有校验与写入，最后设置 source=MANUAL、teamSize=0、certifiedAt=now
}
// 开关关闭：保持原 requireGlobal 与 LEGACY 行为
```

实现时不要复制两份逻辑：把原有主体抽成 `private MassagistTrainingCert saveCertInternal(request, boolean manual)`；开关分支只决定权限、来源和备注必填。`existing == null` 时：

```java
cert.setSource(manual ? "MANUAL" : "LEGACY");
cert.setCertifiedAt(LocalDateTime.now());
cert.setTeamSize(0);
```

更新时保留原 `source`，只在 manual 时改为 `MANUAL`。

`deleteCert` 开头：

```java
if (teamCertProperties.enabled()) {
    accessService.requireSuperAdmin();
    certificationService.revoke(certId, reason);
    return;
}
accessService.requireGlobal();
// 原 DELETE 逻辑
```

`deleteCert` 增加重载 `deleteCert(Long certId, String reason)`；旧签名调用时 reason 传 `null`，开关开启会得到“请填写作废/撤销原因”。

- [ ] **Step 4: Controller 新接口**

```java
@PostMapping("/training-records/manual")
@ApiOperation("超管人工特批认证")
public CommonResult<MassagistTrainingCert> manualCert(@RequestBody TrainingManualCertRequest request) {
    return CommonResult.success(dataService.manualCert(request), "人工特批已生效");
}

@PostMapping("/training-records/{certId}/revoke")
@ApiOperation("超管撤销认证")
public CommonResult<Void> revoke(@PathVariable Long certId,
                                 @RequestBody ReasonRequest request) {
    dataService.revokeCert(certId, request == null ? null : request.getReason());
    return CommonResult.success(null, "认证已撤销");
}
```

`TrainingManualCertRequest` 字段：`massagistId`、`projectKey`、`passedAt`、`reason`。`ReasonRequest` 字段：`reason`。放在 `incentive/dto`。

`IncentiveDataService` 对应：

```java
@Transactional(rollbackFor = Exception.class)
public MassagistTrainingCert manualCert(TrainingManualCertRequest request) {
    if (!teamCertProperties.enabled()) throw new BusinessException("内训考核功能尚未开启");
    accessService.requireSuperAdmin();
    if (request == null || request.getMassagistId() == null
            || request.getProjectKey() == null || request.getProjectKey().trim().isEmpty()
            || request.getPassedAt() == null) {
        throw new BusinessException("疗愈师、项目和通过日期不能为空");
    }
    Massagist massagist = massagistService.getById(request.getMassagistId());
    if (massagist == null) throw new BusinessException("疗愈师档案不存在");
    TrainingProjectConfig project = configService.bundleForMonth(IncentiveMath.currentMonth())
            .getTrainingProjects().stream()
            .filter(p -> request.getProjectKey().trim().equals(p.getProjectKey()))
            .findFirst().orElse(null);
    if (project == null) throw new BusinessException("培训项目不存在");
    return certificationService.manualCert(massagist, project, request.getPassedAt(), request.getReason());
}

public void revokeCert(Long certId, String reason) {
    if (!teamCertProperties.enabled()) throw new BusinessException("内训考核功能尚未开启");
    certificationService.revoke(certId, reason);
}
```

- [ ] **Step 5: 更新旧测试**

`TrainingRecordPageTest.setup()` 增加：

```java
MassagistTrainingAssessmentMapper assessments = mock(MassagistTrainingAssessmentMapper.class);
when(assessments.selectList(any())).thenReturn(new ArrayList<>());
ReflectionTestUtils.setField(service, "assessmentMapper", assessments);
ReflectionTestUtils.setField(service, "teamCertProperties",
        mock(TrainingTeamCertProperties.class));
```

原有断言全部保留。新增 `TrainingMatrixTest`：

```java
@Test void matrixCountsPassFailAndLastDate() { /* 两人对同一项目 2 过 1 不过 -> pass=2 fail=1 last=最大考核日 */ }
@Test void matrixShowsTeamSourceAndCertifiedAt() { /* cert source=TEAM -> CertItem 同步 */ }
@Test void featureOffKeepsLegacySaveForGlobalRoles() { /* properties.enabled=false -> access.requireGlobal 被调用 */ }
@Test void featureOnSendsManualSaveToSuperAdminOnly() { /* enabled=true -> requireSuperAdmin；备注为空抛错 */ }
@Test void featureOnRevokeRequiresReason() { /* deleteCert(id,null) -> “请填写...” */ }
```

- [ ] **Step 6: 跑测试**

```bash
mvn -pl mall-admin -am -Dtest='TrainingRecordPageTest,TrainingMatrixTest' -DfailIfNoTests=false test
```

Expected: 原有测试 + 5 个新测试全部通过。

---

### Task 9: 考核记录、详情、分析与纯指标计算

**Files:**
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/dto/TrainingAssessmentRow.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/dto/TrainingAssessmentSummary.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/dto/TrainingAssessmentDetail.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/mapper/TrainingAssessmentQueryMapper.java`
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/calc/TrainingAnalyticsCalculator.java`
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/service/TrainingAssessmentQueryService.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/calc/TrainingAnalyticsCalculatorTest.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/TrainingAssessmentQueryServiceTest.java`

- [ ] **Step 1: DTO**

`TrainingAssessmentRow`：

```java
@Getter @Setter
public class TrainingAssessmentRow {
    private Long id;
    private Long massagistId;
    private String massagistName;
    private Long shopId;
    private String shopName;
    private String projectKey;
    private String projectName;
    private LocalDate assessDate;
    private Integer result;
    private Long trainerMassagistId;
    private String trainerName;
    private Long trainerShopId;
    private String trainerShopName;
    private String remark;
    private LocalDateTime submittedAt;
    private Integer voided;
    private String voidReason;
}
```

`TrainingAssessmentSummary`：

```java
@Getter @Setter
public class TrainingAssessmentSummary {
    private String month;
    private long total;
    private long passCount;
    private long failCount;
    private String passRate;          // "66.7%"，分母为总提交
    private long certifiedCount;
    private long teamCertifiedCount;
    private long manualCertifiedCount;
    private long legacyCertifiedCount;
    private String avgAttempts;       // 已认证项目平均尝试次数，保留1位
    private String avgDaysToCert;     // 首次考核到认证通过的平均天数，保留1位
    private long repeatedFailureCount;// 失败>=2次仍未认证的人数
    private long backlogCount;        // 有考核但未认证的人数
    private List<ProjectMetric> byProject = new ArrayList<>();
    private List<TrainerMetric> byTrainer = new ArrayList<>();
    private List<ShopMetric> byShop = new ArrayList<>();
    private List<TrendMetric> monthlyTrend = new ArrayList<>();

    @Getter @Setter public static class ProjectMetric {
        private String projectKey; private String projectName;
        private long total; private long pass; private long fail; private String passRate;
    }
    @Getter @Setter public static class TrainerMetric {
        private Long trainerId; private String trainerName;
        private long total; private long pass; private long fail;
        private String passRate; private String failRate;
    }
    @Getter @Setter public static class ShopMetric {
        private Long shopId; private String shopName;
        private long total; private long certified;
    }
    @Getter @Setter public static class TrendMetric {
        private String month; private long total; private long pass; private long certified;
    }
}
```

`TrainingAssessmentDetail`：`massagistId`、`massagistName`、`shopName`、`projectKey`、`projectName`、`certId`、`passedAt`、`certSource`、`certifiedAt`、`teamSize`、`List<VoteView> votes`；`VoteView` 含 `id`、`trainerName`、`trainerShopName`、`assessDate`、`result`、`submittedAt`、`voided`、`voidReason`。

- [ ] **Step 2: 查询 Mapper**

```java
public interface TrainingAssessmentQueryMapper {
    String FILTER = "<where> a.voided=0 "
            + "<if test='start != null'>AND a.assess_date &gt;= #{start}</if>"
            + "<if test='end != null'>AND a.assess_date &lt;= #{end}</if>"
            + "<if test='shopId != null'>AND a.shop_id=#{shopId}</if>"
            + "<if test='trainerId != null'>AND a.trainer_massagist_id=#{trainerId}</if>"
            + "<if test='massagistId != null'>AND a.massagist_id=#{massagistId}</if>"
            + "<if test='projectKey != null and projectKey != &quot;&quot;'>AND a.project_key=#{projectKey}</if>"
            + "<if test='result != null'>AND a.result=#{result}</if>"
            + "</where>";

    @Select("<script>SELECT COUNT(*) FROM s_massagist_training_assessment a " + FILTER + "</script>")
    long count(@Param("start") LocalDate start, @Param("end") LocalDate end,
               @Param("shopId") Long shopId, @Param("trainerId") Long trainerId,
               @Param("massagistId") Long massagistId, @Param("projectKey") String projectKey,
               @Param("result") Integer result);

    @Select("<script>SELECT a.id,a.massagist_id,m.name AS massagist_name,a.shop_id,s.name AS shop_name,"
            + "a.project_key,a.project_name,a.assess_date,a.result,a.trainer_massagist_id,"
            + "a.trainer_name,a.trainer_shop_id,ts.name AS trainer_shop_name,a.remark,a.submitted_at,"
            + "a.voided,a.void_reason FROM s_massagist_training_assessment a "
            + "JOIN s_massagist m ON m.id=a.massagist_id "
            + "LEFT JOIN s_shop s ON s.id=a.shop_id "
            + "LEFT JOIN s_shop ts ON ts.id=a.trainer_shop_id " + FILTER
            + " ORDER BY a.submitted_at DESC,a.id DESC LIMIT #{offset},#{size}</script>")
    List<TrainingAssessmentRow> page(...same params..., @Param("offset") int offset, @Param("size") int size);

    @Select("<script>SELECT a.id,a.massagist_id,m.name AS massagist_name,a.shop_id,s.name AS shop_name,"
            + "a.project_key,a.project_name,a.assess_date,a.result,a.trainer_massagist_id,"
            + "a.trainer_name,a.trainer_shop_id,ts.name AS trainer_shop_name,a.remark,a.submitted_at,"
            + "a.voided,a.void_reason FROM s_massagist_training_assessment a "
            + "JOIN s_massagist m ON m.id=a.massagist_id "
            + "LEFT JOIN s_shop s ON s.id=a.shop_id "
            + "LEFT JOIN s_shop ts ON ts.id=a.trainer_shop_id " + FILTER
            + " ORDER BY a.submitted_at DESC,a.id DESC LIMIT #{cap}</script>")
    List<TrainingAssessmentRow> allForAnalytics(...same params..., @Param("cap") int cap);
}
```

注意：分析/导出只统计 `voided=0`；详情需要包含已作废票，另写 `history(massagistId, projectKey)` 查询，不带 `voided=0`。

- [ ] **Step 3: 纯指标计算器（先写测试）**

测试：

```java
@Test void passRateUsesAllSubmissions() { /* 3 提交 2 过 -> 66.7% */ }
@Test void repeatedFailureCountsPeopleNotRecords() { /* 同一人同一项目失败2次只算1人；已认证不计 */ }
@Test void avgAttemptsUsesLatestVotePerTrainerBeforeCert() { /* 3位各1次 -> 1.0 */ }
@Test void trainerFailRateHighlightsNeverPassingTrainers() { /* A 3次0过 -> failRate 100.0%；B 2次2过 -> 0.0% */ }
@Test void trendKeepsEmptyMonthsWhenProvided() { /* 空月份补0，不跳过 */ }
@Test void legacyCertCountedSeparately() { /* source=LEGACY/TEAM/MANUAL 分桶 */ }
```

实现 `TrainingAnalyticsCalculator.compute(String month, List<TrainingAssessmentRow> rows, List<MassagistTrainingCert> certs)`，全部用 `BigDecimal` 做除法并 `setScale(1, RoundingMode.HALF_UP)`；空分母返回 `"0.0%"`。`repeatedFailureCount` 以 `(massagistId, projectKey)` 分组，失败次数 >=2 且无认证才计数。`avgDaysToCert` 用该项目最早考核日到 `cert.passedAt` 的 `ChronoUnit.DAYS` 平均值；无样本返回 `"-"`。

- [ ] **Step 4: 服务查询与详情**

`TrainingAssessmentQueryService` 增加：

```java
public Map<String, Object> managementRecords(String month, Long shopId, Long trainerId,
                                             Long massagistId, String projectKey,
                                             Integer result, int page, int size) {
    accessService.requireManagement();
    if (shopId != null) accessService.requireShopAccess(shopId);
    LocalDate[] range = monthRange(month);
    long total = queryMapper.count(range[0], range[1], shopId, trainerId, massagistId, projectKey, result);
    int offset = (page - 1) * size;
    List<TrainingAssessmentRow> list = offset >= total ? new ArrayList<>()
            : queryMapper.page(range[0], range[1], shopId, trainerId, massagistId,
            projectKey, result, offset, size);
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("list", list);
    response.put("total", total);
    response.put("pageNum", page);
    response.put("pageSize", size);
    return response;
}

public TrainingAssessmentSummary summary(String month, Long shopId) {
    accessService.requireManagement();
    if (shopId != null) accessService.requireShopAccess(shopId);
    LocalDate[] range = monthRange(month);
    List<TrainingAssessmentRow> rows = queryMapper.allForAnalytics(
            range[0], range[1], shopId, null, null, null, null, 50000);
    LambdaQueryWrapper<MassagistTrainingCert> certWrapper =
            new LambdaQueryWrapper<MassagistTrainingCert>()
                    .between(MassagistTrainingCert::getPassedAt, range[0], range[1]);
    List<Long> scope = scopeShopIds(shopId);
    if (scope != null) {
        if (scope.isEmpty()) return new TrainingAnalyticsCalculator()
                .compute(IncentiveMath.normalizeMonth(month), rows, new ArrayList<>());
        certWrapper.in(MassagistTrainingCert::getShopId, scope);
    }
    List<MassagistTrainingCert> certs = certMapper.selectList(certWrapper);
    return new TrainingAnalyticsCalculator().compute(
            IncentiveMath.normalizeMonth(month), rows, certs);
}

public TrainingAssessmentDetail detail(Long massagistId, String projectKey) {
    accessService.requireManagement();
    Massagist target = massagistService.getById(massagistId);
    if (target == null) throw new BusinessException("疗愈师档案不存在");
    accessService.requireShopAccess(target.getShopId());
    TrainingProjectConfig project = configService.bundleForMonth(IncentiveMath.currentMonth())
            .getTrainingProjects().stream()
            .filter(p -> projectKey.equals(p.getProjectKey())).findFirst().orElse(null);
    if (project == null) throw new BusinessException("培训项目不存在");
    TrainingAssessmentDetail detail = new TrainingAssessmentDetail();
    detail.setMassagistId(target.getId());
    detail.setMassagistName(target.getName());
    Shop shop = target.getShopId() == null ? null : shopService.getById(target.getShopId());
    detail.setShopName(shop == null ? null : shop.getName());
    detail.setProjectKey(projectKey);
    detail.setProjectName(project.getProjectName());
    MassagistTrainingCert cert =
            certificationService.findByTargetAndProject(massagistId, projectKey);
    if (cert != null) {
        detail.setCertId(cert.getId());
        detail.setPassedAt(cert.getPassedAt());
        detail.setCertSource(cert.getSource() == null ? "LEGACY" : cert.getSource());
        detail.setCertifiedAt(cert.getCertifiedAt());
        detail.setTeamSize(cert.getTeamSize() == null ? 0 : cert.getTeamSize());
    }
    Map<Long, Shop> trainerShops = new HashMap<>();
    List<MassagistTrainingAssessment> history = assessmentMapper.selectList(
            new LambdaQueryWrapper<MassagistTrainingAssessment>()
                    .eq(MassagistTrainingAssessment::getMassagistId, massagistId)
                    .eq(MassagistTrainingAssessment::getProjectKey, projectKey)
                    .orderByDesc(MassagistTrainingAssessment::getSubmittedAt)
                    .orderByDesc(MassagistTrainingAssessment::getId));
    List<Long> trainerShopIds = history.stream().map(MassagistTrainingAssessment::getTrainerShopId)
            .filter(Objects::nonNull).distinct().collect(Collectors.toList());
    if (!trainerShopIds.isEmpty()) {
        for (Shop s : shopService.listByIds(trainerShopIds)) trainerShops.put(s.getId(), s);
    }
    for (MassagistTrainingAssessment row : history) {
        TrainingAssessmentDetail.VoteView vote = new TrainingAssessmentDetail.VoteView();
        vote.setId(row.getId());
        vote.setTrainerName(row.getTrainerName());
        Shop trainerShop = row.getTrainerShopId() == null ? null
                : trainerShops.get(row.getTrainerShopId());
        vote.setTrainerShopName(trainerShop == null ? null : trainerShop.getName());
        vote.setAssessDate(row.getAssessDate());
        vote.setResult(row.getResult());
        vote.setSubmittedAt(row.getSubmittedAt());
        vote.setVoided(row.getVoided());
        vote.setVoidReason(row.getVoidReason());
        detail.getVotes().add(vote);
    }
    return detail;
}
```

`monthRange` 用 `YearMonth.parse(IncentiveMath.normalizeMonth(month))`；`scopeShopIds` 非全局时取 `authorizedShopIds()`，全局返回 `null`，非全局无权限返回空列表。

- [ ] **Step 5: Controller 接口**

```java
@GetMapping("/training-assessments")
public CommonResult<Map<String, Object>> assessments(
        @RequestParam(required = false) String month,
        @RequestParam(required = false) Long shopId,
        @RequestParam(required = false) Long trainerId,
        @RequestParam(required = false) Long massagistId,
        @RequestParam(required = false) String projectKey,
        @RequestParam(required = false) Integer result,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int size) {
    return CommonResult.success(dataService.assessmentRecords(monthOrDefault(month), shopId,
            trainerId, massagistId, projectKey, result, page, size));
}

@GetMapping("/training-assessments/summary")
public CommonResult<TrainingAssessmentSummary> summary(
        @RequestParam(required = false) String month,
        @RequestParam(required = false) Long shopId) {
    return CommonResult.success(dataService.assessmentSummary(monthOrDefault(month), shopId));
}

@GetMapping("/training-assessments/detail")
public CommonResult<TrainingAssessmentDetail> detail(@RequestParam Long massagistId,
                                                     @RequestParam String projectKey) {
    return CommonResult.success(dataService.assessmentDetail(massagistId, projectKey));
}

@PostMapping("/training-assessments/{id}/void")
public CommonResult<Void> voidAssessment(@PathVariable Long id,
                                         @RequestBody ReasonRequest request) {
    dataService.voidAssessment(id, request == null ? null : request.getReason());
    return CommonResult.success(null, "考核记录已作废");
}
```

`IncentiveDataService` 注入 `TrainingAssessmentQueryService queryService`，并加同签名委托：

```java
public Map<String, Object> assessmentRecords(String month, Long shopId, Long trainerId,
                                             Long massagistId, String projectKey,
                                             Integer result, int page, int size) {
    return queryService.managementRecords(month, shopId, trainerId, massagistId, projectKey, result, page, size);
}

public TrainingAssessmentSummary assessmentSummary(String month, Long shopId) {
    return queryService.summary(month, shopId);
}

public TrainingAssessmentDetail assessmentDetail(Long massagistId, String projectKey) {
    return queryService.detail(massagistId, projectKey);
}

public void voidAssessment(Long id, String reason) {
    if (!teamCertProperties.enabled()) throw new BusinessException("内训考核功能尚未开启");
    certificationService.voidAssessment(id, reason);
}
```

- [ ] **Step 6: 测试**

```bash
mvn -pl mall-admin -am -Dtest='TrainingAnalyticsCalculatorTest,TrainingAssessmentQueryServiceTest' -DfailIfNoTests=false test
```

Expected: 6 + 5 个测试通过。重点断言：内训师账号访问管理接口得到“当前账号仅可进行内训考核”；店长只能查授权门店；分析只统计未作废流水。

---

### Task 10: CSV 导出（考核明细 + 认证台账）

**Files:**
- Create: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/service/TrainingExportService.java`
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/controller/IncentiveController.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/TrainingExportServiceTest.java`

- [ ] **Step 1: 实现导出服务**

```java
@Service
public class TrainingExportService {
    public static final int MAX_ROWS = 50000;

    public String assessmentCsv(List<TrainingAssessmentRow> rows) {
        StringBuilder csv = new StringBuilder("\ufeff");
        csv.append("考核日期,门店,疗愈师,项目,结果,内训师,内训师门店,提交时间,备注,状态\n");
        for (TrainingAssessmentRow row : rows) {
            csv.append(csv(row.getAssessDate())).append(',')
                    .append(csv(row.getShopName())).append(',')
                    .append(csv(row.getMassagistName())).append(',')
                    .append(csv(row.getProjectName())).append(',')
                    .append(csv(Integer.valueOf(1).equals(row.getResult()) ? "通过" : "不通过")).append(',')
                    .append(csv(row.getTrainerName())).append(',')
                    .append(csv(row.getTrainerShopName())).append(',')
                    .append(csv(row.getSubmittedAt())).append(',')
                    .append(csv(row.getRemark())).append(',')
                    .append(csv(Integer.valueOf(1).equals(row.getVoided()) ? "已作废" : "有效"))
                    .append('\n');
        }
        return csv.toString();
    }

    public String certificationCsv(List<MassagistTrainingCert> certs,
                                   Map<Long, Massagist> massagists,
                                   Map<Long, Shop> shops) {
        StringBuilder csv = new StringBuilder("\ufeff");
        csv.append("门店,疗愈师,项目编码,项目,认证来源,通过日期,认证时间,团队人数\n");
        for (MassagistTrainingCert cert : certs) {
            Massagist massagist = massagists.get(cert.getMassagistId());
            Shop shop = massagist == null || massagist.getShopId() == null ? null : shops.get(massagist.getShopId());
            csv.append(csv(shop == null ? null : shop.getName())).append(',')
                    .append(csv(massagist == null ? null : massagist.getName())).append(',')
                    .append(csv(cert.getProjectKey())).append(',')
                    .append(csv(cert.getProjectKey())).append(',')
                    .append(csv(cert.getSource() == null ? "LEGACY" : cert.getSource())).append(',')
                    .append(csv(cert.getPassedAt())).append(',')
                    .append(csv(cert.getCertifiedAt())).append(',')
                    .append(cert.getTeamSize() == null ? 0 : cert.getTeamSize()).append('\n');
        }
        return csv.toString();
    }

    private String csv(Object value) {
        if (value == null) return "";
        String safe = String.valueOf(value).replace("\"", "\"\"");
        if (safe.startsWith("=") || safe.startsWith("+") || safe.startsWith("-") || safe.startsWith("@")) {
            safe = "'" + safe;
        }
        return "\"" + safe + "\"";
    }
}
```

项目名从当前 `bundle.getTrainingProjects()` 建 `Map<String,String>` 传入，别用编码代替名称。

- [ ] **Step 2: Controller 导出**

```java
@GetMapping("/training-assessments/export")
public void exportAssessments(@RequestParam(required = false) String month,
                              @RequestParam(required = false) Long shopId,
                              @RequestParam(required = false) Long trainerId,
                              @RequestParam(required = false) Long massagistId,
                              @RequestParam(required = false) String projectKey,
                              @RequestParam(required = false) Integer result,
                              HttpServletResponse response) throws IOException {
    String csv = dataService.exportAssessments(monthOrDefault(month), shopId, trainerId,
            massagistId, projectKey, result);
    writeCsv(response, "内训考核明细-" + monthOrDefault(month) + ".csv", csv);
}

@GetMapping("/training-certifications/export")
public void exportCertifications(@RequestParam(required = false) String month,
                                 @RequestParam(required = false) Long shopId,
                                 HttpServletResponse response) throws IOException {
    String csv = dataService.exportCertifications(monthOrDefault(month), shopId);
    writeCsv(response, "培训认证台账-" + monthOrDefault(month) + ".csv", csv);
}

private void writeCsv(HttpServletResponse response, String filename, String csv) throws IOException {
    String encoded = URLEncoder.encode(filename, "UTF-8").replace("+", "%20");
    response.setCharacterEncoding("UTF-8");
    response.setContentType("text/csv;charset=UTF-8");
    response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encoded);
    response.getWriter().write(csv);
    response.getWriter().flush();
}
```

`IncentiveDataService.exportAssessments`：先 `requireManagement`，再 `requireShopAccess`，取最多 50000 行；`exportCertifications`：`requireManagement`，按授权门店过滤，先按 `passedAt` 在月份内，再 join 人员与门店名。

- [ ] **Step 3: 测试**

```java
@Test void csvStartsWithBomAndHasChineseHeader()
@Test void csvEscapesCommasQuotesAndFormulaPrefix()
@Test void exportCapIs50000()
@Test void exportUsesManagementScopeNotTrainerScope()
@Test void certificationCsvSeparatesTeamAndManual()
```

- [ ] **Step 4: 跑测试**

```bash
mvn -pl mall-admin -am -Dtest=TrainingExportServiceTest -DfailIfNoTests=false test
```

Expected: 5 个测试通过。

---

### Task 11: 疗愈师身份字段、列表与 `/admin/info`

**Files:**
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/service/MassagistService.java`
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/controller/UmsAdminController.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/service/MassagistIdentityTest.java`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/controller/AdminInfoTrainerTest.java`

- [ ] **Step 1: `saveOrUpd` 保留与清理身份**

在 `Massagist persisted = ...` 之后、`saveOrUpdate` 之前：

```java
Integer incomingTrainer = massagist.getIsTrainer();
Integer trainerFlag;
if (incomingTrainer == null) {
    trainerFlag = isSave ? 0 : persisted.getIsTrainer();
} else {
    trainerFlag = incomingTrainer;
}
if (trainerFlag == null) trainerFlag = 0;
massagist.setIsTrainer(trainerFlag);
if (Integer.valueOf(1).equals(trainerFlag)) {
    if (isSave || persisted.getTrainerSince() == null) {
        massagist.setTrainerSince(LocalDate.now());
    } else {
        massagist.setTrainerSince(persisted.getTrainerSince());
    }
} else {
    massagist.setTrainerSince(null);
}
```

`saveOrUpdate(massagist)` 之后，若本次是关闭内训师，再显式清空该列（避免依赖全局 null 更新策略误伤其他更新）：

```java
if (!Integer.valueOf(1).equals(trainerFlag)) {
    update(new com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper<Massagist>()
            .eq("id", massagist.getId())
            .set("trainer_since", null));
}
```

同时把 `buildUmsAdminUsername` 升级为 `buildIdentity`：

```java
public void buildUmsAdminUsername(List<Massagist> list) {
    if (CollectionUtils.isEmpty(list)) return;
    List<Long> adminIds = list.stream().filter(e -> !ObjUtil.isEmpty(e.getUmsAdminId()))
            .map(Massagist::getUmsAdminId).collect(Collectors.toList());
    Map<Long, UmsAdmin> admins = adminIds.isEmpty() ? Collections.emptyMap()
            : umsAdminService.listByIds(adminIds).stream()
            .collect(Collectors.toMap(UmsAdmin::getId, e -> e));
    Set<Long> managers = approvalShopManagerService.managerMassagistIds(
            list.stream().map(Massagist::getId).collect(Collectors.toList()));
    list.forEach(e -> {
        UmsAdmin admin = admins.get(e.getUmsAdminId());
        e.setUmsAdminUsername(admin == null ? null : admin.getUsername());
        e.setShopManager(managers.contains(e.getId()));
        e.setTrainerAccountReady(admin != null && Integer.valueOf(1).equals(admin.getStatus()));
    });
}
```

- [ ] **Step 2: 列表身份筛选**

`buildWrapper`：

```java
QueryWrapper<Massagist> wrapper = WrapperBuilder.init(queryWrapper, params)
        .like("name").in("status").equal("shop_id").getQueryWrapper();
Object identity = params.get("identity");
if ("trainer".equals(identity)) {
    wrapper.eq("is_trainer", 1);
} else if ("manager".equals(identity)) {
    wrapper.exists("SELECT 1 FROM f_approval_shop_manager x WHERE x.massagist_id = s_massagist.id");
} else if ("trainer_pending_account".equals(identity)) {
    wrapper.eq("is_trainer", 1).and(w -> w.isNull("ums_admin_id").or().eq("ums_admin_id", 0));
}
return wrapper;
```

- [ ] **Step 3: `/admin/info` 返回身份**

`UmsAdminController` 注入 `MassagistService` 与 `TrainingTeamCertProperties`，`/info` 与 `/infoNew` 都加：

```java
boolean trainer = false;
boolean shopManager = false;
Long massagistId = umsAdmin.getMassagistId();
if (massagistId != null) {
    Massagist massagist = massagistService.getById(massagistId);
    trainer = teamCertProperties.enabled() && massagist != null
            && Integer.valueOf(1).equals(massagist.getIsTrainer())
            && Integer.valueOf(1).equals(massagist.getStatus());
    shopManager = massagist != null
            && approvalShopManagerService.findByMassagistId(massagistId) != null;
}
data.put("trainer", trainer);
data.put("shopManager", shopManager);
```

- [ ] **Step 4: 测试**

```java
@Test void turningTrainerOffClearsSince()
@Test void omittingFlagOnUpdatePreservesPersistedValue()
@Test void turningTrainerOnSetsTodayOnlyOnce()
@Test void identityFilterBuildsTrainerAndManagerSql()
@Test void adminInfoHidesTrainerWhenFeatureOff()
@Test void adminInfoMarksTrainerOnlyWhenActive()
```

- [ ] **Step 5: 跑测试**

```bash
mvn -pl mall-admin -am -Dtest='MassagistIdentityTest,AdminInfoTrainerTest' -DfailIfNoTests=false test
```

Expected: 6 个测试通过。

- [ ] **Step 6: 后端阶段检查点**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-server
mvn -pl mall-admin -am -DskipTests compile
mvn -pl mall-admin -am -Dtest='Training*,Trainer*,MassagistIdentityTest,AdminInfoTrainerTest,TrainingRecordPageTest,TrainingCalculatorTest,AdminShopContextTest,SchedulePermissionTest' -DfailIfNoTests=false test
```

Expected: 全部通过。若有旧测试因 `trainingViews` 新参数失败，只更新测试装配，不放宽断言。

---

## 阶段 3：前端接入（任务 12–17）

### Task 12: API、路由、Vuex 与入口

**Files:**
- Modify: `tou-mall-admin-web/src/api/incentive.js`
- Modify: `tou-mall-admin-web/src/router/index.js`
- Modify: `tou-mall-admin-web/src/store/modules/user.js`
- Modify: `tou-mall-admin-web/src/store/getters.js`
- Modify: `tou-mall-admin-web/src/views/layout/components/Navbar.vue`
- Test: `tou-mall-admin-web/tests/trainerAssessRoute.test.mjs`

- [ ] **Step 1: API 增加方法**

```js
  trainerProfile() {
    return request({url: '/incentive/trainer/profile', method: 'get'})
  },
  trainerTherapists(params) {
    return request({url: '/incentive/trainer/therapists', method: 'get', params})
  },
  trainerProjects(params) {
    return request({url: '/incentive/trainer/projects', method: 'get', params})
  },
  submitAssessment(data) {
    return request({url: '/incentive/trainer/assessments', method: 'post', data})
  },
  myAssessments(params) {
    return request({url: '/incentive/trainer/assessments', method: 'get', params})
  },
  assessmentRecords(params) {
    return request({url: '/incentive/training-assessments', method: 'get', params})
  },
  assessmentSummary(params) {
    return request({url: '/incentive/training-assessments/summary', method: 'get', params})
  },
  assessmentDetail(params) {
    return request({url: '/incentive/training-assessments/detail', method: 'get', params})
  },
  voidAssessment(id, data) {
    return request({url: `/incentive/training-assessments/${id}/void`, method: 'post', data})
  },
  revokeCert(certId, data) {
    return request({url: `/incentive/training-records/${certId}/revoke`, method: 'post', data})
  },
  manualCert(data) {
    return request({url: '/incentive/training-records/manual', method: 'post', data})
  },
  exportAssessments(params) {
    return request({url: '/incentive/training-assessments/export', method: 'get', params, responseType: 'blob'})
  },
  exportCertifications(params) {
    return request({url: '/incentive/training-certifications/export', method: 'get', params, responseType: 'blob'})
  },
```

- [ ] **Step 2: 路由**

`constantRouterMap` 在 `/my-rewards` 后加：

```js
  {path: '/trainer-assess', component: () => import('@/views/incentive/trainer/index'), hidden: true},
```

- [ ] **Step 3: Vuex**

`user.js` state 增加 `trainer: false`，mutation：

```js
    SET_TRAINER: (state, trainer) => {
      state.trainer = !!trainer
    },
```

`GetInfo` 在 `SET_MASSAGIST_ID` 后：

```js
          commit('SET_TRAINER', data.trainer)
```

`getters.js` 增加 `trainer: state => state.user.trainer`。

- [ ] **Step 4: Navbar**

```vue
          <router-link v-if="trainer" class="inlineBlock" to="/trainer-assess">
            <el-dropdown-item>
              内训考核
            </el-dropdown-item>
          </router-link>
```

`mapGetters` 增加 `'trainer'`。

- [ ] **Step 5: 测试**

`tests/trainerAssessRoute.test.mjs` 读取源码并断言：

```js
test('trainer route is hidden and outside admin layout', () => {
  const router = read('../src/router/index.js');
  assert.match(router, /path: '\/trainer-assess'/);
  assert.match(router, /views\/incentive\/trainer\/index/);
  const line = router.split('\n').find(l => l.includes("'/trainer-assess'"));
  assert.match(line, /hidden: true/);
  assert.doesNotMatch(line, /Layout/);
});
test('navbar only shows trainer entry for trainers', () => {
  const nav = read('../src/views/layout/components/Navbar.vue');
  assert.match(nav, /v-if="trainer"/);
  assert.match(nav, /内训考核/);
});
test('store clears trainer flag on logout', () => {
  const store = read('../src/store/modules/user.js');
  assert.match(store, /SET_TRAINER/);
  assert.match(store, /data\.trainer/);
});
```

- [ ] **Step 6: 跑测试**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-admin-web
node --test tests/trainerAssessRoute.test.mjs
```

Expected: 3 个测试通过。

---

### Task 13: 内训师手机 H5 考核页

**Files:**
- Create: `tou-mall-admin-web/src/views/incentive/trainer/index.vue`
- Test: `tou-mall-admin-web/tests/trainerAssessPage.test.mjs`

**页面结构：** 单列移动端，顶部返回后台；身份卡；搜索并选择疗愈师；项目胶囊（待考核/已认证，已认证不可点）；日期、结果、备注；提交；底部“我的提交”。

- [ ] **Step 1: 页面实现**

```vue
<template>
  <div class="ta-page">
    <header class="ta-top">
      <router-link to="/" class="ta-back">‹ 返回后台</router-link>
      <div class="ta-title">内训考核</div>
      <div class="ta-sub">每一步都算数</div>
    </header>

    <main class="ta-main">
      <section class="ta-card ta-profile" v-if="profile">
        <div>
          <div class="ta-name">{{ profile.trainerName }}</div>
          <div class="ta-muted">{{ profile.shopName || '未分配门店' }} · 内训师</div>
        </div>
        <div class="ta-count">
          <b>{{ profile.monthSubmissions }}</b>
          <span>本月已提交</span>
        </div>
      </section>

      <section class="ta-card">
        <div class="ta-step">01 选择疗愈师</div>
        <div class="ta-search">
          <input v-model="keyword" @keyup.enter="loadTherapists" placeholder="搜索姓名">
          <button @click="loadTherapists">搜索</button>
        </div>
        <div class="ta-people" v-if="therapists.length">
          <button v-for="p in therapists" :key="p.id" class="ta-person"
                  :class="{active: selectedTherapist && selectedTherapist.id === p.id}"
                  @click="chooseTherapist(p)">
            <span>{{ p.name }}</span>
            <small>{{ p.shopName || '未分配门店' }}</small>
          </button>
        </div>
        <div v-else class="ta-empty">没有找到在职疗愈师</div>
      </section>

      <section class="ta-card" v-if="selectedTherapist">
        <div class="ta-step">02 选择部位</div>
        <div class="ta-projects">
          <button v-for="p in projects" :key="p.projectKey" class="ta-project"
                  :class="{active: form.projectKey === p.projectKey, done: p.status === 'CERTIFIED'}"
                  :disabled="p.status === 'CERTIFIED'"
                  @click="chooseProject(p)">
            <span>{{ p.projectName }}</span>
            <small>{{ p.statusLabel }}</small>
          </button>
        </div>
      </section>

      <section class="ta-card" v-if="form.projectKey">
        <div class="ta-step">03 记录结果</div>
        <label class="ta-label">考核日期</label>
        <input class="ta-input" type="date" v-model="form.assessDate" :max="today" :min="earliest">
        <label class="ta-label">结果</label>
        <div class="ta-result">
          <button :class="{active: form.result === 1}" @click="form.result = 1">通过</button>
          <button :class="{active: form.result === 0}" @click="form.result = 0">不通过</button>
        </div>
        <label class="ta-label">备注（选填）</label>
        <textarea class="ta-input" rows="3" maxlength="500" v-model="form.remark"
                  placeholder="例如：手法稳定，肩颈力度还需加强"></textarea>
        <button class="ta-submit" :disabled="submitting" @click="submit">
          {{ submitting ? '提交中…' : '提交考核' }}
        </button>
      </section>

      <section class="ta-card">
        <div class="ta-step-row">
          <div class="ta-step">我的提交</div>
          <input class="ta-month" type="month" v-model="month" @change="loadMine(1)">
        </div>
        <div v-if="mine.length" class="ta-mine">
          <div v-for="row in mine" :key="row.id" class="ta-mine-row">
            <div>
              <b>{{ row.massagistName }}</b>
              <span>{{ row.projectName }}</span>
            </div>
            <div class="ta-mine-right">
              <em :class="row.result === 1 ? 'ok' : 'no'">{{ row.resultLabel }}</em>
              <small>{{ row.assessDate }} · {{ row.auditStatus }}</small>
            </div>
          </div>
        </div>
        <div v-else class="ta-empty">本月还没有提交记录</div>
        <button v-if="mine.length < mineTotal" class="ta-more" @click="loadMine(minePage + 1)">加载更多</button>
      </section>
    </main>

    <div v-if="toast" class="ta-toast">{{ toast }}</div>
  </div>
</template>
```

脚本：

```js
import incentiveApi from '@/api/incentive'
import dayjs from 'dayjs'

export default {
  name: 'TrainerAssess',
  data() {
    return {
      profile: null,
      keyword: '',
      therapists: [],
      selectedTherapist: null,
      projects: [],
      form: {projectKey: '', assessDate: dayjs().format('YYYY-MM-DD'), result: 1, remark: ''},
      submitting: false,
      mine: [],
      mineTotal: 0,
      minePage: 1,
      mineSize: 20,
      month: dayjs().format('YYYY-MM'),
      toast: ''
    }
  },
  computed: {
    today() { return dayjs().format('YYYY-MM-DD') },
    earliest() { return dayjs().subtract(30, 'day').format('YYYY-MM-DD') }
  },
  created() {
    this.bootstrap()
  },
  methods: {
    async bootstrap() {
      try {
        const [profile, people, mine] = await Promise.all([
          incentiveApi.trainerProfile(),
          incentiveApi.trainerTherapists({}),
          incentiveApi.myAssessments({month: this.month, page: 1, size: this.mineSize})
        ])
        this.profile = profile.data
        this.therapists = people.data || []
        this.applyMine(mine.data, 1)
      } catch (e) {
        this.notify(this.messageOf(e, '加载失败，请稍后重试'))
      }
    },
    async loadTherapists() {
      const res = await incentiveApi.trainerTherapists({keyword: this.keyword})
      this.therapists = res.data || []
    },
    async chooseTherapist(person) {
      if (this.selectedTherapist && this.selectedTherapist.id === person.id) return
      this.selectedTherapist = person
      this.projects = []
      this.form.projectKey = ''
      const res = await incentiveApi.trainerProjects({massagistId: person.id})
      this.projects = res.data || []
    },
    chooseProject(project) {
      if (project.status === 'CERTIFIED') return
      this.form.projectKey = project.projectKey
    },
    async submit() {
      if (this.submitting) return
      if (!this.selectedTherapist) return this.notify('请先选择疗愈师')
      if (!this.form.projectKey) return this.notify('请选择考核部位')
      if (!this.form.assessDate) return this.notify('请选择考核日期')
      this.submitting = true
      try {
        const res = await incentiveApi.submitAssessment({
          massagistId: this.selectedTherapist.id,
          projectKey: this.form.projectKey,
          assessDate: this.form.assessDate,
          result: this.form.result,
          remark: this.form.remark
        })
        this.notify(res.data && res.data.certified ? '已记录，该项目已完成三人认证' : '已记录本次考核')
        this.form.projectKey = ''
        this.form.remark = ''
        await this.reloadAfterSubmit()
      } catch (e) {
        this.notify(this.messageOf(e, '提交失败，请稍后重试'))
      } finally {
        this.submitting = false
      }
    },
    async reloadAfterSubmit() {
      const [profile, projects, mine] = await Promise.all([
        incentiveApi.trainerProfile(),
        this.selectedTherapist ? incentiveApi.trainerProjects({massagistId: this.selectedTherapist.id}) : Promise.resolve({data: []}),
        incentiveApi.myAssessments({month: this.month, page: 1, size: this.mineSize})
      ])
      this.profile = profile.data
      this.projects = projects.data || []
      this.applyMine(mine.data, 1)
    },
    async loadMine(page) {
      const res = await incentiveApi.myAssessments({month: this.month, page, size: this.mineSize})
      this.applyMine(res.data, page)
    },
    applyMine(data, page) {
      const list = (data && data.list) || []
      this.mine = page === 1 ? list : this.mine.concat(list)
      this.mineTotal = (data && data.total) || 0
      this.minePage = page
    },
    messageOf(e, fallback) {
      return (e && e.response && e.response.data && e.response.data.message) || fallback
    },
    notify(message) {
      this.toast = message
      clearTimeout(this.toastTimer)
      this.toastTimer = setTimeout(() => { this.toast = '' }, 2600)
    }
  },
  beforeDestroy() {
    clearTimeout(this.toastTimer)
    this.destroyed = true
  }
}
```

样式（`scoped`，不复用 mobile 页面的 scoped 类）：

```css
.ta-page { min-height: 100vh; background: #f5f6ee; color: #2f2b22; padding-bottom: 40px; }
.ta-top { padding: 18px 20px 26px; background: linear-gradient(160deg, #2f3a2c, #4c5a42); color: #f5f6ee; }
.ta-back { color: #d9dfcf; text-decoration: none; font-size: 13px; letter-spacing: .05em; }
.ta-title { margin-top: 16px; font-size: 26px; letter-spacing: .06em; }
.ta-sub { margin-top: 4px; font-size: 12px; color: #c7d0bd; letter-spacing: .12em; }
.ta-main { padding: 14px 14px 0; display: grid; gap: 12px; }
.ta-card { background: #fffdf7; border-radius: 16px; padding: 16px; box-shadow: 0 6px 18px rgba(47,58,44,.06); }
.ta-profile { display: flex; justify-content: space-between; align-items: center; }
.ta-name { font-size: 18px; letter-spacing: .05em; }
.ta-muted { color: #8a877c; font-size: 12px; margin-top: 4px; }
.ta-count { text-align: right; color: #6b7562; font-size: 11px; }
.ta-count b { display: block; font-size: 26px; color: #3f4a37; }
.ta-step { font-size: 12px; letter-spacing: .12em; color: #8a877c; margin-bottom: 10px; }
.ta-step-row { display: flex; justify-content: space-between; align-items: center; }
.ta-search { display: flex; gap: 8px; margin-bottom: 10px; }
.ta-search input, .ta-input, .ta-month { flex: 1; border: 1px solid #e3e0d4; border-radius: 10px; padding: 10px 12px; background: #fff; font-size: 14px; }
.ta-search button, .ta-more { border: 0; border-radius: 10px; padding: 10px 14px; background: #e9ecdf; color: #3f4a37; }
.ta-people { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 260px; overflow: auto; }
.ta-person { text-align: left; border: 1px solid #e6e2d6; background: #fff; border-radius: 12px; padding: 10px; }
.ta-person span { display: block; font-size: 15px; }
.ta-person small { color: #9a978c; font-size: 11px; }
.ta-person.active { border-color: #4c5a42; box-shadow: inset 0 0 0 1px #4c5a42; }
.ta-projects { display: flex; flex-wrap: wrap; gap: 8px; }
.ta-project { border: 1px solid #e6e2d6; background: #fff; border-radius: 999px; padding: 8px 12px; font-size: 13px; }
.ta-project small { margin-left: 6px; color: #9a978c; font-size: 10px; }
.ta-project.active { background: #4c5a42; color: #f5f6ee; border-color: #4c5a42; }
.ta-project.active small { color: #d9dfcf; }
.ta-project.done { background: #f0f1e8; color: #a3a294; text-decoration: line-through; }
.ta-label { display: block; font-size: 12px; color: #8a877c; margin: 12px 0 6px; }
.ta-result { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ta-result button { border: 1px solid #e6e2d6; background: #fff; border-radius: 10px; padding: 12px; font-size: 15px; }
.ta-result button.active { background: #4c5a42; color: #f5f6ee; border-color: #4c5a42; }
.ta-submit { width: 100%; margin-top: 16px; border: 0; border-radius: 12px; padding: 14px; background: #3f4a37; color: #f5f6ee; font-size: 16px; letter-spacing: .08em; }
.ta-submit[disabled] { opacity: .6; }
.ta-mine-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eeeadd; font-size: 13px; }
.ta-mine-row span { display: block; color: #8a877c; font-size: 11px; margin-top: 3px; }
.ta-mine-right { text-align: right; }
.ta-mine-right em { font-style: normal; font-size: 12px; }
.ta-mine-right em.ok { color: #4f6b3f; }
.ta-mine-right em.no { color: #a35c4a; }
.ta-mine-right small { display: block; color: #9a978c; font-size: 10px; margin-top: 3px; }
.ta-empty { color: #9a978c; font-size: 13px; padding: 14px 0; text-align: center; }
.ta-more { width: 100%; margin-top: 12px; }
.ta-toast { position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); background: rgba(47,43,34,.92); color: #f5f6ee; padding: 10px 16px; border-radius: 999px; font-size: 13px; max-width: 80vw; text-align: center; }
```

- [ ] **Step 2: Node 测试**

`tests/trainerAssessPage.test.mjs` 用 vm 加载脚本并断言：

```js
test('certified project cannot be selected again', () => {
  const {state} = setup(); state.chooseProject({projectKey: 'a', status: 'CERTIFIED'});
  assert.equal(state.form.projectKey, '');
});
test('submit sends only target project date result remark', async () => {
  const {state, calls} = setup(); // mock trainerProfile/trainerTherapists/myAssessments/submitAssessment
  state.selectedTherapist = {id: 7}; state.form = {projectKey: 'sujin_head', assessDate: '2026-11-09', result: 1, remark: 'ok'};
  await state.submit();
  assert.deepEqual(Object.keys(calls[0]).sort(), ['assessDate', 'massagistId', 'projectKey', 'remark', 'result']);
  assert.equal(calls[0].massagistId, 7);
});
test('double tap submits once', async () => { /* pending promise；两次 submit 只发一次 */ });
test('blind page never renders pass or fail counts', () => {
  assert.doesNotMatch(source, /passCount|failCount|通过人数|考核次数/);
  assert.match(source, /本月已提交/);
});
test('date input is limited to last 30 days and today', () => {
  assert.match(source, /:max="today"/);
  assert.match(source, /:min="earliest"/);
  assert.match(source, /subtract\(30, 'day'\)/);
});
test('failure message shows server business copy', async () => { /* throw {response:{data:{message:'最多补记30天内的考核'}}} -> toast */ });
```

- [ ] **Step 3: 跑测试**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-admin-web
node --test tests/trainerAssessRoute.test.mjs tests/trainerAssessPage.test.mjs
```

Expected: 9 个测试通过。

---

### Task 14: 管理端三页签外壳与认证详情抽屉

**Files:**
- Create: `tou-mall-admin-web/src/views/incentive/training/components/AssessmentDrawer.vue`
- Create: `tou-mall-admin-web/src/views/incentive/training/components/ManualCertDialog.vue`
- Modify: `tou-mall-admin-web/src/views/incentive/training/index.vue`
- Test: `tou-mall-admin-web/tests/incentiveTraining.test.mjs`（改造）

- [ ] **Step 1: 三页签外壳**

`index.vue` 模板外层改为：

```vue
<el-tabs v-model="tab" class="training-tabs">
  <el-tab-pane label="认证矩阵" name="matrix">
    <!-- 原有页面头、筛选、汇总卡、矩阵表全部放这里，逻辑不变 -->
  </el-tab-pane>
  <el-tab-pane label="考核记录" name="records" lazy>
    <assessment-records :shops="shops" :projects="projects" :super-admin="superAdmin" />
  </el-tab-pane>
  <el-tab-pane label="考核分析" name="analytics" lazy>
    <assessment-analytics :shops="shops" />
  </el-tab-pane>
</el-tabs>
```

`data` 增加 `tab: 'matrix'`。`computed`：

```js
    superAdmin() {
      return (this.roles || []).includes('超级管理员')
    }
```

`roles` 从 Vuex `mapGetters(['shopId','projectList','roles'])`。

矩阵页头部保留“导出”按钮，并增加：

```vue
<el-button v-if="superAdmin" size="small" @click="manualVisible = true">人工特批</el-button>
```

- [ ] **Step 2: 认证详情抽屉**

`AssessmentDrawer.vue`：

```vue
<template>
  <el-drawer :visible.sync="innerVisible" size="520px" :title="title" @open="load">
    <div v-loading="loading" class="ad-body">
      <div class="ad-meta" v-if="detail">
        <div><b>{{ detail.massagistName }}</b><span>{{ detail.shopName }}</span></div>
        <el-tag :type="detail.certId ? 'success' : 'info'">
          {{ detail.certId ? '已认证' : '未认证' }}
        </el-tag>
      </div>
      <div class="ad-cert" v-if="detail && detail.certId">
        <p>通过日期：{{ detail.passedAt }}</p>
        <p>认证来源：{{ sourceLabel(detail.certSource) }}</p>
        <p>认证时间：{{ detail.certifiedAt || '-' }}</p>
        <p>团队人数：{{ detail.teamSize || 0 }}</p>
        <el-button v-if="superAdmin" type="danger" size="mini" @click="revoke">撤销认证</el-button>
      </div>
      <el-timeline class="ad-timeline">
        <el-timeline-item v-for="v in (detail ? detail.votes : [])" :key="v.id"
                          :timestamp="v.assessDate + ' · ' + (v.voided ? '已作废' : '有效')"
                          :color="v.result === 1 ? '#4f6b3f' : '#a35c4a'">
          <div class="ad-vote">
            <b>{{ v.trainerName }}</b>
            <span>{{ v.result === 1 ? '通过' : '不通过' }}</span>
          </div>
          <small>{{ v.trainerShopName || '未知门店' }} · 提交 {{ v.submittedAt }}</small>
          <p v-if="v.remark">{{ v.remark }}</p>
          <p v-if="v.voided" class="ad-void">作废原因：{{ v.voidReason }}</p>
          <el-button v-if="superAdmin && !v.voided" size="mini" @click="voidVote(v)">作废</el-button>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-if="detail && !detail.votes.length" description="暂无考核记录"></el-empty>
    </div>
  </el-drawer>
</template>
```

脚本关键方法（顶部先 `import incentiveApi from '@/api/incentive'`）：

```js
  props: {visible: Boolean, massagistId: [Number, String], projectKey: String, superAdmin: Boolean},
  data() { return {loading: false, detail: null} },
  computed: {
    innerVisible: {
      get() { return this.visible },
      set(v) { this.$emit('update:visible', v) }
    },
    title() { return this.detail ? this.detail.projectName + ' · 考核明细' : '考核明细' }
  },
  methods: {
    async load() {
      if (!this.massagistId || !this.projectKey) return
      this.loading = true
      try {
        const res = await incentiveApi.assessmentDetail({massagistId: this.massagistId, projectKey: this.projectKey})
        this.detail = res.data
      } finally { this.loading = false }
    },
    async revoke() {
      const reason = await this.promptReason('撤销认证后，该项目所有考核记录将作废，奖励会按未认证重算。')
      if (!reason) return
      await incentiveApi.revokeCert(this.detail.certId, {reason})
      this.$message.success('认证已撤销')
      this.$emit('changed')
      this.innerVisible = false
    },
    async voidVote(vote) {
      const reason = await this.promptReason('作废后该票不再参与三人认证。')
      if (!reason) return
      await incentiveApi.voidAssessment(vote.id, {reason})
      this.$message.success('考核记录已作废')
      this.$emit('changed')
      await this.load()
    },
    promptReason(tip) {
      return this.$prompt(tip, '请填写原因', {
        inputType: 'textarea',
        inputValidator: v => !!(v && v.trim()) || '原因不能为空',
        closeOnClickModal: false
      }).then(({value}) => value.trim()).catch(() => null)
    },
    sourceLabel(s) { return s === 'TEAM' ? '三人认证' : s === 'MANUAL' ? '人工特批' : '历史登记' }
  }
```

- [ ] **Step 3: 矩阵单元格打开抽屉**

`index.vue` 中删除旧证书弹窗（模板与 `saveCert/deleteCert/resetForm` 相关部分），改为：

```vue
<assessment-drawer :visible.sync="drawerVisible" :massagist-id="drawerRowId"
                   :project-key="drawerProjectKey" :super-admin="superAdmin"
                   @changed="loadData"></assessment-drawer>
```

方法：

```js
    openCert(row, project) {
      this.drawerRowId = row.massagistId
      this.drawerProjectKey = project.projectKey
      this.drawerVisible = true
    }
```

单元格仍显示通过日期或“待认证”；增加小字 `{{ attemptOf(row, project) }}`，只显示次数（管理端可见）：

```js
    attemptOf(row, project) {
      const cert = this.certOf(row, project)
      return cert && cert.attemptCount ? `考核 ${cert.attemptCount} 次` : ''
    }
```

`certOf` 现在应返回带 `certId` 的条目；未认证但已有考核流水时也返回条目（用于次数），但 `passedAt` 为空。实现：

```js
    certOf(row, project) {
      return (row.certs || []).find(c => c.projectKey === project.projectKey) || null
    },
    cellClass(row, project) {
      const item = this.certOf(row, project)
      if (item && item.certId) return 'certified'
      if (item && item.attemptCount > 0) return 'pending has-attempt'
      return 'pending'
    }
```

- [ ] **Step 4: 人工特批弹窗**

`ManualCertDialog.vue`：表单选择疗愈师（复用 `incentiveApi.massagists`）、项目、通过日期、原因；`superAdmin` 由父页控制显示。提交调用 `manualCert`，成功 emit `changed`。原因为必填，前端校验与后端一致。

- [ ] **Step 5: 改造测试**

保留原 `incentiveTraining.test.mjs` 中与分页、筛选、防抖、竞态、销毁相关的用例；替换旧弹窗用例为：

```js
test('three tabs exist and records/analytics are lazy', () => {
  assert.match(source, /label="认证矩阵"/);
  assert.match(source, /label="考核记录"/);
  assert.match(source, /label="考核分析"/);
  assert.match(source, /lazy/);
});
test('matrix opens detail drawer instead of legacy edit dialog', () => {
  const {state} = setup(); state.openCert(fixtureRow(), {projectKey: 'head60'});
  assert.equal(state.drawerVisible, true);
  assert.equal(state.drawerRowId, 7);
  assert.equal(state.drawerProjectKey, 'head60');
});
test('non super admin sees no manual or revoke entry', () => {
  const {state} = setup(); state.roles = ['运营'];
  assert.equal(state.superAdmin, false);
});
test('cell shows attempt count without leaking verdict copy', () => {
  const {state} = setup();
  const row = {massagistId: 7, certs: [{projectKey: 'head60', certId: null, attemptCount: 2}]};
  assert.equal(state.cellClass(row, {projectKey: 'head60'}), 'pending has-attempt');
});
```

- [ ] **Step 6: 跑测试**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-admin-web
node --test tests/incentiveTraining.test.mjs
```

Expected: 原有有效用例 + 新增用例全部通过。旧“仅运营可编辑证书”的行为断言删除，改为“仅超管可特批/撤销”。

---

### Task 15: 考核记录页签

**Files:**
- Create: `tou-mall-admin-web/src/views/incentive/training/components/AssessmentRecords.vue`
- Test: `tou-mall-admin-web/tests/assessmentRecords.test.mjs`

- [ ] **Step 1: 组件**

筛选：月份、门店、结果、项目、内训师、疗愈师姓名；按钮：查询、重置、导出明细、导出认证台账。顶部 `import {saveAs} from 'file-saver'` 与 `import incentiveApi from '@/api/incentive'`。

表格列：考核日期、门店、疗愈师、项目、结果、内训师、内训师门店、提交时间、备注、操作（超管可“作废”）。

关键方法：

```js
    async load(page = 1) {
      const requestId = ++this.requestId
      this.loading = true
      try {
        const res = await incentiveApi.assessmentRecords({
          month: this.month, shopId: this.shopId || undefined,
          trainerId: this.trainerId || undefined, massagistId: this.massagistId || undefined,
          projectKey: this.projectKey || undefined, result: this.result,
          page, size: this.size
        })
        if (requestId !== this.requestId) return
        this.rows = res.data.list || []
        this.total = res.data.total || 0
        this.page = page
      } finally {
        if (requestId === this.requestId) this.loading = false
      }
    },
    async doExport(kind) {
      const res = kind === 'cert'
        ? await incentiveApi.exportCertifications({month: this.month, shopId: this.shopId})
        : await incentiveApi.exportAssessments({month: this.month, shopId: this.shopId,
            trainerId: this.trainerId || undefined, projectKey: this.projectKey || undefined, result: this.result})
      const filename = kind === 'cert' ? `培训认证台账-${this.month}.csv` : `内训考核明细-${this.month}.csv`
      saveAs(new Blob([res.data], {type: 'text/csv;charset=utf-8'}), filename)
    },
    async doVoid(row) {
      const {value} = await this.$prompt('作废后该票不参与三人认证。', '请填写原因', {
        inputType: 'textarea', inputValidator: v => !!(v && v.trim()) || '原因不能为空'
      })
      await incentiveApi.voidAssessment(row.id, {reason: value.trim()})
      this.$message.success('考核记录已作废')
      this.load(this.page)
    }
```

导出使用 `file-saver` 的 `saveAs`，与现有页面一致。

- [ ] **Step 2: 测试**

```js
test('filters reset page to one')
test('stale records response cannot overwrite newer filter')
test('export sends current filters and correct endpoint kind')
test('void action only rendered for super admin')
test('void requires non-empty reason before request')
```

- [ ] **Step 3: 跑测试**

```bash
node --test tests/assessmentRecords.test.mjs
```

Expected: 5 个测试通过。

---

### Task 16: 考核分析页签

**Files:**
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/dto/TrainingAssessmentSummary.java`
- Modify: `tou-mall-server/mall-admin/src/main/java/com/macro/mall/incentive/calc/TrainingAnalyticsCalculator.java`
- Create: `tou-mall-admin-web/src/views/incentive/training/components/AssessmentAnalytics.vue`
- Test: `tou-mall-server/mall-admin/src/test/java/com/macro/mall/incentive/calc/TrainingAnalyticsCalculatorTest.java`（补充）
- Test: `tou-mall-admin-web/tests/assessmentAnalytics.test.mjs`

- [ ] **Step 1: 补“反复失败”和“积压”名单**

`TrainingAssessmentSummary` 增加：

```java
    private List<TargetMetric> repeatedTargets = new ArrayList<>();
    private List<TargetMetric> backlogTargets = new ArrayList<>();

    @Getter @Setter public static class TargetMetric {
        private Long massagistId;
        private String massagistName;
        private String shopName;
        private String projectKey;
        private String projectName;
        private long attemptCount;
        private long failCount;
        private LocalDate lastAssessDate;
    }
```

计算器：按 `(massagistId, projectKey)` 聚合未作废票；无认证时 `failCount >= 2` 进入 `repeatedTargets`，其余进入 `backlogTargets`；各自按 `failCount desc, lastAssessDate desc` 排序并 `limit 50`。

- [ ] **Step 2: 分析页**

顶部月份 + 门店筛选、导出按钮；六张指标卡：提交数、通过率、已认证、平均尝试次数、平均认证天数、反复失败人数。

四个区块：

1. 项目分布表：项目、提交、通过、不通过、通过率。
2. 内训师表现表：内训师、提交、通过、不通过、通过率、失败率；失败率 >= 80% 且提交 >= 3 标红提示“长期未通过”。
3. 门店分布表：门店、提交、已认证。
4. 反复失败名单与未认证积压名单：疗愈师、门店、项目、考核次数、失败次数、最后考核日。

月度趋势用 CSS 柱状条，不引入新图表库：

```vue
<div class="trend">
  <div v-for="m in summary.monthlyTrend" :key="m.month" class="trend-col">
    <div class="trend-bar" :style="{height: trendHeight(m.total)}"></div>
    <small>{{ m.month.slice(5) }}</small>
  </div>
</div>
```

- [ ] **Step 3: 测试**

后端补充：

```java
@Test void repeatedTargetsAreCappedAndSortedByFailures()
@Test void certifiedTargetNeverAppearsInBacklog()
```

前端：

```js
test('high failure trainer is flagged only with enough submissions')
test('analytics never computes money or reward amounts')
test('summary request carries month and scoped shop')
test('export uses summary filters')
```

- [ ] **Step 4: 跑测试**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-server
mvn -pl mall-admin -am -Dtest=TrainingAnalyticsCalculatorTest -DfailIfNoTests=false test
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-admin-web
node --test tests/assessmentAnalytics.test.mjs
```

Expected: 后端 8 个、前端 4 个测试通过。

---

### Task 17: 疗愈师管理页身份展示与编辑

**Files:**
- Modify: `tou-mall-admin-web/src/views/massagist/management/index.vue`
- Modify: `tou-mall-admin-web/src/views/massagist/management/MassagistForm.vue`
- Test: `tou-mall-admin-web/tests/massagistIdentity.test.mjs`

- [ ] **Step 1: 列表**

筛选栏增加：

```vue
<el-select v-model="listQuery.identity" clearable placeholder="身份" size="small" @change="handleFilter">
  <el-option label="内训师" value="trainer"></el-option>
  <el-option label="店长" value="manager"></el-option>
  <el-option label="内训师待开通账号" value="trainer_pending_account"></el-option>
</el-select>
```

表格“姓名”后增加身份列：

```vue
<el-table-column label="身份" width="150">
  <template slot-scope="scope">
    <el-tag v-if="scope.row.shopManager" size="mini" type="warning">店长</el-tag>
    <el-tag v-if="scope.row.isTrainer === 1" size="mini" type="success">内训师</el-tag>
    <el-tag v-if="scope.row.isTrainer === 1 && scope.row.trainerAccountReady === false"
            size="mini" type="danger">待开通账号</el-tag>
    <span v-if="!scope.row.shopManager && scope.row.isTrainer !== 1" class="muted">—</span>
  </template>
</el-table-column>
```

`listQuery` 默认增加 `identity: ''`；`getList` 传参时把空字符串转 `undefined`，避免后端收到空筛选。

- [ ] **Step 2: 编辑弹窗**

在“在职状态”后增加：

```vue
<el-form-item label="内训师" prop="isTrainer">
  <el-switch v-model="form.isTrainer" :active-value="1" :inactive-value="0"></el-switch>
  <span class="form-tip">开启后可在手机端“内训考核”提交三人认证考核。</span>
  <div v-if="form.isTrainer === 1 && !form.umsAdminId" class="form-tip warn">
    该疗愈师尚未关联后台账号，需先在人员账号中开通并关联后才能登录考核。
  </div>
</el-form-item>
```

`form` 初始化时 `isTrainer: form.isTrainer == null ? 0 : form.isTrainer`。`onSubmit` 原样提交 `isTrainer`。

- [ ] **Step 3: 测试**

```js
test('list sends identity filter and omits empty value')
test('identity tags distinguish manager trainer and missing account')
test('form submits isTrainer zero or one')
test('missing account warning only shows for trainer without umsAdminId')
```

- [ ] **Step 4: 跑测试**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-admin-web
node --test tests/massagistIdentity.test.mjs
```

Expected: 4 个测试通过。

---

## 阶段 4：测试环境验收（任务 18）

### Task 18: 全量构建、测试库演练与验收

> 验收记录：`2026-11-09-therapist-training-assessment-acceptance.md`（2026-11-10 完成）。


**Files:**
- Create: `docs/superpowers/plans/2026-11-09-therapist-training-assessment-acceptance.md`（验收记录，执行后填写实际结果）

- [x] **Step 1: 后端全量测试（排除 OSS）**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-server
mvn -pl mall-admin -am test -Dtest='!OssServiceImplTest' -DfailIfNoTests=false
```

Expected: `BUILD SUCCESS`，无失败。若该排除语法在当前 Surefire 版本不生效，改用显式包含本计划涉及测试类 + 既有 `AdminShopContextTest`、`SchedulePermissionTest`、`TrainingCalculatorTest`，并记录“未跑全量”的原因。

- [x] **Step 2: 前端构建与全部 Node 测试**

```bash
cd /Users/th/Desktop/Full愈-轻疗/tou-mall-admin-web
node --test tests/*.test.mjs
npm run build:test
```

Expected: Node 测试全部通过；`dist/` 生成成功。构建日志中不得出现 `Module not found`、`Unexpected token`。

- [x] **Step 3: 只对 `tou_mall_test` 执行迁移**

```bash
mysql -h <test-host> -u <user> -p tou_mall_test < sql/2026-11-09-training-team-cert.sql
mysql -h <test-host> -u <user> -p tou_mall_test -e "
SHOW COLUMNS FROM s_massagist LIKE 'is_trainer';
SHOW COLUMNS FROM s_massagist_training_cert LIKE 'source';
SHOW TABLES LIKE 's_massagist_training_assessment';"
```

Expected: 三个对象都存在。再重复执行一次脚本，Expected: 无报错（幂等）。

禁止对 `tou_mall_current`、`tou_mall_demo` 执行。

- [x] **Step 4: 测试环境开关**

测试服务器只加环境变量，不改生产配置：

```bash
INCENTIVE_TEAM_CERT_ENABLED=true
```

重启后登录 `/admin/info` 检查：内训师账号返回 `trainer: true`；普通疗愈师返回 `false`；开关移除后返回 `false`。

- [x] **Step 5: 造一条完整三人认证链路**

在测试环境：

1. 运营在人员管理把 A、B、C 设为内训师，确认三人都有可登录后台账号。
2. 选一位未认证疗愈师 X，选一个未认证项目。
3. A、B 各提交一次“通过”，此时矩阵应显示“考核 2 次”、仍为待认证。
4. C 提交“通过”，考核日期设为三人中最后一天。
5. 验证：X 的该项目出现认证；`passed_at` 等于 C 填写的日期；`source=TEAM`、`team_size=3`；`TEAM_CERTIFY` 日志存在。
6. 打开 X 的个人奖励页，确认培训奖励从 `passed_at + 1` 起算，金额与旧逻辑一致。

- [x] **Step 6: 盲考与锁定验证**

1. 用 A 的账号打开 `/trainer-assess`：只能看到 X 的项目“已认证”，看不到通过人数、内训师姓名、失败记录。
2. A 再对 X 的该项目提交：应提示“该疗愈师该项目已认证，无需再考核”。
3. 用 A 对 X 的另一个未认证项目提交“不通过”，再在 10 分钟内重复提交：应提示“请勿重复提交”。
4. 选择 31 天前的日期：应提示“最多补记30天内的考核”。
5. 尝试给自己考核：应提示“不能给自己做考核”。

- [x] **Step 7: 撤销、作废与人工特批**

1. 超管在矩阵抽屉撤销 X 的项目认证，填写原因：认证消失；该项目所有流水 `voided=1`；奖励回到未认证状态；`REVOKE` 日志存在。
2. 超管对另一项目人工特批，填写原因：认证来源显示“人工特批”，团队人数 0，`MANUAL_CERTIFY` 日志存在。
3. 运营账号看不到人工特批/撤销按钮；直接调接口应返回“仅超级管理员可执行该操作”（HTTP 200，业务 message）。
4. 店长账号可看授权门店的矩阵、记录、分析；换未授权门店应返回“无权查看该门店”。

- [x] **Step 8: 看板与导出**

1. 考核记录页筛选月份、门店、结果、项目、内训师，分页与总数一致。
2. 导出考核明细：Excel 打开中文不乱码；包含考核次数、失败记录、作废状态。
3. 导出认证台账：历史、三人、人工三种来源分别可见。
4. 分析页核对：通过率 = 通过票 / 总票；反复失败名单只含有 >=2 次失败且未认证的人；内训师失败率能看出“经常考核但从不通过”的人。
5. 记录总数、通过数、认证数与直接 SQL 查询结果一致。

- [x] **Step 9: 关闭开关回归**

移除 `INCENTIVE_TEAM_CERT_ENABLED` 并重启：

1. 内训师入口消失，`/trainer-assess` 接口返回“内训考核功能尚未开放”。
2. 原“培训考核”页仍可查看矩阵；运营仍能用旧“登记/删除”接口（如果保留入口），行为与上线前一致。
3. `TrainingCalculatorTest` 仍通过。

- [x] **Step 10: 填写验收记录**

在 `docs/superpowers/plans/2026-11-09-therapist-training-assessment-acceptance.md` 记录：执行时间、测试库、构建结果、每个验收项的实际结果、未通过项、回滚方式（关闭开关 + 保留新表，不删数据）。生产上线需用户单独授权，本计划到此为止。

---

## 自检结果

- **规格覆盖：** 身份（任务 1、11、17）、内训师入口（7、12、13）、三人认证与通过日期（4、5、6）、锁定与盲考（6、7、13）、跨店与数据范围（3、9）、30 天补记（6）、超管特批（5、8、14）、看板与导出（9、10、15、16）、奖励兼容（4、5、18）。
- **开关与生产边界：** 任务 3 默认 false；任务 18 只对 `tou_mall_test` 执行；生产部署不在计划内。
- **类型一致性：** `TrainingCertificationPolicy.Vote/Decision` 在任务 4 定义，任务 6 使用；`TrainingProjectConfig` 使用 `incentive.entity` 包；`TrainingAssessmentSummary` 在任务 9 定义，任务 16 追加名单字段。
- **已知限制：** `GlobalExceptionHandler` 不产生真实 HTTP 403，任务 18 按业务 message 验收；工作区非 git 仓库，未安排提交步骤。
