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
          <span>预估，最终以财务结算为准</span>
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
            <small>基础接单奖励</small>
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
          <h3>基础接单奖励</h3>
          <span>{{ money(board.base.minutes) }} 分钟 × {{ decimal(board.base.coefficient) }}</span>
        </div>
        <div class="band-track">
          <div
            v-for="(band, index) in bands"
            :key="band.minMinutes"
            :class="['band-step', {reached: reachedBand(index), current: currentBandIndex === index}]">
            <i class="dot"></i>
            <b>{{ band.minMinutes }} 分钟</b>
            <small>× {{ decimal(band.coefficient) }}</small>
          </div>
        </div>
        <p class="hint-line">{{ board.base.nextBandHint || '当前时长档位已记录' }}</p>
        <p v-if="board.base.newPartner" class="hint-line">新人合作期系数单独适用，不参与上述档位累加。</p>
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
            样本 {{ board.repurchase.retentionSample || 0 }} 人次，60 天内再次到店 {{ board.repurchase.retainedVisits || 0 }} 人次。
            {{ board.repurchase.retentionEligible ? '门槛已达成，复购奖励计入本月。' : '门槛未达成，复购奖励暂不计入。' }}
          </p>
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
          <div><span>基础接单奖励</span><b>¥{{ money(board.settlement.baseReward) }}</b></div>
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
    loading: {type: Boolean, default: false}
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
    reachedTier(index) {
      return this.currentTierIndex >= 0 && index <= this.currentTierIndex
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
</style>
