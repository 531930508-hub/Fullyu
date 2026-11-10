<template>
  <div class="app-container settings-page">
    <div class="page-head">
      <div>
        <h2>奖励参数与门店目标</h2>
        <p>参数按生效月份生成新版本，不回写历史月份；保存后从所选月份起适用。</p>
      </div>
      <div class="head-actions">
        <el-date-picker
          v-model="month"
          type="month"
          value-format="yyyy-MM"
          format="yyyy 年 MM 月"
          :clearable="false"
          placeholder="生效月份"
          @change="loadAll"/>
        <el-button size="small" icon="el-icon-back" @click="$router.push('/incentive/board')">返回看板</el-button>
      </div>
    </div>

    <div v-if="!isGlobal" class="readonly-tip">
      <i class="el-icon-view"></i>
      当前账号仅可查看参数与门店目标。保存参数、门店目标和登记考核需要运营/财务角色。
    </div>

    <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane label="奖励参数" name="config">
        <div class="config-toolbar">
          <div class="toolbar-note">
            <el-tag v-if="bundle.usingDefault" size="small" type="warning" effect="plain">系统默认参数</el-tag>
            <el-tag v-else size="small" type="success" effect="plain">已生效版本</el-tag>
            <span v-if="bundle.config">
              生效月 {{ bundle.config.effectiveMonth }} · 第 {{ bundle.config.revision }} 版
            </span>
          </div>
          <div>
            <el-button size="small" icon="el-icon-time" @click="openHistory">历史版本</el-button>
            <el-button
              size="small"
              type="primary"
              icon="el-icon-check"
              :disabled="!isGlobal"
              :loading="savingConfig"
              @click="saveConfig">
              保存为新版本
            </el-button>
          </div>
        </div>

        <div class="config-layout">
          <section class="config-card">
            <div class="card-title">
              <h3>基础接单奖励</h3>
              <span>左闭右开，达到起点即跳档；按单一档位系数计算，不分段累加。</span>
            </div>
            <el-form :inline="true" size="small" label-width="118px" class="base-form">
              <el-form-item label="新人合作期系数">
                <el-input-number v-model="form.newCoefficient" :min="0.01" :max="9.99" :step="0.1" :precision="2"/>
              </el-form-item>
              <el-form-item label="折算分钟起点">
                <span class="form-static">{{ coefficientStart }}</span>
              </el-form-item>
            </el-form>
            <el-table :data="form.coefficients" size="mini" border>
              <el-table-column label="起始分钟（含）" width="190">
                <template slot-scope="scope">
                  <el-input-number
                    v-model="scope.row.minMinutes"
                    :min="0"
                    :step="600"
                    :precision="0"
                    size="mini"
                    controls-position="right"
                    style="width: 150px"/>
                </template>
              </el-table-column>
              <el-table-column label="基础系数" width="160">
                <template slot-scope="scope">
                  <el-input-number
                    v-model="scope.row.coefficient"
                    :min="0.01"
                    :max="9.99"
                    :step="0.1"
                    :precision="2"
                    size="mini"
                    controls-position="right"
                    style="width: 125px"/>
                </template>
              </el-table-column>
              <el-table-column label="说明">
                <template slot-scope="scope">
                  <span class="row-hint">
                    {{ scope.row.minMinutes }} 分钟起 × {{ decimal(scope.row.coefficient) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="70" align="center">
                <template slot-scope="scope">
                  <el-button type="text" size="mini" @click="removeCoefficient(scope.$index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-button class="add-row" size="mini" icon="el-icon-plus" @click="addCoefficient">增加时长档位</el-button>
          </section>

          <section class="config-card">
            <div class="card-title">
              <h3>新客复购奖励</h3>
              <span>老客 60 天留存率达门槛后计入；30 天取最高档，不叠加；10 天按斐波那契单价逐位递增。</span>
            </div>
            <el-form :inline="true" size="small" label-width="128px" class="base-form">
              <el-form-item label="老客留存门槛">
                <el-input-number v-model="form.retentionThreshold" :min="0" :max="100" :step="1" :precision="0"/>
                <span class="unit">%</span>
              </el-form-item>
              <el-form-item label="新客最小样本">
                <el-input-number v-model="form.minNewSample" :min="1" :step="1" :precision="0"/>
                <span class="unit">人</span>
              </el-form-item>
            </el-form>
            <el-table :data="form.tiers" size="mini" border>
              <el-table-column label="复购率（%）" width="160">
                <template slot-scope="scope">
                  <el-input-number
                    v-model="scope.row.rate"
                    :min="0"
                    :max="100"
                    :step="1"
                    :precision="0"
                    size="mini"
                    controls-position="right"
                    style="width: 125px"/>
                </template>
              </el-table-column>
              <el-table-column label="档位奖励（元）" width="180">
                <template slot-scope="scope">
                  <el-input-number
                    v-model="scope.row.amount"
                    :min="0"
                    :step="100"
                    :precision="0"
                    size="mini"
                    controls-position="right"
                    style="width: 145px"/>
                </template>
              </el-table-column>
              <el-table-column label="说明">
                <template slot-scope="scope">
                  <span class="row-hint">复购率 ≥ {{ scope.row.rate }}% 时取本档</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="70" align="center">
                <template slot-scope="scope">
                  <el-button type="text" size="mini" @click="removeTier(scope.$index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-button class="add-row" size="mini" icon="el-icon-plus" @click="addTier">增加复购档位</el-button>
            <div class="fib-row">
              <span>斐波那契单价</span>
              <el-input-number v-model="form.fibA1" :min="0.01" :step="1" :precision="2" size="mini"/>
              <span class="join">,</span>
              <el-input-number v-model="form.fibA2" :min="0.01" :step="1" :precision="2" size="mini"/>
              <span class="join">起，单笔封顶</span>
              <el-input-number v-model="form.fibCap" :min="0.01" :step="10" :precision="2" size="mini"/>
              <span class="join">元</span>
            </div>
          </section>

          <section class="config-card">
            <div class="card-title">
              <h3>统计窗口</h3>
              <span>窗口以所选月份为基准向前推算；修改后仅对保存后的新版本生效。</span>
            </div>
            <el-form :inline="true" size="small" label-width="130px" class="base-form">
              <el-form-item label="老客留存统计月数">
                <el-input-number v-model="form.retentionMonths" :min="1" :max="24" :precision="0"/>
              </el-form-item>
              <el-form-item label="留存窗口结束偏移">
                <el-input-number v-model="form.retentionEndOffset" :min="0" :max="12" :precision="0"/>
                <span class="unit">月</span>
              </el-form-item>
              <el-form-item label="30 天复购月数">
                <el-input-number v-model="form.conversionMonths" :min="1" :max="12" :precision="0"/>
              </el-form-item>
              <el-form-item label="30 天窗口结束偏移">
                <el-input-number v-model="form.conversionEndOffset" :min="0" :max="12" :precision="0"/>
                <span class="unit">月</span>
              </el-form-item>
              <el-form-item label="30 天复购天数">
                <el-input-number v-model="form.conversionDays" :min="1" :max="180" :precision="0"/>
                <span class="unit">天</span>
              </el-form-item>
              <el-form-item label="10 天复购天数">
                <el-input-number v-model="form.tenDayDays" :min="1" :max="90" :precision="0"/>
                <span class="unit">天</span>
              </el-form-item>
            </el-form>
          </section>

          <section class="config-card full">
            <div class="card-title">
              <h3>培训达标奖励项目</h3>
              <span>8 个独立项目；通过考核次日起累计有效订单，达到目标单数的当月计入一次。</span>
            </div>
            <el-table :data="form.trainingProjects" size="mini" border>
              <el-table-column label="项目编码" width="120">
                <template slot-scope="scope">
                  <span class="key-text">{{ scope.row.projectKey }}</span>
                </template>
              </el-table-column>
              <el-table-column label="分组" width="110">
                <template slot-scope="scope">
                  <el-input v-model="scope.row.projectGroup" size="mini"/>
                </template>
              </el-table-column>
              <el-table-column label="展示名称" width="170">
                <template slot-scope="scope">
                  <el-input v-model="scope.row.projectName" size="mini"/>
                </template>
              </el-table-column>
              <el-table-column label="线上项目 ID" width="130">
                <template slot-scope="scope">
                  <el-input
                    v-model.number="scope.row.projectId"
                    size="mini"
                    placeholder="待绑定"
                    clearable/>
                </template>
              </el-table-column>
              <el-table-column label="部位" width="105">
                <template slot-scope="scope">
                  <el-input v-model="scope.row.partName" size="mini"/>
                </template>
              </el-table-column>
              <el-table-column label="别名（逗号分隔）" width="140">
                <template slot-scope="scope">
                  <el-input v-model="scope.row.aliases" size="mini"/>
                </template>
              </el-table-column>
              <el-table-column label="时长" width="90">
                <template slot-scope="scope">
                  <el-input-number
                    v-model="scope.row.durationMinutes"
                    :min="0"
                    :max="600"
                    :precision="0"
                    :controls="false"
                    size="mini"
                    placeholder="不限"
                    style="width: 68px"/>
                </template>
              </el-table-column>
              <el-table-column label="目标单数" width="100">
                <template slot-scope="scope">
                  <el-input-number
                    v-model="scope.row.targetCount"
                    :min="1"
                    :max="999"
                    :precision="0"
                    size="mini"
                    :controls="false"
                    style="width: 76px"/>
                </template>
              </el-table-column>
              <el-table-column label="达标奖励" width="115">
                <template slot-scope="scope">
                  <el-input-number
                    v-model="scope.row.amount"
                    :min="0"
                    :precision="0"
                    :controls="false"
                    size="mini"
                    style="width: 92px"/>
                </template>
              </el-table-column>
              <el-table-column label="启用" width="66" align="center">
                <template slot-scope="scope">
                  <el-switch v-model="scope.row.enabled" :active-value="1" :inactive-value="0"/>
                </template>
              </el-table-column>
            </el-table>
            <p class="table-footnote">
              未绑定线上项目 ID 时，按部位/别名与订单项目标题、服务时长匹配。生产订单部位在订单级，多人多部位订单可能产生归属歧义，建议优先绑定项目 ID。
            </p>
          </section>

          <section class="config-card full">
            <div class="card-title">
              <h3>版本备注</h3>
              <span>记录本次调整原因，便于历史追溯。</span>
            </div>
            <el-input
              v-model="form.remark"
              type="textarea"
              :rows="2"
              maxlength="500"
              show-word-limit
              placeholder="例如：2026 年 11 月起调整复购档位，经运营与财务确认。"/>
            <div class="save-bar">
              <span>保存后生成 {{ month }} 生效的新版本，历史月份按原版本计算。</span>
              <el-button type="primary" :disabled="!isGlobal" :loading="savingConfig" @click="saveConfig">
                保存为新版本
              </el-button>
            </div>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="门店目标" name="targets">
        <div class="target-toolbar">
          <div>
            <h3>门店月度业绩目标</h3>
            <p>店长奖励 = 整店实际实收 × 提点比例；只有实际实收达到目标才计入。</p>
          </div>
          <el-button
            size="small"
            type="primary"
            icon="el-icon-plus"
            :disabled="!isGlobal"
            @click="openTarget()">
            设置门店目标
          </el-button>
        </div>
        <el-table v-loading="loadingTargets" :data="targets" border stripe>
          <el-table-column label="门店" prop="shopName" min-width="150"/>
          <el-table-column label="业绩目标" width="150" align="right">
            <template slot-scope="scope">¥{{ money(scope.row.targetRevenue) }}</template>
          </el-table-column>
          <el-table-column label="店长提点" width="110" align="right">
            <template slot-scope="scope">{{ percent(scope.row.commissionRate, 0) }}</template>
          </el-table-column>
          <el-table-column label="店长" width="130">
            <template slot-scope="scope">{{ scope.row.managerName || '未设置' }}</template>
          </el-table-column>
          <el-table-column label="备注" prop="remark" min-width="180" show-overflow-tooltip/>
          <el-table-column label="操作" width="90" align="center">
            <template slot-scope="scope">
              <el-button type="text" size="mini" :disabled="!isGlobal" @click="openTarget(scope.row)">编辑</el-button>
            </template>
          </el-table-column>
          <template slot="empty">
            <div class="table-empty">{{ month }} 尚未设置门店目标</div>
          </template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog :visible.sync="targetDialogVisible" width="480px" title="门店业绩目标" @closed="resetTarget">
      <el-form label-width="110px" size="small">
        <el-form-item label="门店" required>
          <el-select
            v-model="targetForm.shopId"
            filterable
            placeholder="选择门店"
            :disabled="!!targetForm.id"
            style="width: 100%"
            @change="changeTargetShop">
            <el-option v-for="shop in shops" :key="shop.id" :label="shop.name" :value="shop.id"/>
          </el-select>
        </el-form-item>
        <el-form-item label="业绩目标" required>
          <el-input-number v-model="targetForm.targetRevenue" :min="0" :step="10000" :precision="2" style="width: 100%"/>
        </el-form-item>
        <el-form-item label="店长提点" required>
          <el-input-number v-model="targetForm.commissionRate" :min="0" :max="100" :step="0.5" :precision="2" style="width: 100%"/>
          <span class="unit">%</span>
        </el-form-item>
        <el-form-item label="店长">
          <el-select v-model="targetForm.managerMassagistId" clearable filterable placeholder="选择疗愈师" style="width: 100%">
            <el-option
              v-for="item in targetMassagists"
              :key="item.id"
              :label="`${item.name}（${item.shopName || '未分配门店'}）`"
              :value="item.id"/>
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="targetForm.remark" type="textarea" :rows="2" maxlength="500" show-word-limit/>
        </el-form-item>
      </el-form>
      <div class="dialog-hint">按整店实际实收计算，不按超出目标部分计算。</div>
      <span slot="footer">
        <el-button size="small" @click="targetDialogVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="savingTarget" @click="saveTarget">保存</el-button>
      </span>
    </el-dialog>

    <el-dialog :visible.sync="historyVisible" width="720px" title="参数历史版本">
      <el-table v-loading="loadingHistory" :data="history" size="mini" border max-height="420">
        <el-table-column label="生效月份" prop="effectiveMonth" width="100"/>
        <el-table-column label="修订" prop="revision" width="70" align="center"/>
        <el-table-column label="状态" width="86" align="center">
          <template slot-scope="scope">
            <el-tag size="mini" :type="scope.row.status === 1 ? 'success' : 'info'" effect="plain">
              {{ scope.row.status === 1 ? '生效' : '历史' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="165">
          <template slot-scope="scope">{{ formatDateTime(scope.row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="200" show-overflow-tooltip/>
      </el-table>
      <p class="dialog-hint">历史版本只读；如需调整，请在“奖励参数”中选择生效月份并保存新版本。</p>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import incentiveApi from '@/api/incentive'
import {decimal, money, numberValue, percent} from '@/views/incentive/format'

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value === undefined ? null : value))
}

function nullableNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default {
  name: 'IncentiveSettings',
  data() {
    return {
      month: currentMonth(),
      activeTab: 'config',
      shops: [],
      bundle: {usingDefault: false, config: null, coefficients: [], tiers: [], trainingProjects: []},
      form: {
        newCoefficient: 0.8,
        retentionThreshold: 60,
        minNewSample: 30,
        retentionMonths: 6,
        retentionEndOffset: 2,
        conversionMonths: 3,
        conversionEndOffset: 1,
        conversionDays: 30,
        tenDayDays: 10,
        fibA1: 10,
        fibA2: 10,
        fibCap: 130,
        remark: '',
        coefficients: [],
        tiers: [],
        trainingProjects: []
      },
      loading: false,
      savingConfig: false,
      targets: [],
      loadingTargets: false,
      targetDialogVisible: false,
      savingTarget: false,
      targetMassagists: [],
      targetForm: {
        id: null,
        shopId: null,
        targetRevenue: 0,
        commissionRate: 0,
        managerMassagistId: null,
        remark: ''
      },
      historyVisible: false,
      loadingHistory: false,
      history: []
    }
  },
  computed: {
    ...mapGetters(['roles']),
    isGlobal() {
      const globalRoles = ['超级管理员', '总助', '运营', '财务', 'admin']
      return (this.roles || []).some(role => globalRoles.indexOf(role) >= 0)
    },
    coefficientStart() {
      const zero = this.form.coefficients.find(item => Number(item.minMinutes) === 0)
      return zero ? `0 分钟 × ${decimal(zero.coefficient)}` : '缺少 0 分钟档位'
    }
  },
  created() {
    this.bootstrap()
  },
  methods: {
    money,
    percent,
    decimal,
    async bootstrap() {
      const shopsRes = await incentiveApi.shops()
      this.shops = shopsRes.data || []
      await this.loadAll()
    },
    async loadAll() {
      this.loading = true
      try {
        const [configRes, targetsRes] = await Promise.all([
          incentiveApi.config({month: this.month}),
          incentiveApi.shopTargets({month: this.month})
        ])
        this.bundle = configRes.data || {}
        this.applyBundle(this.bundle)
        this.targets = targetsRes.data || []
      } finally {
        this.loading = false
      }
    },
    applyBundle(bundle) {
      const config = bundle.config || {}
      const coefficients = (bundle.coefficients || []).map(item => ({
        minMinutes: item.minMinutes,
        coefficient: item.coefficient
      }))
      const tiers = (bundle.tiers || []).map(item => ({
        rate: item.rate,
        amount: item.amount
      }))
      const trainingProjects = (bundle.trainingProjects || []).map(item => ({
        projectKey: item.projectKey,
        projectGroup: item.projectGroup,
        projectName: item.projectName,
        projectId: item.projectId,
        partName: item.partName,
        aliases: item.aliases,
        durationMinutes: item.durationMinutes,
        targetCount: item.targetCount,
        amount: item.amount,
        enabled: item.enabled === undefined ? 1 : item.enabled,
        sort: item.sort
      }))
      coefficients.sort((a, b) => numberValue(a.minMinutes) - numberValue(b.minMinutes))
      tiers.sort((a, b) => numberValue(a.rate) - numberValue(b.rate))
      trainingProjects.sort((a, b) => numberValue(a.sort) - numberValue(b.sort))
      this.form = {
        newCoefficient: numberValue(config.newCoefficient),
        retentionThreshold: numberValue(config.retentionThreshold),
        minNewSample: numberValue(config.minNewSample) || 30,
        retentionMonths: numberValue(config.retentionMonths) || 6,
        retentionEndOffset: config.retentionEndOffset === null || config.retentionEndOffset === undefined
          ? 2 : numberValue(config.retentionEndOffset),
        conversionMonths: numberValue(config.conversionMonths) || 3,
        conversionEndOffset: config.conversionEndOffset === null || config.conversionEndOffset === undefined
          ? 1 : numberValue(config.conversionEndOffset),
        conversionDays: numberValue(config.conversionDays) || 30,
        tenDayDays: numberValue(config.tenDayDays) || 10,
        fibA1: numberValue(config.fibA1),
        fibA2: numberValue(config.fibA2),
        fibCap: numberValue(config.fibCap),
        remark: config.remark || '',
        coefficients,
        tiers,
        trainingProjects
      }
    },
    addCoefficient() {
      const max = this.form.coefficients.reduce((result, item) => {
        return Math.max(result, numberValue(item.minMinutes))
      }, 0)
      this.form.coefficients.push({minMinutes: max + 600, coefficient: 1})
    },
    removeCoefficient(index) {
      this.form.coefficients.splice(index, 1)
    },
    addTier() {
      const max = this.form.tiers.reduce((result, item) => {
        return Math.max(result, numberValue(item.rate))
      }, 0)
      this.form.tiers.push({rate: max + 1, amount: 200})
    },
    removeTier(index) {
      this.form.tiers.splice(index, 1)
    },
    validateForm() {
      if (!this.form.coefficients.length) {
        throw new Error('至少配置一个时长档位')
      }
      const minutes = {}
      let hasZero = false
      this.form.coefficients.forEach(item => {
        if (numberValue(item.minMinutes) < 0) {
          throw new Error('时长档位起点不能为负')
        }
        if (minutes[item.minMinutes]) {
          throw new Error('时长档位起点重复：' + item.minMinutes + ' 分钟')
        }
        minutes[item.minMinutes] = true
        if (numberValue(item.minMinutes) === 0) {
          hasZero = true
        }
        if (numberValue(item.coefficient) <= 0) {
          throw new Error('基础系数必须大于 0')
        }
      })
      if (!hasZero) {
        throw new Error('必须配置 0 分钟起始档位')
      }
      if (!this.form.tiers.length) {
        throw new Error('至少配置一个 30 天复购档位')
      }
      const rates = {}
      this.form.tiers.forEach(item => {
        if (rates[item.rate]) {
          throw new Error('复购档位重复：' + item.rate + '%')
        }
        rates[item.rate] = true
        if (numberValue(item.rate) < 0 || numberValue(item.rate) > 100) {
          throw new Error('复购档位必须在 0–100% 之间')
        }
        if (numberValue(item.amount) < 0) {
          throw new Error('复购档位奖励不能为负')
        }
      })
      if (!this.form.trainingProjects.length) {
        throw new Error('至少配置一个培训项目')
      }
      const keys = {}
      this.form.trainingProjects.forEach(item => {
        if (!item.projectKey) {
          throw new Error('培训项目编码不能为空')
        }
        if (keys[item.projectKey]) {
          throw new Error('培训项目编码重复：' + item.projectKey)
        }
        keys[item.projectKey] = true
        if (numberValue(item.targetCount) < 1) {
          throw new Error('培训目标次数不能小于 1')
        }
        if (numberValue(item.amount) < 0) {
          throw new Error('培训达标奖励不能为负')
        }
      })
    },
    buildPayload() {
      const coefficients = deepClone(this.form.coefficients)
        .map(item => ({
          minMinutes: nullableNumber(item.minMinutes),
          coefficient: nullableNumber(item.coefficient)
        }))
        .sort((a, b) => numberValue(a.minMinutes) - numberValue(b.minMinutes))
      const tiers = deepClone(this.form.tiers)
        .map(item => ({
          rate: nullableNumber(item.rate),
          amount: nullableNumber(item.amount)
        }))
        .sort((a, b) => numberValue(a.rate) - numberValue(b.rate))
      const trainingProjects = deepClone(this.form.trainingProjects).map((item, index) => ({
        projectKey: item.projectKey,
        projectGroup: item.projectGroup,
        projectName: item.projectName,
        projectId: nullableNumber(item.projectId),
        partName: item.partName,
        aliases: item.aliases,
        durationMinutes: nullableNumber(item.durationMinutes),
        targetCount: nullableNumber(item.targetCount),
        amount: nullableNumber(item.amount),
        enabled: item.enabled === 0 ? 0 : 1,
        sort: index
      }))
      return {
        effectiveMonth: this.month,
        newCoefficient: this.form.newCoefficient,
        retentionThreshold: this.form.retentionThreshold,
        minNewSample: this.form.minNewSample,
        retentionMonths: this.form.retentionMonths,
        retentionEndOffset: this.form.retentionEndOffset,
        conversionMonths: this.form.conversionMonths,
        conversionEndOffset: this.form.conversionEndOffset,
        conversionDays: this.form.conversionDays,
        tenDayDays: this.form.tenDayDays,
        fibA1: this.form.fibA1,
        fibA2: this.form.fibA2,
        fibCap: this.form.fibCap,
        remark: this.form.remark,
        coefficients,
        tiers,
        trainingProjects
      }
    },
    async saveConfig() {
      if (!this.isGlobal) {
        this.notifyWarning('当前账号没有保存奖励参数的权限')
        return
      }
      try {
        this.validateForm()
      } catch (error) {
        this.notifyWarning(error.message)
        return
      }
      await this.notifyConfirm(
        `保存后将生成 ${this.month} 起生效的新版本，历史月份不受影响。是否继续？`,
        '保存参数'
      )
      this.savingConfig = true
      try {
        await incentiveApi.saveConfig(this.buildPayload())
        this.notifySuccess('参数已保存，历史月份不受影响')
        await this.loadAll()
      } finally {
        this.savingConfig = false
      }
    },
    async openHistory() {
      this.historyVisible = true
      this.loadingHistory = true
      try {
        const res = await incentiveApi.configHistory()
        this.history = res.data || []
      } finally {
        this.loadingHistory = false
      }
    },
    async openTarget(row) {
      if (row) {
        this.targetForm = {
          id: row.id,
          shopId: row.shopId,
          targetRevenue: numberValue(row.targetRevenue),
          commissionRate: numberValue(row.commissionRate),
          managerMassagistId: row.managerMassagistId || null,
          remark: row.remark || ''
        }
        await this.loadTargetMassagists(row.shopId)
      } else {
        this.targetForm = {
          id: null,
          shopId: this.shops.length ? this.shops[0].id : null,
          targetRevenue: 0,
          commissionRate: 0,
          managerMassagistId: null,
          remark: ''
        }
        if (this.targetForm.shopId) {
          await this.loadTargetMassagists(this.targetForm.shopId)
        }
      }
      this.targetDialogVisible = true
    },
    async changeTargetShop(shopId) {
      this.targetForm.managerMassagistId = null
      await this.loadTargetMassagists(shopId)
    },
    async loadTargetMassagists(shopId) {
      const res = await incentiveApi.massagists({shopId: shopId || undefined})
      this.targetMassagists = res.data || []
    },
    async saveTarget() {
      if (!this.isGlobal) {
        this.notifyWarning('当前账号没有保存门店目标的权限')
        return
      }
      if (!this.targetForm.shopId) {
        this.notifyWarning('请选择门店')
        return
      }
      if (numberValue(this.targetForm.targetRevenue) < 0) {
        this.notifyWarning('业绩目标不能为负')
        return
      }
      if (numberValue(this.targetForm.commissionRate) < 0
        || numberValue(this.targetForm.commissionRate) > 100) {
        this.notifyWarning('店长提点必须在 0–100% 之间')
        return
      }
      this.savingTarget = true
      try {
        await incentiveApi.saveShopTarget({
          shopId: this.targetForm.shopId,
          monthCode: this.month,
          targetRevenue: this.targetForm.targetRevenue,
          commissionRate: this.targetForm.commissionRate,
          managerMassagistId: this.targetForm.managerMassagistId,
          remark: this.targetForm.remark
        })
        this.targetDialogVisible = false
        this.notifySuccess('门店目标已保存')
        const res = await incentiveApi.shopTargets({month: this.month})
        this.targets = res.data || []
      } finally {
        this.savingTarget = false
      }
    },
    resetTarget() {
      this.targetForm = {
        id: null,
        shopId: null,
        targetRevenue: 0,
        commissionRate: 0,
        managerMassagistId: null,
        remark: ''
      }
    },
    formatDateTime(value) {
      if (!value) {
        return '—'
      }
      return String(value).replace('T', ' ').slice(0, 19)
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.settings-page {
  background: #EEF0F3;
  min-height: calc(100vh - 50px);
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 16px;

  h2 {
    margin: 0;
    font-size: 22px;
    color: #2B2930;
    letter-spacing: -0.5px;
  }

  p {
    margin: 6px 0 0;
    font-size: 12px;
    color: #79747E;
    max-width: 760px;
    line-height: 1.7;
  }
}

.head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.readonly-tip {
  background: #F4F0FA;
  border: 1px solid #DED4EE;
  border-radius: 9px;
  padding: 10px 16px;
  font-size: 12px;
  color: #5B4A73;
  margin-bottom: 14px;

  i {
    margin-right: 6px;
  }
}

.settings-tabs {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #E7E4EC;
  padding: 8px 18px 18px;
}

.config-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin: 4px 0 14px;
}

.toolbar-note {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #79747E;
}

.config-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.config-card {
  border: 1px solid #EDE8F2;
  border-radius: 10px;
  padding: 16px;
  background: #FDFCFE;

  &.full {
    grid-column: 1 / -1;
  }
}

.card-title {
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-size: 14px;
    color: #2B2930;
  }

  span {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: #79747E;
    line-height: 1.7;
  }
}

.base-form {
  margin-bottom: 4px;
}

.unit {
  margin-left: 6px;
  font-size: 12px;
  color: #79747E;
}

.form-static {
  font-size: 12px;
  color: #6750A4;
}

.row-hint {
  font-size: 11px;
  color: #79747E;
}

.add-row {
  margin-top: 10px;
}

.fib-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 12px;
  color: #49454F;
  flex-wrap: wrap;

  .join {
    color: #79747E;
  }

  ::v-deep .el-input-number {
    width: 100px;
  }
}

.key-text {
  font-size: 11px;
  color: #6750A4;
  font-family: Menlo, Consolas, monospace;
}

.table-footnote {
  margin: 10px 0 0;
  font-size: 11px;
  color: #79747E;
  line-height: 1.7;
}

.save-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 14px;

  span {
    font-size: 11px;
    color: #79747E;
  }
}

.target-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin: 8px 0 14px;

  h3 {
    margin: 0;
    font-size: 15px;
    color: #2B2930;
  }

  p {
    margin: 5px 0 0;
    font-size: 11px;
    color: #79747E;
  }
}

.table-empty {
  padding: 34px 0;
  color: #9A96A2;
  font-size: 12px;
}

.dialog-hint {
  background: #FAF9FC;
  border-radius: 7px;
  padding: 9px 12px;
  font-size: 11px;
  color: #79747E;
  line-height: 1.7;
}

@media (max-width: 1280px) {
  .config-layout {
    grid-template-columns: 1fr;
  }

  .config-card.full {
    grid-column: auto;
  }
}
</style>
