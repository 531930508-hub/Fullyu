<template>
  <el-drawer
    :visible="visible"
    :title="board ? `${board.massagistName || '疗愈师'} · ${board.month}` : '疗愈师明细'"
    size="620px"
    custom-class="incentive-drawer"
    @close="$emit('update:visible', false)">
    <div v-if="board" class="drawer-body" v-loading="loading">
      <div class="drawer-hero">
        <div class="hero-line">
          <span>{{ board.shopName || '未分配门店' }}</span>
          <el-tag size="mini" effect="plain">{{ board.cooperationStatus }}</el-tag>
          <el-tag v-if="board.currentMonth" size="mini" type="success" effect="plain">当前月</el-tag>
          <el-tag v-else size="mini" effect="plain">历史月</el-tag>
        </div>
        <div class="hero-total">
          <small>合作结算预估</small>
          <strong>¥{{ money(board.settlement.net) }}</strong>
        </div>
        <div class="hero-foot">
          <span>数据截止 {{ board.cutoff }}</span>
          <span v-if="meta && meta.snapshot">生成时快照，金额不随排班/考核/规则变化</span>
          <span v-else>预估，最终以财务结算为准</span>
        </div>
        <div v-if="meta" class="hero-meta">
          <span v-if="meta.snapshot" class="meta-tag snapshot">结算快照</span>
          <span class="meta-tag">{{ meta.statusLabel }}</span>
          <span v-if="meta.generatedTime">生成 {{ meta.generatedBy || '—' }} · {{ shortTime(meta.generatedTime) }}</span>
          <span v-if="meta.confirmedTime">确认 {{ meta.confirmedBy || '—' }} · {{ shortTime(meta.confirmedTime) }}</span>
          <span v-if="meta.publishedTime">发布 {{ meta.publishedBy || '—' }} · {{ shortTime(meta.publishedTime) }}</span>
          <span v-if="meta.configRevision">参数 v{{ meta.configRevision }}</span>
          <span v-if="meta.usingDefaultConfig" class="meta-warn">系统默认参数</span>
          <span v-if="meta.frozen" class="meta-warn">金额已冻结</span>
          <span v-if="meta.remark" class="meta-remark">备注：{{ meta.remark }}</span>
        </div>
      </div>

      <div v-if="board.warnings && board.warnings.length" class="warning-box">
        <p v-for="(warning, index) in board.warnings" :key="index">
          <i class="el-icon-warning-outline"></i>{{ warning }}
        </p>
      </div>

      <section class="detail-section">
        <div class="section-title">
          <h3>本月奖励构成</h3>
          <span>均为合作结算口径</span>
        </div>
        <div class="amount-grid">
          <div class="amount-item">
            <small>基础薪资</small>
            <strong>{{ money(board.base.amount) }}</strong>
          </div>
          <div class="amount-item">
            <small>培训达标奖励</small>
            <strong>{{ money(board.training.earnedAmount) }}</strong>
          </div>
          <div class="amount-item">
            <small>复购接单奖励</small>
            <strong>{{ money(board.repurchase.totalAmount) }}</strong>
          </div>
          <div class="amount-item">
            <small>店长奖励</small>
            <strong>{{ money(board.manager.totalAmount) }}</strong>
          </div>
          <div class="amount-item">
            <small>其他调整</small>
            <strong>{{ money(board.settlement.adjustment) }}</strong>
          </div>
          <div class="amount-item total">
            <small>激励合计</small>
            <strong>{{ money(board.settlement.subtotal) }}</strong>
          </div>
        </div>
        <div v-if="numberValue(board.repurchase.potentialAmount) > numberValue(board.repurchase.totalAmount)" class="subtle-line">
          复购潜力 ¥{{ money(board.repurchase.potentialAmount) }}；未计入部分可能因老客留存未达门槛、新客样本不足或下一档尚未达成，详见下方说明。
        </div>
      </section>

      <section class="detail-section">
        <div class="section-title">
          <h3>基础薪资</h3>
          <span>{{ money(board.base.minutes) }} 分钟 × {{ decimal(board.base.coefficient) }} 元/分钟</span>
        </div>
        <div class="band-track">
          <div
            v-for="(band, index) in bands"
            :key="band.minMinutes"
            :class="['band-step', {reached: reachedBand(index), current: currentBandIndex === index}]">
            <i class="dot"></i>
            <b>{{ bandLabel(band.minMinutes) }}</b>
            <small>{{ decimal(band.coefficient) }} 元/分</small>
          </div>
        </div>
        <p class="hint-line">{{ board.base.nextBandHint || '当前时长档位已记录' }}</p>
        <p v-if="board.base.newPartner" class="hint-line">新人合作期单价单独适用，不参与上述档位累加。</p>

        <div class="compose-box">
          <div class="compose-head">
            <span>折算时长构成</span>
            <small>服务 + 接待 + 工时调整 = 计入基础薪资的分钟</small>
          </div>
          <div class="compose-row">
            <span>服务折算</span>
            <b>{{ money(board.base.serviceWeightedMinutes, 0) }} 分</b>
            <em>服务 {{ money(board.base.serviceMinutes, 0) }} 分 · {{ board.base.serviceOrderCount || 0 }} 单</em>
          </div>
          <div class="compose-row">
            <span>接待计入</span>
            <b>{{ money(board.base.receptionCountedMinutes, 0) }} 分</b>
            <em>
              接待 {{ money(board.base.receptionMinutes, 0) }} 分 · {{ board.base.receptionOrderCount || 0 }} 单
              <template v-if="board.base.receptionCapApplied"> · 超出上限 {{ money(board.base.receptionExcessMinutes, 0) }} 分不计入</template>
              <template v-else-if="board.base.receptionCapMinutes"> · 上限 {{ money(board.base.receptionCapMinutes, 0) }} 分</template>
            </em>
          </div>
          <div class="compose-row">
            <span>工时/排班调整</span>
            <b>{{ signed(board.base.adjustMinutes) }} 分</b>
            <em>补单、请假等人力调整，可为负数</em>
          </div>
          <div class="compose-row total">
            <span>合计折算</span>
            <b>{{ money(board.base.minutes, 0) }} 分 × ¥{{ decimal(board.base.coefficient) }} = ¥{{ money(board.base.amount) }}</b>
            <em>按上月计入时长档位取单价</em>
          </div>
        </div>
      </section>

      <section class="detail-section">
        <div class="section-title">
          <h3>复购接单奖励</h3>
          <span>{{ board.repurchase.retentionWindowStart }} 至 {{ board.repurchase.retentionWindowEnd }}</span>
        </div>
        <div class="gate-box" :class="{passed: board.repurchase.retentionEligible}">
          <div class="gate-head">
            <span>老客 60 天留存门槛</span>
            <b>{{ percent(board.repurchase.retentionRate) }} / {{ percent(board.repurchase.retentionThreshold, 0) }}</b>
          </div>
          <el-progress
            :percentage="Math.min(100, numberValue(board.repurchase.retentionRate))"
            :stroke-width="8"
            :show-text="false"
            :color="board.repurchase.retentionEligible ? '#6750A4' : '#C7A15A'"/>
          <p>
            窗口内老客到店 {{ board.repurchase.retentionSample || 0 }} 人次，其中 {{ board.repurchase.retainedVisits || 0 }} 人次在 60 天内再次到店。
            <template v-if="board.repurchase.retentionSample === 0">暂无满 60 天的老客到店样本，留存率不参与判定。</template>
            <template v-else-if="board.repurchase.retentionSample < (board.repurchase.minRetentionSample || 0)">
              样本不足 {{ board.repurchase.minRetentionSample }} 人次，留存率仅展示、不判定合格。
            </template>
            <template v-else-if="!board.repurchase.retentionEligible">门槛未达成，复购奖励暂不计入。</template>
            <template v-else-if="numberValue(board.repurchase.appliedTierAmount) === 0">门槛已达成，但本月未达复购档位。</template>
            <template v-else>门槛已达成，复购奖励计入本月。</template>
          </p>
        </div>

        <div class="progress-grid">
          <div class="progress-item">
            <div class="progress-head">
              <span>老客留存率</span>
              <b>{{ percent(board.repurchase.retentionRate) }} / {{ percent(board.repurchase.retentionThreshold, 0) }}</b>
            </div>
            <el-progress
              :percentage="clampPercent(ratePercent(board.repurchase.retentionRate, board.repurchase.retentionThreshold))"
              :stroke-width="6"
              :show-text="false"
              :color="board.repurchase.retentionEligible ? '#6750A4' : '#C7A15A'"/>
            <small>门槛 {{ percent(board.repurchase.retentionThreshold, 0) }}，未达成时复购奖励不计入</small>
          </div>
          <div class="progress-item">
            <div class="progress-head">
              <span>老客样本充足度</span>
              <b>{{ board.repurchase.retentionSample || 0 }} / {{ board.repurchase.minRetentionSample || 0 }}</b>
            </div>
            <el-progress
              :percentage="clampPercent(samplePercent(board.repurchase.retentionSample, board.repurchase.minRetentionSample))"
              :stroke-width="6"
              :show-text="false"
              color="#8E7CC3"/>
            <small>样本不足时留存率仅展示，不参与合格判定</small>
          </div>
          <div class="progress-item">
            <div class="progress-head">
              <span>新客样本充足度</span>
              <b>{{ board.repurchase.newCustomerCount || 0 }} / {{ board.repurchase.minNewSample || 0 }}</b>
            </div>
            <el-progress
              :percentage="clampPercent(samplePercent(board.repurchase.newCustomerCount, board.repurchase.minNewSample))"
              :stroke-width="6"
              :show-text="false"
              :color="board.repurchase.conversionSampleSufficient ? '#6750A4' : '#C7A15A'"/>
            <small>新客样本不足 {{ board.repurchase.minNewSample || 0 }} 人时，30 天档位暂不计入</small>
          </div>
          <div class="progress-item">
            <div class="progress-head">
              <span>30 天档位进度</span>
              <b>{{ percent(board.repurchase.conversionRate) }} → {{ board.repurchase.nextTierRate ? percent(board.repurchase.nextTierRate, 0) : '已到顶' }}</b>
            </div>
            <el-progress
              :percentage="clampPercent(tierProgress)"
              :stroke-width="6"
              :show-text="false"
              color="#6750A4"/>
            <small v-if="board.repurchase.nextTierRate">
              还差 {{ decimal(board.repurchase.neededForNextTier, 1) }} 个加权新客，可达 ¥{{ money(board.repurchase.nextTierAmount, 0) }}
            </small>
            <small v-else>已达成最高档 30 天复购奖励</small>
          </div>
          <div class="progress-item wide">
            <div class="progress-head">
              <span>复购奖励计入进度</span>
              <b>¥{{ money(repurchaseApplied) }} / ¥{{ money(board.repurchase.potentialAmount) }}</b>
            </div>
            <el-progress
              :percentage="clampPercent(repurchaseProgress)"
              :stroke-width="8"
              :show-text="false"
              :color="repurchaseProgress >= 100 ? '#6750A4' : '#C7A15A'"/>
            <small>理论可得 ¥{{ money(board.repurchase.potentialAmount) }}，未计入部分待门槛/档位达成后自动补入</small>
          </div>
        </div>

        <div class="metric-row">
          <div>
            <small>新客 30 天复购率</small>
            <b>{{ percent(board.repurchase.conversionRate) }}</b>
            <span>
              新客 {{ board.repurchase.newCustomerCount || 0 }} 人，窗口 {{ board.repurchase.conversionWindowStart }} 至 {{ board.repurchase.conversionWindowEnd }}
            </span>
          </div>
          <div>
            <small>30 天档位奖励</small>
            <b>{{ money(board.repurchase.appliedTierAmount) }}</b>
            <span v-if="board.repurchase.tierRate != null">已达成 {{ percent(board.repurchase.tierRate, 0) }} 档</span>
            <span v-else>尚未达到最低档</span>
          </div>
        </div>
        <div class="tier-track">
          <div
            v-for="(tier, index) in tiers"
            :key="tier.rate"
            :class="['tier-step', {reached: reachedTier(index), current: currentTierIndex === index}]">
            <b>{{ percent(tier.rate, 0) }}</b>
            <small>¥{{ money(tier.amount, 0) }}</small>
          </div>
        </div>
        <p v-if="board.repurchase.conversionSampleSufficient === false" class="hint-line warn">
          新客样本不足 {{ board.repurchase.minNewSample }} 人，30 天档位暂不计入；10 天复购不受此限制。
        </p>
        <p v-if="board.repurchase.nextTierRate" class="hint-line">
          距 {{ percent(board.repurchase.nextTierRate, 0) }} 档还差 {{ decimal(board.repurchase.neededForNextTier, 0) }} 个加权新客，可达 ¥{{ money(board.repurchase.nextTierAmount, 0) }}。
        </p>

        <div class="metric-row">
          <div>
            <small>新客 10 天复购</small>
            <b>{{ board.repurchase.tenDayHeadCount || 0 }} 单</b>
            <span>合格记录按斐波那契单价逐位计算，共同服务按权重分摊。</span>
          </div>
          <div>
            <small>10 天复购奖励</small>
            <b>{{ money(board.repurchase.appliedTenDayAmount) }}</b>
            <span>下一位单价 ¥{{ money(board.repurchase.tenDayNextPrice, 0) }}</span>
          </div>
        </div>
        <el-table
          v-if="board.repurchase.tenDayRecords && board.repurchase.tenDayRecords.length"
          :data="board.repurchase.tenDayRecords"
          size="mini"
          border
          class="mini-table">
          <el-table-column label="首单" prop="firstVisitDate" width="100"/>
          <el-table-column label="二次到店" prop="secondVisitDate" width="100"/>
          <el-table-column label="客户" prop="phoneMasked" width="110"/>
          <el-table-column label="权重" width="70">
            <template slot-scope="scope">{{ decimal(scope.row.weight) }}</template>
          </el-table-column>
          <el-table-column label="单价" width="80">
            <template slot-scope="scope">¥{{ money(scope.row.unitPrice, 0) }}</template>
          </el-table-column>
          <el-table-column label="奖励">
            <template slot-scope="scope">¥{{ money(scope.row.amount) }}</template>
          </el-table-column>
        </el-table>
      </section>

      <section class="detail-section">
        <div class="section-title">
          <h3>培训达标奖励</h3>
          <span>已达标 {{ board.training.completedCount || 0 }} / {{ board.training.projectCount || 0 }} 项</span>
        </div>
        <div v-for="group in trainingGroups" :key="group.name" class="training-group">
          <h4>{{ group.name }}</h4>
          <div v-for="project in group.projects" :key="project.projectKey" class="training-row">
            <div class="training-name">
              <span>{{ project.projectName }}</span>
              <small v-if="project.passedAt">考核日 {{ project.passedAt }}，次日起算</small>
              <small v-else>尚未登记考核</small>
            </div>
            <div class="training-progress">
              <span>{{ project.count || 0 }} / {{ project.target || 0 }}</span>
              <el-progress
                :percentage="Math.min(100, numberValue(project.progressPercent))"
                :stroke-width="6"
                :show-text="false"
                color="#6750A4"/>
            </div>
            <div class="training-status">
              <el-tag size="mini" :type="status(project).type" effect="plain">{{ status(project).text }}</el-tag>
              <small v-if="project.completionDate">{{ project.completionDate }}</small>
              <small v-else-if="project.remaining !== null">还差 {{ project.remaining }} 单</small>
            </div>
            <b class="training-amount">{{ money(project.earnedAmount) }}</b>
          </div>
        </div>
      </section>

      <section v-if="board.manager && board.manager.manager" class="detail-section">
        <div class="section-title">
          <h3>店长奖励</h3>
          <span>按整店实际业绩 × 提点</span>
        </div>
        <div v-for="shop in board.manager.shops" :key="shop.shopId" class="manager-row">
          <div>
            <b>{{ shop.shopName || ('门店 ' + shop.shopId) }}</b>
            <small>实际 {{ money(shop.actualRevenue) }} / 目标 {{ money(shop.targetRevenue) }}，提点 {{ percent(shop.commissionRate, 0) }}</small>
          </div>
          <el-tag size="mini" :type="shop.achieved ? 'success' : 'info'" effect="plain">
            {{ shop.achieved ? '已达成' : '未达成' }}
          </el-tag>
          <strong>¥{{ money(shop.amount) }}</strong>
        </div>
      </section>

      <section class="detail-section">
        <div class="section-title">
          <h3>合作结算预估</h3>
          <span>仅作预览，不写入正式结算单</span>
        </div>
        <div class="settlement-grid">
          <div><span>基础薪资</span><b>¥{{ money(board.settlement.baseReward) }}</b></div>
          <div><span>店长奖励</span><b>¥{{ money(board.settlement.managerReward) }}</b></div>
          <div><span>培训达标奖励</span><b>¥{{ money(board.settlement.trainingReward) }}</b></div>
          <div><span>复购接单奖励</span><b>¥{{ money(board.settlement.repurchaseReward) }}</b></div>
          <div><span>其他调整</span><b>¥{{ money(board.settlement.adjustment) }}</b></div>
          <div class="emphasis"><span>激励合计</span><b>¥{{ money(board.settlement.subtotal) }}</b></div>
          <div><span>服务费折算（÷{{ board.settlement.serviceFeeDivisor }}）</span><b>¥{{ money(board.settlement.preTax) }}</b></div>
          <div><span>年累计计税前</span><b>¥{{ money(board.settlement.annualIncome) }}</b></div>
          <div><span>连续合作月数</span><b>{{ board.settlement.continuousMonths }} 个月</b></div>
          <div><span>年累计应纳税所得额</span><b>¥{{ money(board.settlement.annualTaxableIncome) }}</b></div>
          <div><span>税率 / 速算扣除</span><b>{{ percent(board.settlement.taxRate, 0) }} / ¥{{ money(board.settlement.quickDeduction) }}</b></div>
          <div><span>本年已预缴</span><b>¥{{ money(board.settlement.priorPaidTax) }}</b></div>
          <div><span>本月个税预估</span><b>¥{{ money(board.settlement.tax) }}</b></div>
          <div class="emphasis"><span>合作结算预估</span><b>¥{{ money(board.settlement.net) }}</b></div>
        </div>
      </section>
    </div>
    <div v-else class="empty-drawer">
      <p>请选择一位疗愈师查看明细</p>
    </div>
  </el-drawer>
</template>

<script>
import {decimal, money, numberValue, percent, trainingStatus} from '@/views/incentive/format'

export default {
  name: 'IncentiveBoardDrawer',
  props: {
    visible: {type: Boolean, default: false},
    board: {type: Object, default: null},
    config: {type: Object, default: null},
    loading: {type: Boolean, default: false},
    /** 结算单场景附带的快照元信息（状态/生成/确认/发布），看板场景不传 */
    meta: {type: Object, default: null}
  },
  computed: {
    bands() {
      const list = this.board && this.board.base && this.board.base.bands
      return list && list.length ? list : []
    },
    tiers() {
      const list = this.config && this.config.tiers
      return list && list.length ? list : []
    },
    currentBandIndex() {
      if (!this.board || !this.board.base) {
        return -1
      }
      const minutes = this.board.base.currentBandMinutes
      if (minutes === null || minutes === undefined) {
        return -1
      }
      return this.bands.findIndex(band => Number(band.minMinutes) === Number(minutes))
    },
    currentTierIndex() {
      const rate = this.board && this.board.repurchase ? this.board.repurchase.tierRate : null
      if (rate === null || rate === undefined) {
        return -1
      }
      let index = -1
      this.tiers.forEach((tier, i) => {
        if (numberValue(tier.rate) <= numberValue(rate)) {
          index = i
        }
      })
      return index
    },
    trainingGroups() {
      const projects = (this.board && this.board.training && this.board.training.projects) || []
      const groups = []
      const indexByName = {}
      projects.forEach(project => {
        const name = project.projectGroup || '其他项目'
        if (indexByName[name] === undefined) {
          indexByName[name] = groups.length
          groups.push({name, projects: []})
        }
        groups[indexByName[name]].projects.push(project)
      })
      return groups
    },
    /** 30 天档位进度：当前复购率 / 下一档门槛，到顶视为 100。 */
    tierProgress() {
      const repurchase = this.board && this.board.repurchase
      if (!repurchase) {
        return 0
      }
      const next = numberValue(repurchase.nextTierRate)
      if (next <= 0) {
        return 100
      }
      return numberValue(repurchase.conversionRate) / next * 100
    },
    /** 已计入的复购奖励占理论可得比例。 */
    repurchaseApplied() {
      const repurchase = this.board && this.board.repurchase
      if (!repurchase) {
        return 0
      }
      return numberValue(repurchase.appliedTierAmount) + numberValue(repurchase.appliedTenDayAmount)
    },
    repurchaseProgress() {
      const repurchase = this.board && this.board.repurchase
      const potential = numberValue(repurchase && repurchase.potentialAmount)
      if (potential <= 0) {
        return this.repurchaseApplied > 0 ? 100 : 0
      }
      return this.repurchaseApplied / potential * 100
    }
  },
  methods: {
    money,
    decimal,
    percent,
    numberValue,
    status(project) {
      return trainingStatus(project)
    },
    reachedBand(index) {
      return this.currentBandIndex >= 0 && index <= this.currentBandIndex
    },
    /** 档位起点展示：整小时显示为 h，其余显示分钟。 */
    bandLabel(minutes) {
      const value = numberValue(minutes)
      if (value <= 0) {
        return '0'
      }
      if (value % 60 === 0) {
        return (value / 60) + 'h'
      }
      return value + ' 分'
    },
    reachedTier(index) {
      return this.currentTierIndex >= 0 && index <= this.currentTierIndex
    },
    /** 带符号展示分钟调整，0 不显示正号。 */
    signed(value, digits) {
      const num = numberValue(value)
      const text = this.decimal(Math.abs(num), digits === undefined ? 1 : digits)
      if (num > 0) {
        return '+' + text
      }
      if (num < 0) {
        return '-' + text
      }
      return '0'
    },
    clampPercent(value) {
      const num = numberValue(value)
      if (num <= 0) return 0
      if (num >= 100) return 100
      return Math.round(num * 10) / 10
    },
    /** 比率相对门槛的完成度（0-100）。 */
    ratePercent(rate, threshold) {
      const target = numberValue(threshold)
      if (target <= 0) {
        return 100
      }
      return numberValue(rate) / target * 100
    },
    samplePercent(sample, min) {
      const target = numberValue(min)
      if (target <= 0) {
        return 100
      }
      return numberValue(sample) / target * 100
    },
    shortTime(value) {
      if (!value) {
        return '—'
      }
      return String(value).replace('T', ' ').slice(0, 16)
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.incentive-drawer ::v-deep .el-drawer__body {
  overflow: auto;
  background: #F6F5F9;
}

.drawer-body {
  padding: 18px;
}

.drawer-hero {
  background: linear-gradient(135deg, #4A3B63 0%, #6750A4 100%);
  color: #fff;
  border-radius: 12px;
  padding: 20px;
}

.hero-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.82);
}

.hero-total {
  margin-top: 16px;
  display: flex;
  align-items: baseline;
  gap: 12px;

  small {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.82);
  }

  strong {
    font-size: 34px;
    letter-spacing: -1px;
    font-weight: 600;
  }
}

.hero-foot {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}

.hero-meta {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);

  .meta-tag {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    padding: 1px 10px;

    &.snapshot {
      background: #FFFFFF;
      color: #4A3B63;
      font-weight: 600;
    }
  }

  .meta-warn {
    color: #FFE1A8;
  }

  .meta-remark {
    width: 100%;
    color: rgba(255, 255, 255, 0.78);
  }
}

.warning-box {
  margin-top: 12px;
  background: #FFF8E8;
  border: 1px solid #F0DFB6;
  border-radius: 10px;
  padding: 10px 14px;

  p {
    margin: 4px 0;
    font-size: 12px;
    color: #8A6A23;
    line-height: 1.7;
  }

  i {
    margin-right: 6px;
  }
}

.detail-section {
  background: #fff;
  border-radius: 12px;
  padding: 18px;
  margin-top: 12px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 14px;

  h3 {
    margin: 0;
    font-size: 14px;
    color: #2B2930;
  }

  span {
    font-size: 11px;
    color: #79747E;
  }
}

.amount-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.amount-item {
  border: 1px solid #ECE8F2;
  border-radius: 9px;
  padding: 10px 12px;

  small {
    display: block;
    font-size: 11px;
    color: #79747E;
  }

  strong {
    display: block;
    margin-top: 5px;
    font-size: 17px;
    color: #2B2930;
    font-weight: 600;
  }

  &.total {
    background: #F4F0FA;
    border-color: #DED4EE;
  }
}

.subtle-line,
.hint-line {
  font-size: 11px;
  color: #79747E;
  line-height: 1.8;
  margin: 10px 0 0;
}

.hint-line.warn {
  color: #A56A11;
}

.band-track {
  display: flex;
  gap: 4px;
}

.band-step {
  flex: 1;
  min-width: 0;
  text-align: center;
  position: relative;
  padding-top: 15px;

  &::before {
    content: '';
    position: absolute;
    top: 5px;
    left: -50%;
    right: 50%;
    height: 2px;
    background: #E8E4EE;
  }

  &:first-child::before {
    display: none;
  }

  .dot {
    position: absolute;
    top: 1px;
    left: 50%;
    transform: translateX(-50%);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid #D8D2E0;
    z-index: 1;
  }

  b {
    display: block;
    font-size: 11px;
    color: #49454F;
    font-weight: 500;
    white-space: nowrap;
  }

  small {
    display: block;
    font-size: 10px;
    color: #79747E;
  }

  &.reached {
    &::before, .dot {
      background: #6750A4;
      border-color: #6750A4;
    }
  }

  &.current .dot {
    box-shadow: 0 0 0 4px rgba(103, 80, 164, 0.14);
  }

  &.current b {
    color: #6750A4;
    font-weight: 600;
  }
}

.gate-box {
  border: 1px solid #EDE8F2;
  border-radius: 9px;
  padding: 12px 14px;
  background: #FAF9FC;

  &.passed {
    background: #F6F3FB;
    border-color: #DED4EE;
  }

  .gate-head {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin-bottom: 8px;
  }

  p {
    font-size: 11px;
    color: #79747E;
    margin: 8px 0 0;
    line-height: 1.7;
  }
}

.metric-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 16px;

  > div + div {
    border-left: 1px solid #EFEBF3;
    padding-left: 16px;
  }

  small {
    display: block;
    font-size: 11px;
    color: #79747E;
  }

  b {
    display: block;
    margin: 4px 0;
    font-size: 20px;
    color: #2B2930;
  }

  span {
    font-size: 10px;
    color: #79747E;
    line-height: 1.6;
  }
}

.tier-track {
  display: flex;
  gap: 6px;
  margin-top: 12px;
}

.tier-step {
  flex: 1;
  border: 1px solid #E8E4EE;
  border-radius: 7px;
  text-align: center;
  padding: 7px 4px;

  b {
    display: block;
    font-size: 12px;
    color: #49454F;
  }

  small {
    display: block;
    font-size: 10px;
    color: #79747E;
  }

  &.reached {
    background: #F4F0FA;
    border-color: #CBBBE4;
  }

  &.current {
    background: #6750A4;
    border-color: #6750A4;

    b, small {
      color: #fff;
    }
  }
}

.mini-table {
  margin-top: 12px;
}

.training-group {
  & + & {
    margin-top: 14px;
  }

  h4 {
    margin: 0 0 6px;
    font-size: 12px;
    color: #6750A4;
    font-weight: 600;
  }
}

.training-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 110px 110px 72px;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-top: 1px solid #F0EDF5;
}

.training-name {
  span {
    display: block;
    font-size: 12px;
    color: #2B2930;
  }

  small {
    display: block;
    font-size: 10px;
    color: #79747E;
    margin-top: 2px;
  }
}

.training-progress {
  span {
    font-size: 10px;
    color: #79747E;
  }
}

.training-status {
  text-align: right;

  small {
    display: block;
    font-size: 10px;
    color: #79747E;
    margin-top: 2px;
  }
}

.training-amount {
  text-align: right;
  font-size: 13px;
  color: #2B2930;
}

.manager-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid #F0EDF5;

  > div {
    flex: 1;
    min-width: 0;
  }

  b {
    display: block;
    font-size: 12px;
  }

  small {
    display: block;
    font-size: 10px;
    color: #79747E;
    margin-top: 2px;
  }

  strong {
    font-size: 14px;
    color: #2B2930;
  }
}

.settlement-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 18px;

  > div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    padding: 5px 0;
    border-bottom: 1px dashed #F0EDF5;

    span {
      color: #79747E;
    }

    b {
      color: #2B2930;
      font-weight: 500;
      white-space: nowrap;
    }
  }

  .emphasis {
    grid-column: 1 / -1;
    border-bottom: 0;
    background: #F4F0FA;
    border-radius: 7px;
    padding: 9px 12px;

    span, b {
      color: #4A3B63;
      font-weight: 600;
    }
  }
}

.empty-drawer {
  padding: 80px 20px;
  text-align: center;
  color: #79747E;
}

/* 基础薪资构成明细 */
.compose-box {
  margin-top: 14px;
  border: 1px solid #EDE8F2;
  border-radius: 9px;
  padding: 12px 14px;
  background: #FAF9FC;
}

.compose-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;

  span {
    font-size: 12px;
    font-weight: 600;
    color: #49454F;
  }

  small {
    font-size: 10px;
    color: #79747E;
  }
}

.compose-row {
  display: grid;
  grid-template-columns: 96px 120px 1fr;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px dashed #EDE8F2;

  &:first-of-type {
    border-top: 0;
  }

  span {
    font-size: 11px;
    color: #79747E;
  }

  b {
    font-size: 12px;
    color: #2B2930;
    font-weight: 600;
    white-space: nowrap;
  }

  em {
    font-style: normal;
    font-size: 10px;
    color: #9A94A3;
    line-height: 1.5;
  }

  &.total {
    border-top: 1px solid #E3DCEC;
    background: #F4F0FA;
    border-radius: 7px;
    padding: 8px 10px;
    margin-top: 6px;

    span, b {
      color: #4A3B63;
      font-weight: 600;
    }
  }
}

/* 复购门槛进度 */
.progress-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 14px;
}

.progress-item {
  border: 1px solid #EDE8F2;
  border-radius: 9px;
  padding: 10px 12px;
  background: #fff;

  &.wide {
    grid-column: 1 / -1;
  }

  .progress-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;

    span {
      font-size: 11px;
      color: #79747E;
    }

    b {
      font-size: 12px;
      color: #2B2930;
      font-weight: 600;
    }
  }

  small {
    display: block;
    margin-top: 6px;
    font-size: 10px;
    color: #9A94A3;
    line-height: 1.6;
  }
}
</style>
