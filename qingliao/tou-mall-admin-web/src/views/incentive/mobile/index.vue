<template>
  <div class="mv-page">
    <div class="mv-shell">
      <div class="mv-pin" :class="{pinned: pageScrolled}">
        <header class="mv-top">
          <router-link class="brand" to="/my-rewards" aria-label="轻疗疗愈空间">
            <img class="brand-wordmark" src="@/assets/images/brand/logo-full-dark.svg" alt="Full愈 轻疗疗愈空间">
          </router-link>
          <div class="top-actions">
            <router-link class="top-link" to="/home">‹ 返回后台</router-link>
            <button
              type="button"
              class="icon-button"
              :aria-label="moneyHidden ? '显示奖励金额' : '隐藏奖励金额'"
              @click="moneyHidden = !moneyHidden">
              <svg v-if="moneyHidden" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 3l18 18"/>
                <path d="M10.6 10.7a3 3 0 0 0 4.2 4.2"/>
                <path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c5.5 0 9 5.5 9 5.5a17 17 0 0 1-2.4 3.1"/>
                <path d="M6.4 6.6A17.6 17.6 0 0 0 3 10.5S6.5 16 12 16c1 0 1.9-.2 2.7-.5"/>
              </svg>
              <svg v-else class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        </header>

        <div class="pin-month">
          <section class="month-bar" aria-label="选择统计月份">
            <button type="button" class="month-arrow" aria-label="上一个月" @click="shiftMonth(-1)">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
            </button>
            <label class="month-center">
              <span>统计月份</span>
              <input
                v-model="month"
                type="month"
                :max="currentMonth"
                aria-label="统计月份"
                @change="onMonthChange">
            </label>
            <button
              type="button"
              class="month-arrow"
              :disabled="month >= currentMonth"
              aria-label="下一个月"
              @click="shiftMonth(1)">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
            </button>
          </section>
          <div class="cutoff-line">
            <span v-if="board">{{ cutoffText }}</span>
            <span v-else>正在读取 {{ monthText(month) }} 的数据</span>
            <button v-if="month !== currentMonth" type="button" class="text-button" @click="resetMonth">回到本月</button>
          </div>
        </div>
      </div>

      <main class="mv-main">

        <div v-if="loading" class="loading-card" aria-live="polite">
          <div class="skeleton wide"></div>
          <div class="skeleton"></div>
          <div class="skeleton short"></div>
          <p>正在计算所选月份的接单奖励…</p>
        </div>

        <section v-else-if="error" class="error-card" role="alert">
          <h2>这一页暂时没有打开</h2>
          <p>{{ error }}</p>
          <button type="button" class="primary-button" @click="loadData">重新读取</button>
        </section>

        <template v-else-if="board">
          <section class="identity-card">
            <div class="avatar">{{ initial }}</div>
            <div class="identity-text">
              <h1>{{ board.massagistName || '疗愈师' }}</h1>
              <p>
                {{ board.shopName || '未分配门店' }}
                <span class="dot">·</span>
                {{ board.cooperationStatus || '合作中' }}
              </p>
            </div>
            <span class="month-badge">{{ monthText(board.month) }}</span>
          </section>

          <section class="card detail-card">
            <button
              type="button"
              class="card-toggle"
              :aria-expanded="open('achievement') ? 'true' : 'false'"
              @click="toggleDetail('achievement')">
              <span>
                <b class="toggle-title">累计成就</b>
                <small>加入第 {{ joinDaysText }} 天 · 累计 {{ count(achievement.totalServiceMinutes) }} 分钟 · {{ count(achievement.customerCount) }} 位客人</small>
              </span>
              <span class="toggle-side">
                <em class="toggle-meta">截至 {{ asOfText }}</em>
                <svg class="icon" :class="{rotated: open('achievement')}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
              </span>
            </button>

            <div v-show="open('achievement')" class="card-body">
                <div class="achievement-grid">
                  <div>
                    <strong>{{ joinDaysText }}</strong>
                    <small>加入天数</small>
                  </div>
                  <div>
                    <strong>{{ count(achievement.totalServiceMinutes) }}</strong>
                    <small>累计服务分钟</small>
                  </div>
                  <div>
                    <strong>{{ count(achievement.customerCount) }}</strong>
                    <small>服务客人 · 位</small>
                  </div>
                </div>
                <div class="fan-row">
                  <svg class="icon heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 8 15 8 15s13-10 8-15z"/>
                  </svg>
                  <div>
                    <b>{{ achievement.topFanMasked ? '头号粉丝 · ' + achievement.topFanMasked : '暂无服务记录' }}</b>
                    <p>{{ achievement.topFanVisits ? '累计到店 ' + achievement.topFanVisits + ' 次' : '完成服务后在这里积累' }}</p>
                  </div>
                </div>
                <p class="card-note">加入于 {{ joinDateText }}；累计成就统计至所选月份的截止日，客户号码已脱敏。</p>
            </div>
          </section>

          <section class="reward-hero">
            <div class="hero-top">
              <span class="hero-label">{{ monthText(board.month) }}{{ published ? '已发布结算' : '接单奖励' }}</span>
              <span class="hero-tag">{{ published ? '已发布' : '预估' }}</span>
            </div>
            <div class="hero-value">{{ cash(published ? published.subtotal : settlement.subtotal) }}</div>
            <p class="hero-note">
              {{ published
                ? '财务已发布本月的结算快照，金额作为发放依据；下方过程数据仅供参考。'
                : '基础、培训、复购' + (manager.manager ? '、店长' : '') + '奖励合计，仅含已满足条件的部分。' }}
            </p>
            <div class="hero-settle">
              <span>{{ published ? '已发布应发' : '预计合作结算' }}</span>
              <b>{{ cash(published ? published.net : settlement.net) }}</b>
            </div>
          </section>

          <div class="detail-bar">
            <span class="detail-label">奖励明细 <em>点开卡片查看计算过程</em></span>
            <button type="button" class="detail-action" @click="toggleAllDetails">
              {{ allDetailsOpen ? '全部收起' : '全部展开' }}
            </button>
          </div>

          <section v-if="published" class="card detail-card published-card">
            <button
              type="button"
              class="card-toggle"
              :aria-expanded="open('published') ? 'true' : 'false'"
              @click="toggleDetail('published')">
              <span>
                <b class="toggle-title">已发布结算单 <em class="status-tag done">已发布</em></b>
                <small>{{ monthText(published.monthCode) }} · {{ published.publishedTime ? dateTime(published.publishedTime) + ' 发布' : '已发布' }} · 金额已冻结</small>
              </span>
              <span class="toggle-side">
                <strong class="toggle-amount">{{ cash(published.net) }}</strong>
                <svg class="icon" :class="{rotated: open('published')}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
              </span>
            </button>

            <div v-show="open('published')" class="card-body">
              <div class="compose-box">
                <div class="compose-head">
                  <span>结算构成（快照）</span>
                  <small>发布后金额冻结，不随排班、考核与规则变化</small>
                </div>
                <div class="compose-row">
                  <span>基础服务费</span>
                  <b>{{ cash(published.baseAmount) }}</b>
                  <em>折算 {{ count(published.countedMinutes) }} 分</em>
                </div>
                <div v-if="numberValue(published.managerAmount) > 0" class="compose-row">
                  <span>店长奖励</span>
                  <b>{{ cash(published.managerAmount) }}</b>
                </div>
                <div class="compose-row">
                  <span>培训奖励</span>
                  <b>{{ cash(published.trainingAmount) }}</b>
                </div>
                <div class="compose-row">
                  <span>复购激励</span>
                  <b>{{ cash(published.repurchaseAmount) }}</b>
                  <em v-if="numberValue(published.repurchasePotential) > numberValue(published.repurchaseAmount)">
                    未达门槛潜力 {{ cash(published.repurchasePotential) }}
                  </em>
                </div>
                <div class="compose-row">
                  <span>其他调整</span>
                  <b>{{ cash(published.adjustmentAmount) }}</b>
                </div>
                <div class="compose-row total">
                  <span>小计</span>
                  <b>{{ cash(published.subtotal) }}</b>
                </div>
              </div>

              <div class="compose-box">
                <div class="compose-row">
                  <span>含服务费金额</span>
                  <b>{{ cash(published.gross) }}</b>
                </div>
                <div class="compose-row">
                  <span>税前应得</span>
                  <b>{{ cash(published.preTax) }}</b>
                </div>
                <div class="compose-row">
                  <span>个税</span>
                  <b>{{ cash(published.tax) }}</b>
                </div>
                <div class="compose-row total">
                  <span>应发</span>
                  <b>{{ cash(published.net) }}</b>
                </div>
              </div>

              <p v-if="published.remark" class="hint-line">财务备注：{{ published.remark }}</p>
              <p class="card-note">结算单由财务确认后发布；如需调整请先联系门店店长或财务，撤销确认需超级管理员操作。</p>
            </div>
          </section>

          <section class="card detail-card">
            <button
              type="button"
              class="card-toggle"
              :aria-expanded="open('base') ? 'true' : 'false'"
              @click="toggleDetail('base')">
              <span>
                <b class="toggle-title">基础服务费 <em v-if="base.newPartner" class="status-tag active">新人期</em></b>
                <small>折算 {{ count(base.minutes) }} 分 × {{ decimal(base.coefficient) }} 元/分</small>
              </span>
              <span class="toggle-side">
                <strong class="toggle-amount">{{ cash(base.amount) }}</strong>
                <svg class="icon" :class="{rotated: open('base')}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
              </span>
            </button>

            <div v-show="open('base')" class="card-body">
              <div v-if="base.newPartner" class="inline-notice">
                新人合作期单价 {{ decimal(base.coefficient) }} 元/分钟，不参与下方档位累加。
              </div>

              <div class="compose-box">
                <div class="compose-head">
                  <span>折算时长构成</span>
                  <small>服务 + 接待 + 工时调整 = 计入基础服务费的分钟</small>
                </div>
                <div class="compose-row">
                  <span>服务折算</span>
                  <b>{{ count(base.serviceWeightedMinutes) }} 分</b>
                  <em>服务 {{ count(base.serviceMinutes) }} 分 · {{ base.serviceOrderCount || 0 }} 单</em>
                </div>
                <div class="compose-row">
                  <span>接待计入</span>
                  <b>{{ count(base.receptionCountedMinutes) }} 分</b>
                  <em>
                    接待 {{ count(base.receptionMinutes) }} 分 · {{ base.receptionOrderCount || 0 }} 单
                    <template v-if="base.receptionCapApplied"> · 超出上限 {{ count(base.receptionExcessMinutes) }} 分不计入</template>
                    <template v-else-if="base.receptionCapMinutes"> · 上限 {{ count(base.receptionCapMinutes) }} 分</template>
                  </em>
                </div>
                <div class="compose-row">
                  <span>工时/排班调整</span>
                  <b>{{ signedMinutes(base.adjustMinutes) }} 分</b>
                  <em>补单、请假等人力调整，可为负数</em>
                </div>
                <div class="compose-row total">
                  <span>合计折算</span>
                  <b>{{ count(base.minutes) }} 分 × {{ decimal(base.coefficient) }} 元/分 = {{ cash(base.amount) }}</b>
                  <em>按上月计入时长档位取单价</em>
                </div>
              </div>

              <div class="band-track" :class="{muted: base.newPartner}">
                <div
                  v-for="(band, index) in bands"
                  :key="band.minMinutes"
                  class="band-step"
                  :class="{reached: !base.newPartner && index <= bandIndex, current: !base.newPartner && index === bandIndex}">
                  <i class="dot"></i>
                  <b>{{ bandLabel(band.minMinutes) }}</b>
                  <small>{{ decimal(band.coefficient) }} 元/分</small>
                </div>
              </div>
              <p class="hint-line">{{ base.nextBandHint || '当前时长档位已记录' }}</p>
              <p class="card-note">全月折算分钟乘同一档位单价（元/分钟），不分段累加。达到档位起点即跳档，左闭右开。</p>
            </div>
          </section>

          <section class="card detail-card">
            <button
              type="button"
              class="card-toggle"
              :aria-expanded="open('repurchase') ? 'true' : 'false'"
              @click="toggleDetail('repurchase')">
              <span>
                <b class="toggle-title">
                  复购接单奖励
                  <em class="status-tag" :class="repurchase.retentionEligible ? 'done' : 'pending'">{{ repurchase.retentionEligible ? '留存已达标' : '留存待达标' }}</em>
                </b>
                <small>30 天复购 {{ conversionRateText }} · 10 天复购 {{ repurchase.tenDayHeadCount || 0 }} 头 · 已计入 {{ cash(repurchaseApplied) }} / 理论 {{ cash(repurchase.potentialAmount) }}</small>
              </span>
              <span class="toggle-side">
                <strong class="toggle-amount">{{ cash(repurchase.totalAmount) }}</strong>
                <svg class="icon" :class="{rotated: open('repurchase')}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
              </span>
            </button>

            <div v-show="open('repurchase')" class="card-body">
              <div class="gate-box" :class="{passed: repurchase.retentionEligible}">
                <div class="gate-head">
                  <span>老客 60 天留存率</span>
                  <b>{{ retentionRateText }} / {{ percent(repurchase.retentionThreshold, 0) }}</b>
                </div>
                <div class="progress">
                  <i :style="{width: retentionWidth}"></i>
                </div>
                <p>
                  窗口内老客到店 {{ repurchase.retentionSample || 0 }} 人次，{{ repurchase.retainedVisits || 0 }} 人次在 60 天内再次到店。
                  <template v-if="repurchase.retentionSample === 0">暂无满 60 天的老客到店样本，不参与判定。</template>
                  <template v-else-if="repurchase.retentionSample < (repurchase.minRetentionSample || 0)">
                    样本不足 {{ repurchase.minRetentionSample }} 人次，仅展示不判合格。
                  </template>
                  <template v-else-if="!repurchase.retentionEligible">门槛未达成，复购奖励暂不计入。</template>
                  <template v-else-if="numberValue(repurchase.appliedTierAmount) === 0">门槛已达成，但本月未达复购档位。</template>
                  <template v-else>门槛已达成，复购奖励计入当月。</template>
                </p>
                <p class="window-line">留存窗口 {{ repurchase.retentionWindowStart }} 至 {{ repurchase.retentionWindowEnd }}</p>
              </div>

              <div class="sample-grid">
                <div class="sample-item">
                  <div class="sample-head">
                    <span>老客样本</span>
                    <b>{{ repurchase.retentionSample || 0 }} / {{ repurchase.minRetentionSample || 0 }}</b>
                  </div>
                  <div class="progress">
                    <i :style="{width: retentionSampleWidth}"></i>
                  </div>
                  <small>不足 {{ repurchase.minRetentionSample || 0 }} 人次时留存率仅展示不判定</small>
                </div>
                <div class="sample-item">
                  <div class="sample-head">
                    <span>新客样本</span>
                    <b>{{ repurchase.newCustomerCount || 0 }} / {{ repurchase.minNewSample || 0 }}</b>
                  </div>
                  <div class="progress">
                    <i :style="{width: newSampleWidth}"></i>
                  </div>
                  <small>不足 {{ repurchase.minNewSample || 0 }} 人时 30 天档位暂不计入</small>
                </div>
              </div>

              <div class="progress-grid">
                <div class="progress-item">
                  <div class="progress-head">
                    <span>30 天档位进度</span>
                    <b>{{ conversionRateText }} → {{ repurchase.nextTierRate ? percent(repurchase.nextTierRate, 0) : '已到顶' }}</b>
                  </div>
                  <div class="progress">
                    <i :style="{width: tierProgressWidth}"></i>
                  </div>
                  <small v-if="repurchase.nextTierRate">
                    还差 {{ decimal(repurchase.neededForNextTier, 1) }} 个加权新客，可达 {{ cash(repurchase.nextTierAmount, 0) }}
                  </small>
                  <small v-else>已达成最高档 30 天复购奖励</small>
                </div>
                <div class="progress-item">
                  <div class="progress-head">
                    <span>复购奖励计入进度</span>
                    <b>{{ cash(repurchaseApplied) }} / {{ cash(repurchase.potentialAmount) }}</b>
                  </div>
                  <div class="progress">
                    <i :style="{width: repurchaseProgressWidth}"></i>
                  </div>
                  <small>未计入部分待门槛/档位达成后自动补入</small>
                </div>
              </div>

              <div class="metric-row">
                <div>
                  <small>新客 30 天复购率</small>
                  <b>{{ conversionRateText }}</b>
                  <span>
                    新客 {{ repurchase.newCustomerCount || 0 }} 人
                    <template v-if="!repurchase.conversionSampleSufficient"> · 样本需满 {{ repurchase.minNewSample }} 人</template>
                  </span>
                </div>
                <div>
                  <small>30 天档位奖励</small>
                  <b>{{ cash(repurchase.appliedTierAmount) }}</b>
                  <span>{{ tierStateText }}</span>
                </div>
              </div>

              <div class="tier-track">
                <div
                  v-for="(tier, index) in tiers"
                  :key="tier.rate"
                  class="tier-step"
                  :class="{
                    reached: index <= tierIndex,
                    current: index === tierIndex,
                    pending: index <= tierIndex && !repurchase.retentionEligible
                  }">
                  <b>{{ percent(tier.rate, 0) }}</b>
                  <small>{{ cash(tier.amount, 0) }}</small>
                </div>
              </div>
              <p class="hint-line">{{ tierHint }}</p>
              <p class="card-note">取最高一档，不叠加；新客样本不足 {{ repurchase.minNewSample || 30 }} 人时，30 天档位暂不计入。</p>

              <div class="sub-divider"></div>

              <div class="metric-row">
                <div>
                  <small>新客 10 天复购</small>
                  <b>{{ repurchase.tenDayHeadCount || 0 }} 条</b>
                  <span>加权 {{ decimal(repurchase.tenDayWeightedHeads) }} 位 · 共同服务按权重分摊</span>
                </div>
                <div>
                  <small>10 天复购奖励</small>
                  <b>{{ cash(repurchase.appliedTenDayAmount) }}</b>
                  <span>{{ repurchase.retentionEligible ? '按递增单价累计' : '留存达标后计入' }}</span>
                </div>
              </div>

              <div class="next-reward">
                <div>
                  <span class="mini-label">下一个激励</span>
                  <p>第 {{ (repurchase.tenDayHeadCount || 0) + 1 }} 位新客 10 天内再来</p>
                  <small>按完整归属一位试算，实际以订单归属为准</small>
                </div>
                <strong>{{ nextTenDayText }}</strong>
              </div>
              <p class="card-note">
                10 天复购按 {{ monthText(board.month) }} 首单归属；单价采用斐波那契递增，单笔封顶 {{ cash(fibCap, 0) }} 后继续按封顶价累计。
              </p>
            </div>
          </section>

          <section class="card detail-card">
            <button
              type="button"
              class="card-toggle"
              :aria-expanded="open('training') ? 'true' : 'false'"
              @click="toggleDetail('training')">
              <span>
                <b class="toggle-title">
                  培训达标奖励
                  <em v-if="completedThisMonthCount" class="status-tag done">当月达标 {{ completedThisMonthCount }}</em>
                </b>
                <small>已登记 {{ registeredTrainingCount }} / {{ trainingProjects.length }} 项 · 进行中 {{ activeTraining.length }} 项</small>
              </span>
              <span class="toggle-side">
                <strong class="toggle-amount">{{ cash(training.earnedAmount) }}</strong>
                <svg class="icon" :class="{rotated: open('training')}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
              </span>
            </button>

            <div v-show="open('training')" class="card-body">
              <p class="card-note intro-note">通过考核的次日起累计对应项目订单，达到目标后计入达标当月，之后月份不重复。</p>

              <div v-if="!activeTraining.length" class="training-empty">
                当月没有进行中的培训项目，下方为全部项目与考核状态。
              </div>

              <div v-for="group in trainingGroups" :key="group.name" class="training-group">
                <h3>{{ group.name }}</h3>
                <article v-for="project in group.projects" :key="project.projectKey" class="training-row">
                  <div class="training-row-head">
                    <div class="training-name">
                      <b>{{ project.projectName }}</b>
                      <small>{{ project.passedAt ? project.passedAt + ' 通过考核 · 次日起累计' : '尚未登记考核' }}</small>
                    </div>
                    <span class="status-tag" :class="trainingTagClass(project)">{{ trainingLabel(project) }}</span>
                  </div>
                  <div class="training-line">
                    <div class="progress">
                      <i :style="{width: progressWidth(project.progressPercent)}"></i>
                    </div>
                    <span>{{ project.count || 0 }} / {{ project.target || 0 }}</span>
                  </div>
                  <div class="training-foot">
                    <span>{{ trainingNote(project) }}</span>
                    <strong>{{ trainingAmountText(project) }}</strong>
                  </div>
                </article>
              </div>

              <p class="card-note">
                全感舒筋 6 个部位与头部水疗 60 / 90 分钟分别独立累计；未登记考核的项目不累计。
              </p>
            </div>
          </section>

          <section v-if="manager.manager" class="card detail-card">
            <button
              type="button"
              class="card-toggle"
              :aria-expanded="open('manager') ? 'true' : 'false'"
              @click="toggleDetail('manager')">
              <span>
                <b class="toggle-title">
                  店长奖励
                  <em class="status-tag" :class="managerAchievedCount ? 'done' : 'muted'">{{ managerAchievedCount }} / {{ manager.shops.length }} 家达成</em>
                </b>
                <small>整店实际业绩达到目标后，按全部实际业绩提点</small>
              </span>
              <span class="toggle-side">
                <strong class="toggle-amount">{{ cash(manager.totalAmount) }}</strong>
                <svg class="icon" :class="{rotated: open('manager')}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
              </span>
            </button>

            <div v-show="open('manager')" class="card-body">
              <div v-for="shop in manager.shops" :key="shop.shopId" class="manager-row">
                <div class="manager-row-head">
                  <b>{{ shop.shopName || ('门店 ' + shop.shopId) }}</b>
                  <span class="status-tag" :class="shop.achieved ? 'done' : 'muted'">{{ shop.achieved ? '已达成' : '进行中' }}</span>
                </div>
                <div class="progress">
                  <i :style="{width: managerWidth(shop)}"></i>
                </div>
                <div class="manager-meta">
                  <span>实际 {{ cash(shop.actualRevenue) }} / 目标 {{ cash(shop.targetRevenue) }}</span>
                  <span>提点 {{ percent(shop.commissionRate, 0) }}</span>
                </div>
                <p class="card-note">
                  {{ shop.achieved
                    ? '目标已达成，按整店实际业绩 ' + cash(shop.actualRevenue) + ' × ' + percent(shop.commissionRate, 0) + ' 计算。'
                    : '目标尚未完成，当前为零；完成后按整店全部实际业绩提点，不只计算超出部分。' }}
                </p>
              </div>
            </div>
          </section>

          <section class="card detail-card settlement-card">
            <button
              type="button"
              class="card-toggle"
              :aria-expanded="open('settlement') ? 'true' : 'false'"
              @click="toggleDetail('settlement')">
              <span>
                <b class="toggle-title">合作结算明细</b>
                <small>接单奖励合计 {{ cash(settlement.subtotal) }} · 服务费折算与税费预估</small>
              </span>
              <span class="toggle-side">
                <strong class="toggle-amount">{{ cash(settlement.net) }}</strong>
                <svg class="icon" :class="{rotated: open('settlement')}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
              </span>
            </button>

            <div v-show="open('settlement')" class="settlement-body">
              <div class="kv"><span>基础服务费</span><b>{{ cash(settlement.baseReward) }}</b></div>
              <div v-if="manager.manager" class="kv"><span>店长奖励</span><b>{{ cash(settlement.managerReward) }}</b></div>
              <div class="kv"><span>培训达标奖励</span><b>{{ cash(settlement.trainingReward) }}</b></div>
              <div class="kv"><span>复购接单奖励</span><b>{{ cash(settlement.repurchaseReward) }}</b></div>
              <div v-if="numberValue(settlement.adjustment) !== 0" class="kv"><span>其他调整</span><b>{{ cash(settlement.adjustment) }}</b></div>
              <div class="kv total"><span>接单奖励合计</span><b>{{ cash(settlement.subtotal) }}</b></div>
              <div class="kv"><span>调整后合计</span><b>{{ cash(settlement.gross) }}</b></div>
              <div class="kv"><span>服务费折算（÷{{ decimal(settlement.serviceFeeDivisor || 1.068, 3) }}）</span><b>{{ cash(settlement.preTax) }}</b></div>
              <div class="kv"><span>税费预估</span><b>−{{ cash(settlement.tax) }}</b></div>
              <div class="kv emphasis"><span>预计合作结算</span><b>{{ cash(settlement.net) }}</b></div>

              <button
                type="button"
                class="tax-toggle"
                :aria-expanded="taxOpen ? 'true' : 'false'"
                @click="taxOpen = !taxOpen">
                {{ taxOpen ? '收起税费依据' : '查看税费依据' }}
              </button>
              <div v-show="taxOpen" class="tax-grid">
                <div class="kv"><span>年度累计换算金额</span><b>{{ cash(settlement.annualIncome) }}</b></div>
                <div class="kv"><span>年度计税基数</span><b>{{ cash(settlement.annualTaxableIncome) }}</b></div>
                <div class="kv"><span>连续合作月数</span><b>{{ settlement.continuousMonths || 0 }} 个月</b></div>
                <div class="kv"><span>适用税率</span><b>{{ percent(settlement.taxRate, 0) }}</b></div>
                <div class="kv"><span>速算扣除</span><b>{{ cash(settlement.quickDeduction) }}</b></div>
                <div class="kv"><span>本年已预缴</span><b>{{ cash(settlement.priorPaidTax) }}</b></div>
              </div>
              <p class="card-note">以上为预估口径，不写入正式结算单；最终金额以财务核对后的合作结算为准。</p>
            </div>
          </section>

          <section v-if="warnings.length" class="warning-card">
            <button
              type="button"
              class="warning-head"
              :aria-expanded="warningsOpen ? 'true' : 'false'"
              @click="warningsOpen = !warningsOpen">
              <span>结算前请核对 · {{ warnings.length }} 条</span>
              <svg class="icon" :class="{rotated: warningsOpen}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <ul v-show="warningsOpen">
              <li v-for="(warning, index) in warnings" :key="index">{{ warning }}</li>
            </ul>
          </section>

          <footer class="mv-footer">
            <div class="footer-lock">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2"/>
                <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
              </svg>
              仅本人可见 · 客户号码已脱敏
            </div>
            <p>奖励按所选月份计算，历史月份截至月末；当前月份截至今天。</p>
            <p>{{ configLabel }}</p>
            <p class="footer-brand">Full愈 · 放松有道，自在生活</p>
          </footer>
        </template>
      </main>
    </div>
  </div>
</template>

<script>
import incentiveApi from '@/api/incentive'
import {decimal, money, numberValue, percent} from '@/views/incentive/format'

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default {
  name: 'MyIncentiveRewards',
  data() {
    return {
      month: currentMonth(),
      currentMonth: currentMonth(),
      board: null,
      config: null,
      published: null,
      loading: false,
      error: '',
      moneyHidden: false,
      taxOpen: false,
      warningsOpen: false,
      pageScrolled: false,
      details: {
        achievement: false,
        published: false,
        base: false,
        repurchase: false,
        training: false,
        manager: false,
        settlement: false
      },
      loadToken: 0
    }
  },
  computed: {
    achievement() {
      return (this.board && this.board.achievements) || {}
    },
    base() {
      return (this.board && this.board.base) || {}
    },
    repurchase() {
      return (this.board && this.board.repurchase) || {}
    },
    training() {
      return (this.board && this.board.training) || {}
    },
    manager() {
      return (this.board && this.board.manager) || {manager: false, shops: []}
    },
    settlement() {
      return (this.board && this.board.settlement) || {}
    },
    warnings() {
      return (this.board && this.board.warnings) || []
    },
    managerAchievedCount() {
      const shops = (this.manager && this.manager.shops) || []
      return shops.filter(shop => !!shop.achieved).length
    },
    detailKeys() {
      const keys = ['achievement', 'base', 'repurchase', 'training', 'settlement']
      if (this.published) keys.splice(1, 0, 'published')
      if (this.manager.manager) keys.splice(keys.indexOf('settlement'), 0, 'manager')
      return keys
    },
    allDetailsOpen() {
      return this.detailKeys.every(key => !!this.details[key])
    },
    initial() {
      const name = (this.board && this.board.massagistName) || '愈'
      return name.slice(0, 1)
    },
    joinDateText() {
      return this.board && this.board.joinDate ? this.board.joinDate : '加入日期未维护'
    },
    joinDaysText() {
      if (!this.board || this.board.joinDays === null || this.board.joinDays === undefined) {
        return '—'
      }
      return this.count(this.board.joinDays)
    },
    asOfText() {
      if (!this.board) return '—'
      return this.board.cutoff || this.achievement.asOf || '—'
    },
    cutoffText() {
      if (!this.board) return ''
      if (this.board.currentMonth) {
        return '当前月份 · 数据统计至 ' + this.board.cutoff
      }
      return '历史月份 · 数据统计至月末 ' + this.board.cutoff
    },
    bands() {
      return this.base.bands || []
    },
    bandIndex() {
      if (!this.board || !this.board.base || this.board.base.newPartner) {
        return -1
      }
      const minutes = this.board.base.currentBandMinutes
      if (minutes === null || minutes === undefined) {
        return -1
      }
      return this.bands.findIndex(band => Number(band.minMinutes) === Number(minutes))
    },
    tiers() {
      return (this.config && this.config.tiers) || []
    },
    tierIndex() {
      const rate = this.repurchase.tierRate
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
    retentionRateText() {
      if (!this.repurchase.retentionSample) {
        return '—'
      }
      return percent(this.repurchase.retentionRate)
    },
    retentionWidth() {
      return this.progressWidth(this.repurchase.retentionRate)
    },
    retentionSampleWidth() {
      return this.progressWidth(this.ratioPercent(this.repurchase.retentionSample, this.repurchase.minRetentionSample))
    },
    newSampleWidth() {
      return this.progressWidth(this.ratioPercent(this.repurchase.newCustomerCount, this.repurchase.minNewSample))
    },
    tierProgressWidth() {
      const next = numberValue(this.repurchase.nextTierRate)
      if (next <= 0) {
        return '100%'
      }
      return this.progressWidth(numberValue(this.repurchase.conversionRate) / next * 100)
    },
    repurchaseApplied() {
      return numberValue(this.repurchase.appliedTierAmount) + numberValue(this.repurchase.appliedTenDayAmount)
    },
    repurchaseProgressWidth() {
      const potential = numberValue(this.repurchase.potentialAmount)
      if (potential <= 0) {
        return this.repurchaseApplied > 0 ? '100%' : '0%'
      }
      return this.progressWidth(this.repurchaseApplied / potential * 100)
    },
    conversionRateText() {
      if (!this.repurchase.newCustomerCount) {
        return '—'
      }
      return percent(this.repurchase.conversionRate)
    },
    tierStateText() {
      if (!this.repurchase.retentionEligible) {
        return '留存达标后计入'
      }
      if (this.repurchase.conversionSampleSufficient === false) {
        return '样本不足，暂不计档'
      }
      if (this.repurchase.tierRate !== null && this.repurchase.tierRate !== undefined) {
        return '已达到 ' + percent(this.repurchase.tierRate, 0) + ' 档'
      }
      return '尚未达到最低档'
    },
    tierHint() {
      const r = this.repurchase
      if (!r.retentionEligible) {
        return '老客留存率达标后，30 天与 10 天复购奖励才计入；当前仅展示可达金额。'
      }
      if (r.conversionSampleSufficient === false) {
        return '新客样本 ' + this.count(r.newCustomerCount) + ' / ' + this.count(r.minNewSample)
          + '，补足后才参与 30 天档位；10 天复购仍可累计。'
      }
      if (numberValue(r.nextTierRate) > 0) {
        return '距 ' + percent(r.nextTierRate, 0) + ' 档还差 ' + this.count(r.neededForNextTier)
          + ' 位加权新客，可达 ' + this.cash(r.nextTierAmount, 0) + '。'
      }
      return '已到 30 天最高档；10 天复购仍可继续累计。'
    },
    nextTenDayText() {
      return '+' + this.cash(this.repurchase.tenDayNextPrice, 0)
    },
    fibCap() {
      return this.config && this.config.config ? this.config.config.fibCap : 130
    },
    trainingProjects() {
      return this.training.projects || []
    },
    registeredTrainingCount() {
      return this.trainingProjects.filter(project => !!project.passedAt).length
    },
    completedThisMonthCount() {
      return this.trainingProjects.filter(project => project.status === 'completed-this-month').length
    },
    activeTraining() {
      const order = {'completed-this-month': 0, active: 1, upcoming: 2}
      return this.trainingProjects
        .filter(project => !!project.passedAt && project.status !== 'completed')
        .sort((a, b) => (order[a.status] === undefined ? 3 : order[a.status])
          - (order[b.status] === undefined ? 3 : order[b.status]))
    },
    trainingGroups() {
      const groups = []
      const byName = {}
      this.trainingProjects.forEach(project => {
        const name = project.projectGroup || '其他项目'
        if (byName[name] === undefined) {
          byName[name] = groups.length
          groups.push({name, projects: []})
        }
        groups[byName[name]].projects.push(project)
      })
      return groups
    },
    configLabel() {
      if (!this.config) {
        return ''
      }
      if (this.config.usingDefault) {
        return '当前使用系统默认参数'
      }
      const config = this.config.config || {}
      if (!config.effectiveMonth) {
        return ''
      }
      return '参数版本 ' + config.effectiveMonth + ' · 修订 ' + (config.revision || 1)
    }
  },
  created() {
    this.applyRouteMonth()
    this.loadData()
  },
  mounted() {
    window.addEventListener('scroll', this.onPageScroll, {passive: true})
    this.onPageScroll()
  },
  beforeDestroy() {
    window.removeEventListener('scroll', this.onPageScroll)
  },
  methods: {
    money,
    decimal,
    percent,
    numberValue,
    count(value) {
      return numberValue(value).toLocaleString('zh-CN', {maximumFractionDigits: 0})
    },
    cash(value, digits) {
      if (this.moneyHidden) {
        return '••••'
      }
      const places = digits === undefined ? 2 : digits
      return '¥' + money(value, places)
    },
    monthText(month) {
      const parts = String(month || '').split('-')
      if (parts.length !== 2) {
        return month || ''
      }
      return parts[0] + ' 年 ' + Number(parts[1]) + ' 月'
    },
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
    progressWidth(value) {
      return Math.max(0, Math.min(100, numberValue(value))) + '%'
    },
    open(key) {
      return !!this.details[key]
    },
    toggleDetail(key) {
      this.$set(this.details, key, !this.details[key])
    },
    toggleAllDetails() {
      const next = !this.allDetailsOpen
      this.detailKeys.forEach(key => this.$set(this.details, key, next))
    },
    onPageScroll() {
      this.pageScrolled = (window.scrollY || document.documentElement.scrollTop || 0) > 6
    },
    /** 实际值占目标值的比例，目标为 0 时视为已满。 */
    ratioPercent(value, target) {
      const goal = numberValue(target)
      if (goal <= 0) {
        return 100
      }
      return numberValue(value) / goal * 100
    },
    /** 带符号展示分钟数，0 不显示正号。 */
    signedMinutes(value, digits) {
      const num = numberValue(value)
      const text = money(Math.abs(num), digits === undefined ? 0 : digits)
      if (num > 0) {
        return '+' + text
      }
      if (num < 0) {
        return '-' + text
      }
      return '0'
    },
    managerWidth(shop) {
      const target = numberValue(shop.targetRevenue)
      if (target <= 0) {
        return '0%'
      }
      return this.progressWidth(numberValue(shop.actualRevenue) / target * 100)
    },
    trainingLabel(project) {
      if (!project || !project.passedAt) {
        return '未登记'
      }
      if (project.status === 'completed-this-month') {
        return '当月达标'
      }
      if (project.status === 'completed') {
        return '已达标'
      }
      if (project.status === 'upcoming') {
        return '待开始'
      }
      return '累计中'
    },
    trainingTagClass(project) {
      if (!project || !project.passedAt) {
        return 'muted'
      }
      if (project.status === 'completed-this-month') {
        return 'done'
      }
      if (project.status === 'completed') {
        return 'quiet'
      }
      if (project.status === 'upcoming') {
        return 'pending'
      }
      return 'active'
    },
    trainingNote(project) {
      if (!project || !project.passedAt) {
        return '未登记考核，暂不累计'
      }
      if (project.status === 'completed-this-month') {
        return (project.completionDate || '') + ' 达标 · 计入当月'
      }
      if (project.status === 'completed') {
        return (project.completionMonth || '') + ' 已计入 · 不重复'
      }
      if (project.status === 'upcoming') {
        return (project.startDate || '') + ' 起开始累计'
      }
      return '还差 ' + (project.remaining || 0) + ' 单'
    },
    trainingAmountText(project) {
      if (!project || !project.passedAt) {
        return '—'
      }
      if (project.status === 'completed') {
        return '已计入'
      }
      if (project.status === 'completed-this-month') {
        return '+' + this.cash(project.earnedAmount, 0)
      }
      return '达标 ' + this.cash(project.configuredAmount, 0)
    },
    shiftMonth(delta) {
      if (this.loading) {
        return
      }
      const parts = this.month.split('-')
      const date = new Date(Number(parts[0]), Number(parts[1]) - 1 + delta, 1)
      const next = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
      if (next > this.currentMonth) {
        return
      }
      this.month = next
      this.loadData()
    },
    onMonthChange() {
      if (!/^\d{4}-\d{2}$/.test(this.month)) {
        this.month = this.currentMonth
      }
      if (this.month > this.currentMonth) {
        this.month = this.currentMonth
      }
      this.loadData()
    },
    resetMonth() {
      this.month = this.currentMonth
      this.loadData()
    },
    applyRouteMonth() {
      const query = (this.$route && this.$route.query) || {}
      const month = typeof query.month === 'string' ? query.month : ''
      if (/^\d{4}-\d{2}$/.test(month) && month <= this.currentMonth) {
        this.month = month
      }
    },
    dateTime(value) {
      return value ? String(value).replace('T', ' ').slice(0, 16) : '—'
    },
    async loadData() {
      const token = ++this.loadToken
      this.loading = true
      this.error = ''
      this.board = null
      this.config = null
      this.published = null
      this.taxOpen = false
      this.warningsOpen = false
      try {
        const responses = await Promise.all([
          incentiveApi.mine({month: this.month}),
          incentiveApi.config({month: this.month}),
          incentiveApi.mySettlement({month: this.month}).catch(() => null)
        ])
        if (token !== this.loadToken) {
          return
        }
        this.board = responses[0].data || null
        this.config = responses[1].data || null
        const settled = responses[2] && responses[2].data
        this.published = settled && settled.settled ? settled.settlement : null
      } catch (e) {
        if (token !== this.loadToken) {
          return
        }
        this.error = '该月份数据暂时无法读取。请确认账号已关联疗愈师档案，或稍后重新读取。'
      } finally {
        if (token === this.loadToken) {
          this.loading = false
        }
      }
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.mv-page {
  --wood-700: #6B463C;
  --wood-900: #4B3621;
  --cream: #F5E8D8;
  --paper: #FFFFFF;
  --soft: #FFF3E0;
  --disabled: #F1E7DF;
  --line: #D8CBBB;
  --line-light: #E8DED2;
  --ink: #4B3621;
  --muted: #6B463C;
  --on-dark: #F5E8D8;
  --on-dark-muted: #EEE0C6;
  --error: #A63B2B;
  min-height: 100vh;
  background: var(--cream);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}

.mv-page button,
.mv-page input {
  font-family: inherit;
}

.mv-shell {
  min-height: 100vh;
  background: var(--cream);
}

.mv-pin {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--cream);
  transition: box-shadow 0.18s ease;

  &.pinned {
    box-shadow: 0 10px 22px rgba(75, 54, 33, 0.09);
  }
}

.mv-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 54px;
  padding: 0 16px;
  background: var(--cream);
}

.brand {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  text-decoration: none;
}

.brand-wordmark {
  display: block;
  height: 22px;
  width: auto;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.top-link {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--wood-700);
  font-size: 12px;
  text-decoration: none;

  &:hover {
    background: var(--disabled);
  }
}

.icon-button {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--wood-700);
  cursor: pointer;

  &:hover {
    background: var(--disabled);
  }
}

.icon {
  width: 19px;
  height: 19px;
  flex-shrink: 0;
}

.pin-month {
  padding: 6px 16px 8px;
  border-bottom: 1px solid var(--line-light);

  .cutoff-line {
    margin-top: 4px;
  }
}

.mv-main {
  max-width: 480px;
  margin: 0 auto;
  padding: 12px 16px 44px;
}

.month-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--paper);
}

.month-arrow {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--wood-700);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--disabled);
  }

  &:disabled {
    opacity: 0.34;
    cursor: not-allowed;
  }
}

.month-center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  span {
    font-size: 9px;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  input {
    width: 100%;
    max-width: 168px;
    min-height: 30px;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--wood-900);
    font-size: 16px;
    font-weight: 600;
    text-align: center;
    font-variant-numeric: tabular-nums;
    -webkit-appearance: none;
  }

  input::-webkit-calendar-picker-indicator {
    opacity: 0.55;
  }
}

.cutoff-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 28px;
  padding: 0 4px;
  font-size: 10px;
  color: var(--muted);
}

.text-button {
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--wood-700);
  font-size: 11px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.loading-card,
.error-card {
  margin-top: 10px;
  padding: 22px 18px;
  border: 1px solid var(--line-light);
  border-radius: 18px;
  background: var(--paper);
}

.loading-card p {
  margin: 18px 0 0;
  font-size: 11px;
  color: var(--muted);
}

.skeleton {
  height: 14px;
  margin-top: 10px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--disabled) 0%, var(--soft) 50%, var(--disabled) 100%);
  background-size: 220% 100%;
  animation: shimmer 1.4s ease-in-out infinite;

  &.wide {
    height: 34px;
    width: 62%;
    margin-top: 0;
  }

  &.short {
    width: 48%;
  }
}

@keyframes shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

.error-card {
  h2 {
    margin: 0 0 8px;
    font-size: 17px;
    letter-spacing: -0.03em;
  }

  p {
    margin: 0 0 18px;
    font-size: 12px;
    line-height: 1.8;
    color: var(--muted);
  }
}

.primary-button {
  min-height: 42px;
  padding: 0 18px;
  border: 1px solid var(--wood-700);
  border-radius: 9px;
  background: var(--wood-700);
  color: var(--paper);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: #5A3A32;
  }
}

.identity-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 2px 13px;
}

.avatar {
  width: 47px;
  height: 47px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--wood-700);
  color: var(--paper);
  font-size: 19px;
  font-weight: 600;
}

.identity-text {
  flex: 1;
  min-width: 0;

  h1 {
    margin: 0;
    font-size: 19px;
    font-weight: 650;
    letter-spacing: -0.03em;
    overflow-wrap: anywhere;
  }

  p {
    margin: 3px 0 0;
    font-size: 11px;
    color: var(--muted);
  }
}

.dot {
  margin: 0 2px;
}

.month-badge {
  flex-shrink: 0;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}

.card {
  margin-top: 12px;
  padding: 18px;
  border: 1px solid var(--line-light);
  border-radius: 18px;
  background: var(--paper);
}

.detail-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 2px 0;

  .detail-label {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.01em;
    color: var(--wood-900);

    em {
      font-size: 9px;
      font-style: normal;
      font-weight: 400;
      color: var(--muted);
    }
  }

  .detail-action {
    min-height: 30px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: transparent;
    color: var(--wood-700);
    font-size: 10px;
    cursor: pointer;

    &:hover {
      background: var(--disabled);
    }
  }
}

.detail-card {
  padding: 0;
  overflow: hidden;

  .card-body {
    padding: 14px 18px 16px;
    border-top: 1px solid var(--line-light);

    > :first-child {
      margin-top: 0;
    }
  }
}

.achievement-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 16px 0 14px;

  > div + div {
    padding-left: 12px;
    border-left: 1px solid var(--line-light);
  }

  strong {
    display: block;
    font-size: 23px;
    font-weight: 600;
    letter-spacing: -0.05em;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
  }

  small {
    display: block;
    margin-top: 2px;
    font-size: 10px;
    line-height: 1.5;
    color: var(--muted);
  }
}

.fan-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding-top: 12px;
  border-top: 1px solid var(--line-light);

  .heart {
    width: 22px;
    height: 22px;
    color: var(--wood-700);
  }

  b {
    display: block;
    font-size: 12px;
    font-weight: 600;
  }

  p {
    margin: 2px 0 0;
    font-size: 10px;
    color: var(--muted);
  }
}

.card-note {
  margin: 10px 0 0;
  font-size: 10px;
  line-height: 1.8;
  color: var(--muted);
}

.reward-hero {
  margin-top: 12px;
  padding: 21px 21px 18px;
  border-radius: 20px;
  background: linear-gradient(135deg, #3F2D1C 0%, #4B3621 55%, #6B463C 100%);
  color: var(--on-dark);
  box-shadow: 0 18px 42px rgba(75, 54, 33, 0.2);
}

.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.hero-label {
  font-size: 12px;
  color: var(--on-dark-muted);
}

.hero-tag {
  padding: 3px 8px;
  border: 1px solid rgba(245, 232, 216, 0.44);
  border-radius: 5px;
  font-size: 9px;
  color: var(--on-dark-muted);
}

.hero-value {
  margin: 10px 0 4px;
  font-size: 42px;
  font-weight: 600;
  line-height: 1.16;
  letter-spacing: -0.06em;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.hero-note {
  margin: 0;
  font-size: 10px;
  line-height: 1.7;
  color: var(--on-dark-muted);
}

.hero-settle {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding-top: 13px;
  border-top: 1px solid rgba(245, 232, 216, 0.28);

  span {
    font-size: 11px;
    color: var(--on-dark-muted);
  }

  b {
    font-size: 21px;
    font-weight: 600;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }
}

.inline-notice {
  margin-top: 13px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--soft);
  font-size: 11px;
  line-height: 1.7;
}

.published-card {
  border: 1px solid var(--wood-700);
  box-shadow: 0 10px 26px rgba(75, 54, 33, 0.12);
}

.band-track {
  display: flex;
  margin-top: 18px;

  &.muted {
    opacity: 0.5;
  }
}

.band-step {
  position: relative;
  flex: 1;
  min-width: 0;
  padding-top: 17px;
  text-align: center;

  &::before {
    content: '';
    position: absolute;
    top: 6px;
    left: -50%;
    right: 50%;
    height: 2px;
    background: var(--line-light);
  }

  &:first-child::before {
    display: none;
  }

  .dot {
    position: absolute;
    top: 2px;
    left: 50%;
    width: 10px;
    height: 10px;
    margin: 0;
    border: 2px solid var(--line);
    border-radius: 50%;
    background: var(--paper);
    transform: translateX(-50%);
    z-index: 1;
  }

  b {
    display: block;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--ink);
  }

  small {
    display: block;
    margin-top: 1px;
    font-size: 9px;
    color: var(--muted);
  }

  &.reached {
    &::before {
      background: var(--wood-700);
    }

    .dot {
      border-color: var(--wood-700);
      background: var(--wood-700);
    }
  }

  &.current .dot {
    box-shadow: 0 0 0 4px rgba(107, 70, 60, 0.14);
  }

  &.current b {
    color: var(--wood-700);
  }
}

.hint-line {
  margin: 13px 0 0;
  padding: 9px 11px;
  border-radius: 8px;
  background: var(--disabled);
  font-size: 11px;
  line-height: 1.7;
}

.gate-box {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--line-light);
  border-radius: 10px;
  background: var(--soft);

  &.passed {
    border-color: var(--line);
  }

  .gate-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
    font-size: 12px;

    b {
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  }

  p {
    margin: 8px 0 0;
    font-size: 10px;
    line-height: 1.75;
    color: var(--muted);
  }

  .window-line {
    margin-top: 3px;
    color: var(--wood-700);
  }
}

.progress {
  height: 6px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--disabled);

  i {
    display: block;
    height: 100%;
    border-radius: 8px;
    background: var(--wood-700);
  }
}

.compose-box {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--line-light);
  border-radius: 10px;
  background: var(--soft);

  .compose-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line-light);

    span {
      font-size: 11px;
      font-weight: 600;
      color: var(--wood-700);
    }

    small {
      font-size: 9px;
      line-height: 1.6;
      color: var(--muted);
    }
  }

  .compose-row {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 2px 10px;
    padding: 7px 0 0;

    span {
      font-size: 11px;
      color: var(--muted);
    }

    b {
      justify-self: end;
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    em {
      grid-column: 1 / -1;
      font-size: 9px;
      font-style: normal;
      line-height: 1.6;
      color: var(--muted);
    }

    &.total {
      margin-top: 4px;
      padding-top: 8px;
      border-top: 1px dashed var(--line);

      span,
      b {
        color: var(--wood-700);
      }
    }
  }
}

.progress-grid {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.sample-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;

  .sample-item {
    padding: 8px 9px;
    border-radius: 8px;
    background: var(--disabled);
  }

  .sample-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 6px;

    span {
      font-size: 10px;
      color: var(--muted);
    }

    b {
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  }

  small {
    display: block;
    margin-top: 6px;
    font-size: 9px;
    line-height: 1.55;
    color: var(--muted);
  }
}

.progress-item {
  padding: 10px 11px;
  border: 1px solid var(--line-light);
  border-radius: 9px;
  background: var(--paper);

  .progress-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 7px;

    span {
      font-size: 11px;
      color: var(--ink);
    }

    b {
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
  }

  .progress {
    height: 5px;
  }

  small {
    display: block;
    margin-top: 6px;
    font-size: 9px;
    line-height: 1.6;
    color: var(--muted);
  }
}

.metric-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 16px;

  > div + div {
    padding-left: 14px;
    border-left: 1px solid var(--line-light);
  }

  small {
    display: block;
    font-size: 10px;
    color: var(--muted);
  }

  b {
    display: block;
    margin: 4px 0 2px;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }

  span {
    display: block;
    font-size: 9px;
    line-height: 1.6;
    color: var(--muted);
  }
}

.tier-track {
  display: flex;
  gap: 5px;
  margin-top: 12px;
}

.tier-step {
  flex: 1;
  min-width: 0;
  padding: 7px 2px;
  border: 1px solid var(--line-light);
  border-radius: 7px;
  text-align: center;

  b {
    display: block;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  small {
    display: block;
    font-size: 9px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &.reached {
    border-color: var(--line);
    background: var(--soft);
  }

  &.pending {
    border-style: dashed;
    background: transparent;
  }

  &.current {
    border-color: var(--wood-700);
    background: var(--wood-700);

    b,
    small {
      color: var(--paper);
    }
  }
}

.sub-divider {
  height: 1px;
  margin: 18px 0 0;
  background: var(--line-light);
}

.next-reward {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--soft);

  .mini-label {
    display: block;
    font-size: 9px;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  p {
    margin: 2px 0;
    font-size: 12px;
    font-weight: 600;
  }

  small {
    display: block;
    font-size: 9px;
    line-height: 1.6;
    color: var(--muted);
  }

  strong {
    flex-shrink: 0;
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.05em;
    color: var(--wood-700);
    font-variant-numeric: tabular-nums;
  }
}

.intro-note {
  margin-top: 12px;
}

.training-group {
  margin-top: 14px;

  h3 {
    margin: 0 0 2px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--wood-700);
  }
}

.training-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--line-light);

  &:last-child {
    border-bottom: 0;
    padding-bottom: 2px;
  }
}

.training-row-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.training-name {
  min-width: 0;

  b {
    display: block;
    font-size: 12px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  small {
    display: block;
    margin-top: 2px;
    font-size: 9px;
    line-height: 1.6;
    color: var(--muted);
  }
}

.status-tag {
  flex-shrink: 0;
  padding: 2px 6px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--paper);
  color: var(--muted);
  font-size: 9px;
  font-weight: 500;
  line-height: 1.6;
  white-space: nowrap;

  &.done {
    border-color: var(--wood-700);
    background: var(--wood-700);
    color: var(--paper);
  }

  &.active {
    border-color: var(--line);
    background: var(--soft);
    color: var(--wood-700);
  }

  &.pending {
    border-style: dashed;
  }

  &.quiet,
  &.muted {
    color: var(--muted);
  }
}

.training-line {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 9px;

  .progress {
    flex: 1;
    height: 4px;
  }

  span {
    flex-shrink: 0;
    font-size: 9px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
}

.training-foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  font-size: 9px;
  color: var(--muted);

  span {
    min-width: 0;
  }

  strong {
    flex-shrink: 0;
    color: var(--ink);
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
}

.training-empty {
  margin-top: 14px;
  padding: 13px;
  border-radius: 9px;
  background: var(--disabled);
  font-size: 11px;
  line-height: 1.8;
  color: var(--muted);
}

.manager-row {
  padding-top: 14px;

  & + & {
    margin-top: 14px;
    border-top: 1px solid var(--line-light);
  }
}

.manager-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;

  b {
    font-size: 12px;
    font-weight: 600;
  }
}

.manager-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  font-size: 9px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.settlement-card {
  .settlement-body {
    padding: 10px 18px 16px;
  }
}

.card-toggle {
  width: 100%;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 18px;
  border: 0;
  background: var(--paper);
  color: var(--ink);
  text-align: left;
  cursor: pointer;

  > span:first-child {
    min-width: 0;
    flex: 1;
  }

  b {
    display: block;
    font-size: 14px;
    font-weight: 650;
  }

  small {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: 3px;
    font-size: 9px;
    line-height: 1.65;
    color: var(--muted);
  }

  .icon {
    flex-shrink: 0;
    transition: transform 0.16s ease;
  }

  .rotated {
    transform: rotate(180deg);
  }

  .toggle-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .toggle-side {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .toggle-amount {
    font-size: 19px;
    font-weight: 650;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .toggle-meta {
    font-size: 9px;
    font-style: normal;
    color: var(--muted);
    white-space: nowrap;
  }

  &:hover {
    background: var(--soft);
  }
}

.settlement-body {
  border-top: 1px solid var(--line-light);
}

.kv {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 7px 0;
  border-bottom: 1px dashed var(--line-light);
  font-size: 11px;

  span {
    color: var(--muted);
  }

  b {
    flex-shrink: 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  &.total {
    margin-top: 3px;
    border-bottom: 1px solid var(--line);
  }

  &.emphasis {
    margin-top: 6px;
    padding: 10px 11px;
    border: 0;
    border-radius: 7px;
    background: var(--disabled);

    span,
    b {
      color: var(--wood-900);
      font-weight: 600;
    }
  }
}

.tax-toggle {
  min-height: 36px;
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--wood-700);
  font-size: 10px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.tax-grid {
  margin-top: 4px;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--disabled);

  .kv {
    border-bottom-style: solid;
    border-bottom-color: rgba(75, 54, 33, 0.09);
    font-size: 10px;

    &:last-child {
      border-bottom: 0;
    }
  }
}

.warning-card {
  margin-top: 12px;
  padding: 4px 14px;
  border: 1px solid #E3C793;
  border-radius: 12px;
  background: #FFF7E4;

  .warning-head {
    width: 100%;
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #78551E;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;

    .icon {
      transition: transform 0.16s ease;
    }

    .rotated {
      transform: rotate(180deg);
    }
  }

  ul {
    margin: 0 0 10px;
    padding-left: 16px;

    li {
      padding: 3px 0;
      font-size: 10px;
      line-height: 1.8;
      color: #78551E;
    }
  }
}

.mv-footer {
  padding: 24px 6px 4px;
  text-align: center;
  font-size: 9px;
  line-height: 1.9;
  color: var(--muted);

  p {
    margin: 2px 0;
  }

  .footer-lock {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    margin-bottom: 7px;
    font-size: 9px;

    .icon {
      width: 13px;
      height: 13px;
    }
  }

  .footer-brand {
    margin-top: 14px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--wood-700);
  }
}

button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 3px solid var(--wood-700);
  outline-offset: 2px;
}

@media (min-width: 720px) {
  .mv-page {
    padding: 22px 0 36px;
    background: #EDE2D5;
  }

  .mv-shell {
    max-width: 480px;
    margin: 0 auto;
    min-height: calc(100vh - 58px);
    border: 1px solid rgba(107, 70, 60, 0.16);
    border-radius: 26px;
    box-shadow: 0 24px 80px rgba(75, 54, 33, 0.17);
  }

  .mv-pin {
    border-radius: 26px 26px 0 0;
    overflow: hidden;
  }

  .mv-top {
    border-radius: 26px 26px 0 0;
  }
}

@media (max-width: 360px) {
  .mv-main {
    padding: 12px 12px 36px;
  }

  .card {
    padding: 15px;
  }

  .detail-card {
    padding: 0;
  }

  .detail-card .card-body {
    padding: 13px 15px 14px;
  }

  .card-toggle {
    padding: 12px 15px;
  }

  .card-toggle .toggle-amount {
    font-size: 17px;
  }

  .reward-hero {
    padding: 18px;
  }

  .hero-value {
    font-size: 37px;
  }

  .achievement-grid strong {
    font-size: 20px;
  }

  .metric-row b {
    font-size: 20px;
  }

  .sample-grid {
    grid-template-columns: 1fr;
  }

  .next-reward strong {
    font-size: 21px;
  }

  .tier-step small {
    font-size: 8px;
  }

  .month-badge {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
</style>
