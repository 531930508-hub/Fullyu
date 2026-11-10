<template>
  <div class="dashboard">
    <!-- 页头 -->
    <section class="dash-hero">
      <div class="dash-hero__main">
        <p class="dash-hero__eyebrow">{{ todayLabel }} · {{ weekdayLabel }}</p>
        <h1 class="dash-hero__title">{{ greeting }}，今天也轻盈一点。</h1>
        <p class="dash-hero__sub">
          <template v-if="nextSession">
            下一场 {{ nextSession.time }} · {{ nextSession.customerName || '客户' }} ·
            {{ nextSession.projectTitle || '疗愈项目' }}
            <span class="dash-hero__gap">{{ countdownLabel }}</span>
          </template>
          <template v-else-if="todayOrders.length">今日预约已全部开始或结束，辛苦了。</template>
          <template v-else>今天还没有预约，适合整理客户与排班。</template>
        </p>
      </div>
      <div class="dash-hero__actions">
        <el-select v-if="shopListAll && shopListAll.length > 1" v-model="shopIdLocal" class="dash-shop"
                   size="small" placeholder="选择门店" filterable @change="handleShopChange">
          <el-option v-for="shop in shopListAll" :key="shop.id" :label="shop.name" :value="shop.id">
            <span>{{ shop.name }}</span>
          </el-option>
        </el-select>
        <button type="button" class="dash-btn dash-btn--ghost" @click="refreshAll" :disabled="loading">
          <i class="el-icon-refresh" :class="{ 'is-loading': loading }"></i>
          刷新
        </button>
        <router-link v-if="heroCta" :to="heroCta.path" class="dash-btn dash-btn--primary">
          {{ heroCta.label }}
          <i class="el-icon-arrow-right"></i>
        </router-link>
      </div>
    </section>

    <!-- 关键指标（按角色方案显隐） -->
    <section v-if="cfgReady && visibleKpis.length" class="kpi-grid" :class="kpiColsClass">
      <article v-for="item in visibleKpis" :key="item.key" class="kpi-card" :class="`kpi-card--${item.tone}`">
        <div class="kpi-card__top">
          <span class="kpi-card__label">{{ item.label }}</span>
          <span class="kpi-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path :d="item.icon"/>
              </g>
            </svg>
          </span>
        </div>
        <p class="kpi-card__value">
          <span v-if="item.prefix" class="kpi-card__prefix">{{ item.prefix }}</span>{{ item.value
          }}<span v-if="item.suffix" class="kpi-card__suffix">{{ item.suffix }}</span>
        </p>
        <p class="kpi-card__foot">
          <span class="kpi-card__delta" :class="item.deltaTone" v-if="item.delta">{{ item.delta }}</span>
          <span>{{ item.foot }}</span>
        </p>
      </article>
    </section>

    <!-- 主体两栏（按角色方案显隐） -->
    <section v-if="cfgReady && showMainGrid" class="dash-grid" :class="{ 'dash-grid--side-only': !hasBlock('schedule') }">
      <div v-if="hasBlock('schedule')" class="panel panel--schedule">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">今日服务安排</h2>
            <p class="panel__desc">按预约时间排序，含床位与疗愈师</p>
          </div>
          <router-link v-if="hasPerm('board')" to="/appointment/board" class="panel__link">完整看板 <i class="el-icon-arrow-right"></i></router-link>
        </header>

        <div v-loading="ordersLoading" class="schedule">
          <template v-if="scheduleItems.length">
            <div v-for="(item, index) in scheduleItems" :key="item.uid" class="schedule-row"
                 :class="{ 'is-past': item.isPast, 'is-done': item.state === 2, 'is-cancel': item.state === 3 }">
              <div class="schedule-row__time">
                <span class="schedule-row__clock">{{ item.time }}</span>
                <span class="schedule-row__end">{{ item.endTime }}</span>
              </div>
              <span class="schedule-row__line" :class="`tone-${item.tone}`">
                <i></i>
              </span>
              <div class="schedule-row__body">
                <div class="schedule-row__title">
                  <strong>{{ item.customerName || '匿名客户' }}</strong>
                  <span class="schedule-row__project">{{ item.projectTitle || '疗愈项目' }}</span>
                </div>
                <p class="schedule-row__meta">
                  <span><i class="el-icon-user"></i>{{ item.massagistName || '待安排' }}</span>
                  <span v-if="item.bedName"><i class="el-icon-office-building"></i>{{ item.bedName }}</span>
                  <span v-if="item.duration"><i class="el-icon-time"></i>{{ item.duration }} 分钟</span>
                </p>
              </div>
              <span class="schedule-row__state" :class="`state-${item.state}`">{{ item.stateLabel }}</span>
            </div>
          </template>
          <div v-else-if="!ordersLoading" class="empty-block">
            <span class="empty-block__mark">愈</span>
            <p>今天暂无预约安排</p>
            <router-link v-if="hasPerm('board')" to="/appointment/board">去排班看板建单</router-link>
          </div>
        </div>

        <footer v-if="scheduleItems.length" class="panel__foot">
          <span>共 {{ scheduleItems.length }} 场服务</span>
          <span>已完成 {{ doneCount }} · 待到店 {{ waitingCount }}</span>
        </footer>
      </div>

      <div v-if="hasBlock('todo') || (hasBlock('quick') && visibleQuickLinks.length)" class="dash-side">
        <div v-if="hasBlock('todo')" class="panel">
          <header class="panel__head">
            <div>
              <h2 class="panel__title">待你处理</h2>
              <p class="panel__desc">审批到人，不受门店限制</p>
            </div>
            <router-link to="/todo/index" class="panel__link">全部 <i class="el-icon-arrow-right"></i></router-link>
          </header>
          <div v-loading="todoLoading" class="todo-list">
            <router-link v-for="item in todoList" :key="item.id" to="/todo/index" class="todo-item">
              <span class="todo-item__dot" :class="`tone-${item.tone}`"></span>
              <span class="todo-item__body">
                <span class="todo-item__title">{{ item.title }}</span>
                <span class="todo-item__meta">{{ item.meta }}</span>
              </span>
              <i class="el-icon-arrow-right todo-item__arrow"></i>
            </router-link>
            <div v-if="!todoLoading && !todoList.length" class="todo-empty">
              <span>当前没有待你处理的审批，保持轻松。</span>
            </div>
          </div>
          <router-link to="/todo/index" class="todo-count" v-if="todoCount > todoList.length">
            还有 {{ todoCount - todoList.length }} 项待处理
            <i class="el-icon-arrow-right"></i>
          </router-link>
        </div>

        <div v-if="hasBlock('quick') && visibleQuickLinks.length" class="panel">
          <header class="panel__head">
            <div>
              <h2 class="panel__title">快捷操作</h2>
              <p class="panel__desc">常用入口，一步直达</p>
            </div>
          </header>
          <div class="quick-grid">
            <router-link v-for="link in visibleQuickLinks" :key="link.key" :to="link.path" class="quick-item">
              <span class="quick-item__icon" :class="`tone-${link.tone}`">
                <i :class="link.icon"></i>
              </span>
              <span class="quick-item__text">{{ link.label }}</span>
            </router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- 底部项目分布（按角色方案显隐） -->
    <section v-if="cfgReady && hasBlock('projects')" class="panel panel--projects">
      <header class="panel__head">
        <div>
          <h2 class="panel__title">今日项目分布</h2>
          <p class="panel__desc">按预约场次统计，帮助快速了解当日服务结构</p>
        </div>
        <span class="panel__hint">更新于 {{ updatedAt }}</span>
      </header>
      <div class="project-list" v-if="projectStats.length">
        <div v-for="item in projectStats" :key="item.title" class="project-row">
          <span class="project-row__title">{{ item.title }}</span>
          <span class="project-row__bar">
            <span class="project-row__fill" :style="{ width: item.percent + '%' }"></span>
          </span>
          <span class="project-row__count">{{ item.count }} 场</span>
        </div>
      </div>
      <div v-else class="empty-inline">今日暂无项目数据</div>
    </section>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'
import orderApi from '@/api/order/order'
import statisticsApi from '@/api/statistics'
import approvalTodoApi from '@/api/approvalTodo'
import { fetchMine } from '@/api/homeConfig'
import { HOME_LINKS, presetFor } from './catalog'

const SUPER_ADMIN_ROLE = '超级管理员'

const pad = num => (num < 10 ? `0${num}` : `${num}`)
const dateCode = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export default {
  name: 'homeDashboard',
  components: {},
  data() {
    return {
      loading: false,
      ordersLoading: false,
      todoLoading: false,
      shopIdLocal: null,
      todayOrders: [],
      todayOrderTotal: 0,
      pendingPayTotal: 0,
      todayActualAmount: 0,
      yesterdayActualAmount: 0,
      todoListRaw: [],
      updatedAt: '--:--',
      homeCfg: null,
      cfgReady: false
    }
  },
  computed: {
    ...mapGetters(['shopId', 'shopListAll', 'todoCount', 'userId', 'roles', 'massagistId', 'menus']),
    isSuperAdmin() {
      return (this.roles || []).indexOf(SUPER_ADMIN_ROLE) > -1
    },
    isTherapist() {
      return !!this.massagistId || (this.roles || []).indexOf('疗愈师') > -1
    },
    resolvedConfig() {
      if (this.homeCfg && Array.isArray(this.homeCfg.blocks) && Array.isArray(this.homeCfg.links)) {
        return this.homeCfg
      }
      return presetFor(this.isTherapist)
    },
    enabledBlocks() {
      return this.resolvedConfig.blocks || []
    },
    enabledLinks() {
      return this.resolvedConfig.links || []
    },
    visibleKpis() {
      return this.kpis.filter(item => this.hasBlock(item.block))
    },
    visibleQuickLinks() {
      const lookup = {}
      HOME_LINKS.forEach(item => { lookup[item.key] = item })
      return this.enabledLinks
        .map(key => lookup[key])
        .filter(item => item && this.hasPerm(item.perm))
    },
    heroCta() {
      if (!this.cfgReady) return null
      if (this.hasPerm('board')) {
        return { label: '排班看板', path: '/appointment/board' }
      }
      return this.visibleQuickLinks[0] || null
    },
    showMainGrid() {
      return this.hasBlock('schedule') || this.hasBlock('todo') || (this.hasBlock('quick') && this.visibleQuickLinks.length > 0)
    },
    kpiColsClass() {
      const count = this.visibleKpis.length
      return count >= 4 ? '' : `kpi-grid--cols-${Math.max(count, 1)}`
    },
    todayLabel() {
      const now = new Date()
      return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`
    },
    weekdayLabel() {
      return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date().getDay()]
    },
    greeting() {
      const hour = new Date().getHours()
      if (hour < 6) return '夜深了'
      if (hour < 11) return '早上好'
      if (hour < 14) return '中午好'
      if (hour < 18) return '下午好'
      return '晚上好'
    },
    scheduleItems() {
      const now = new Date()
      const items = []
      this.todayOrders.forEach(order => {
        const details = order.orderDetailList && order.orderDetailList.length
          ? order.orderDetailList
          : [{}]
        details.forEach((detail, index) => {
          const startTime = detail.startTime || order.startTime || ''
          const endTime = detail.endTime || order.endTime || ''
          const state = detail.state !== undefined && detail.state !== null
            ? detail.state
            : order.appointmentState
          const stateLabel = this.stateLabel(state)
          const isPast = startTime ? this.parseTime(endTime || startTime) < now : false
          items.push({
            uid: `${order.id || order.code}-${index}`,
            time: this.timePart(startTime),
            endTime: this.timePart(endTime),
            customerName: order.customerNickname || order.nickname || order.customerName,
            projectTitle: detail.projectTitle || order.productTitle,
            massagistName: detail.massagistName || this.massagistName(detail.massagistId),
            bedName: detail.bedName,
            duration: detail.duration || order.duration,
            state,
            stateLabel,
            tone: state === 2 ? 'success' : state === 3 ? 'muted' : state === 1 ? 'info' : 'brand',
            startRaw: startTime,
            isPast
          })
        })
      })
      return items.sort((a, b) => this.parseTime(a.startRaw) - this.parseTime(b.startRaw))
    },
    nextSession() {
      const now = new Date()
      return this.scheduleItems.find(item => item.state !== 2 && item.state !== 3 && this.parseTime(item.startRaw) >= now) || null
    },
    countdownLabel() {
      if (!this.nextSession) return ''
      const diff = this.parseTime(this.nextSession.startRaw) - new Date()
      const minutes = Math.max(0, Math.round(diff / 60000))
      if (minutes <= 1) return '即将开始'
      if (minutes < 60) return `还有 ${minutes} 分钟`
      return `还有 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
    },
    doneCount() {
      return this.scheduleItems.filter(item => item.state === 2).length
    },
    waitingCount() {
      return this.scheduleItems.filter(item => item.state === 0).length
    },
    arrivedCustomerCount() {
      const phones = new Set()
      this.todayOrders.forEach(order => {
        const details = order.orderDetailList || []
        const hasArrived = details.some(detail => detail.state === 1 || detail.state === 2)
        if (!hasArrived) return
        if (order.customerPhone) phones.add(order.customerPhone)
        else if (order.id) phones.add(`id-${order.id}`)
      })
      return phones.size
    },
    revenueDelta() {
      if (!this.yesterdayActualAmount) return null
      const diff = Number(this.todayActualAmount || 0) - Number(this.yesterdayActualAmount)
      const percent = Math.round((diff / this.yesterdayActualAmount) * 100)
      return {
        text: `${percent >= 0 ? '较昨日 +' : '较昨日 '}${percent}%`,
        tone: percent >= 0 ? 'is-up' : 'is-down'
      }
    },
    kpis() {
      return [
        {
          key: 'revenue',
          block: 'kpiRevenue',
          label: '今日实际收入',
          value: this.money(this.todayActualAmount),
          prefix: '¥',
          foot: `昨日 ¥${this.money(this.yesterdayActualAmount)}`,
          delta: this.revenueDelta ? this.revenueDelta.text : '',
          deltaTone: this.revenueDelta ? this.revenueDelta.tone : '',
          tone: 'brand',
          icon: 'M4 17.5 9.5 12l3.5 3.2L20 7.5M20 7.5h-4.6M20 7.5v4.6M4 20h16'
        },
        {
          key: 'orders',
          block: 'kpiOrders',
          label: '今日预约',
          value: this.todayOrderTotal,
          suffix: ' 单',
          foot: `服务 ${this.scheduleItems.length} 场`,
          tone: 'info',
          icon: 'M7 3.5v3M17 3.5v3M4.5 9h15M5 5.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z'
        },
        {
          key: 'customers',
          block: 'kpiCustomers',
          label: '今日到店客户',
          value: this.arrivedCustomerCount,
          suffix: ' 位',
          foot: this.waitingCount ? `还有 ${this.waitingCount} 场待到店` : '今日预约均已到店',
          tone: 'success',
          icon: 'M12 11.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2ZM4.5 20.5c.6-3.4 3.7-5.7 7.5-5.7s6.9 2.3 7.5 5.7'
        },
        {
          key: 'pending',
          block: 'kpiPending',
          label: '待支付订单',
          value: this.pendingPayTotal,
          suffix: ' 单',
          foot: this.pendingPayTotal ? '建议及时联系客户确认' : '今日没有待支付订单',
          tone: 'warning',
          icon: 'M12 8v4.4l2.8 1.7M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'
        }
      ]
    },
    todoList() {
      return this.todoListRaw.map(item => {
        const approval = item.approval || {}
        return {
          id: item.id,
          title: approval.categoryTitle || '待审批事项',
          meta: `${this.userName(item.createUser)} · ${this.relativeTime(item.createTime)}`,
          tone: 'brand'
        }
      })
    },
    projectStats() {
      const map = {}
      this.scheduleItems.forEach(item => {
        const title = item.projectTitle || '其他项目'
        map[title] = (map[title] || 0) + 1
      })
      const list = Object.keys(map).map(title => ({ title, count: map[title] }))
        .sort((a, b) => b.count - a.count)
      const max = list.length ? list[0].count : 1
      return list.map(item => ({ ...item, percent: Math.max(8, Math.round((item.count / max) * 100)) }))
    },
    extraTodoCount() {
      return Math.max(0, Number(this.todoCount || 0) - this.todoListRaw.length)
    }
  },
  watch: {
    shopId: {
      handler(val) {
        if (val !== this.shopIdLocal) this.shopIdLocal = val ? Number(val) : null
      }
    }
  },
  created() {
    this.$store.dispatch('setShopAllList').then(() => {
      this.shopIdLocal = this.shopId ? Number(this.shopId) : null
    })
    this.$store.dispatch('setMassagistList')
    this.$store.dispatch('setAdminUserList')
    this.loadHomeConfig().then(() => this.refreshAll())
  },
  methods: {
    async loadHomeConfig() {
      try {
        const res = await fetchMine()
        const data = res.data || {}
        const cfg = data.config
        this.homeCfg = cfg && Array.isArray(cfg.blocks) && Array.isArray(cfg.links) ? cfg : null
      } catch (e) {
        this.homeCfg = null
      } finally {
        this.cfgReady = true
      }
    },
    hasBlock(key) {
      return this.enabledBlocks.indexOf(key) > -1
    },
    hasPerm(perm) {
      if (!perm) return true
      if (this.isSuperAdmin) return true
      const menus = this.menus || []
      if (menus.some(menu => menu.name === perm)) return true
      // 页签级权限：菜单表尚无该页签行（旧后端/未迁移）时回退到页面级，避免误隐藏
      const idx = perm.indexOf(':')
      if (idx > -1) {
        const pageName = perm.slice(0, idx)
        const prefix = pageName + ':'
        if (!menus.some(menu => (menu.name || '').indexOf(prefix) === 0)) {
          return menus.some(menu => menu.name === pageName)
        }
      }
      return false
    },
    refreshAll() {
      this.loading = true
      if (this.hasBlock('kpiRevenue')) this.fetchRevenue()
      this.fetchOrders()
      if (this.hasBlock('kpiPending')) this.fetchPendingPay()
      if (this.hasBlock('todo')) this.fetchTodo()
      this.updatedAt = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`
      setTimeout(() => { this.loading = false }, 400)
    },
    handleShopChange(value) {
      this.$store.dispatch('changeShopId', value)
      this.refreshAll()
    },
    async fetchRevenue() {
      const today = dateCode(new Date())
      const yesterdayDate = new Date()
      yesterdayDate.setDate(yesterdayDate.getDate() - 1)
      const yesterday = dateCode(yesterdayDate)
      const base = this.shopId ? { shopId: this.shopId } : {}
      try {
        const [todayRes, yesterdayRes] = await Promise.all([
          statisticsApi.operatingRevenueTop({ ...base, startPayTime: `${today} 00:00:00`, endPayTime: `${today} 23:59:59` }),
          statisticsApi.operatingRevenueTop({ ...base, startPayTime: `${yesterday} 00:00:00`, endPayTime: `${yesterday} 23:59:59` })
        ])
        this.todayActualAmount = Number((todayRes.data || {}).totalActualAmount || 0)
        this.yesterdayActualAmount = Number((yesterdayRes.data || {}).totalActualAmount || 0)
      } catch (e) {
        this.todayActualAmount = 0
        this.yesterdayActualAmount = 0
      }
    },
    async fetchOrders() {
      this.ordersLoading = true
      const today = dateCode(new Date())
      const params = {
        page: 1,
        size: 100,
        type: 0,
        order: '-id',
        startAppointmentTime: `${today} 00:00:00`,
        endAppointmentTime: `${today} 23:59:59`
      }
      if (this.shopId) params.shopId = this.shopId
      try {
        const res = await orderApi.page(params)
        const data = res.data || {}
        this.todayOrders = data.list || []
        this.todayOrderTotal = data.total || 0
      } catch (e) {
        this.todayOrders = []
        this.todayOrderTotal = 0
      } finally {
        this.ordersLoading = false
      }
    },
    async fetchPendingPay() {
      const today = dateCode(new Date())
      const params = {
        page: 1,
        size: 1,
        type: 0,
        state: 0,
        startAppointmentTime: `${today} 00:00:00`,
        endAppointmentTime: `${today} 23:59:59`
      }
      if (this.shopId) params.shopId = this.shopId
      try {
        const res = await orderApi.page(params)
        this.pendingPayTotal = (res.data || {}).total || 0
      } catch (e) {
        this.pendingPayTotal = 0
      }
    },
    async fetchTodo() {
      if (!this.userId) return
      this.todoLoading = true
      try {
        const res = await approvalTodoApi.page({
          targetUserId: this.userId,
          flowUserType: 2,
          state: 2,
          page: 1,
          size: 4,
          order: '-id'
        })
        this.todoListRaw = (res.data || {}).list || []
      } catch (e) {
        this.todoListRaw = []
      } finally {
        this.todoLoading = false
      }
    },
    stateLabel(state) {
      const map = { 0: '待到店', 1: '服务中', 2: '已完成', 3: '已取消' }
      return map[state] || '待确认'
    },
    massagistName(id) {
      if (!id) return ''
      const list = this.$store.getters.massagistList || []
      const found = list.find(item => String(item.id) === String(id))
      return found ? found.name : ''
    },
    userName(id) {
      if (!id) return '系统'
      const list = this.$store.getters.adminUserList || []
      const found = list.find(item => String(item.id) === String(id))
      return found ? (found.nickname || found.username) : `用户 ${id}`
    },
    parseTime(value) {
      if (!value) return new Date(0)
      if (value instanceof Date) return value
      return new Date(String(value).replace(/-/g, '/'))
    },
    timePart(value) {
      const date = this.parseTime(value)
      if (!value || isNaN(date.getTime())) return '--:--'
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    },
    money(value) {
      const num = Number(value || 0)
      if (num >= 10000) return `${(num / 10000).toFixed(1)} 万`
      return num.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
    },
    relativeTime(value) {
      if (!value) return '刚刚'
      const diff = Math.max(0, Date.now() - this.parseTime(value).getTime())
      const minutes = Math.floor(diff / 60000)
      if (minutes < 1) return '刚刚'
      if (minutes < 60) return `${minutes} 分钟前`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${hours} 小时前`
      return `${Math.floor(hours / 24)} 天前`
    }
  }
}
</script>

<style lang="scss" scoped>
@import "src/styles/variables.scss";

.dashboard {
  min-height: calc(100vh - #{$navbar-height});
  padding: 24px;
  background:
    radial-gradient(1200px 420px at 10% -10%, rgba(203, 196, 255, .35), transparent 60%),
    $bg;
}

/* 页头 */
.dash-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 28px;
  border: 1px solid $line;
  border-radius: $radius-xl;
  background:
    radial-gradient(600px 200px at 100% 0%, rgba(231, 222, 248, .9), transparent 70%),
    linear-gradient(120deg, #fff 0%, #fbf9ff 100%);
  box-shadow: $shadow-sm;
}

.dash-hero__main {
  flex: 1;
  min-width: 0;
}

.dash-hero__eyebrow {
  margin: 0 0 8px;
  color: $brand;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .08em;
}

.dash-hero__title {
  margin: 0;
  color: $ink;
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -.01em;
  line-height: 1.3;
}

.dash-hero__sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 0;
  color: $ink-muted;
  font-size: 13px;
}

.dash-hero__gap {
  padding: 2px 8px;
  border-radius: $radius-pill;
  background: $brand-soft;
  color: $brand;
  font-weight: 600;
  font-size: 12px;
}

.dash-hero__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.dash-shop {
  width: 172px;

  ::v-deep .el-input__inner {
    height: 36px;
    line-height: 36px;
    border-color: $line-strong;
    border-radius: 10px;
    background: rgba(255, 255, 255, .82);
    color: $ink-secondary;
    font-size: 13px;

    &:focus { border-color: $brand; }
  }
}

.dash-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: $bg-deep;
  color: $ink-secondary;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: all .18s ease;

  &:hover {
    color: $brand;
    background: $brand-soft;
  }

  &:disabled {
    opacity: .6;
    cursor: default;
  }

  &--primary {
    border-color: transparent;
    background: $brand;
    color: #fff;
    box-shadow: $shadow-brand;

    &:hover {
      background: $brand-hover;
      color: #fff;
    }
  }
}

/* KPI */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: 16px;
  margin-top: 18px;
}

/* 角色方案只开放部分指标卡时，按实际数量铺满，避免右侧留空 */
.kpi-grid--cols-1 { grid-template-columns: minmax(0, 1fr); }
.kpi-grid--cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.kpi-grid--cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

.kpi-card {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 18px 20px 16px;
  border: 1px solid $line;
  border-radius: $radius-lg;
  background: $surface;
  box-shadow: $shadow-xs;
  overflow: hidden;
  transition: box-shadow .2s ease, transform .2s ease;

  &:hover {
    box-shadow: $shadow-sm;
    transform: translateY(-1px);
  }

  &::after {
    content: "";
    position: absolute;
    right: -30px;
    top: -40px;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: $brand-soft;
    opacity: .55;
  }

  &--info::after { background: $info-soft; }
  &--success::after { background: $success-soft; }
  &--warning::after { background: $warning-soft; }
}

.kpi-card__top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kpi-card__label {
  color: $ink-muted;
  font-size: 12.5px;
  font-weight: 500;
}

.kpi-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: $brand-soft;
  color: $brand;

  svg {
    width: 18px;
    height: 18px;
  }
}

.kpi-card--info .kpi-card__icon { background: $info-soft; color: $info; }
.kpi-card--success .kpi-card__icon { background: $success-soft; color: $success; }
.kpi-card--warning .kpi-card__icon { background: $warning-soft; color: $warning; }

.kpi-card__value {
  position: relative;
  z-index: 1;
  margin: 14px 0 8px;
  color: $ink;
  font-size: 30px;
  font-weight: 650;
  line-height: 1.1;
  letter-spacing: -.02em;
}

.kpi-card__prefix {
  margin-right: 2px;
  font-size: 17px;
  font-weight: 600;
  color: $ink-muted;
}

.kpi-card__suffix {
  margin-left: 3px;
  font-size: 13px;
  font-weight: 500;
  color: $ink-muted;
}

.kpi-card__foot {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: auto 0 0;
  color: $ink-faint;
  font-size: 12px;
}

.kpi-card__delta {
  &.is-up { color: $success; }
  &.is-down { color: $danger; }
}

/* 两栏 */
.dash-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.62fr) minmax(300px, .9fr);
  gap: 16px;
  margin-top: 18px;
  align-items: start;
}

/* 角色方案未开放服务安排时，侧栏面板独占整行并双列铺开 */
.dash-grid--side-only {
  grid-template-columns: minmax(0, 1fr);
}

.dash-grid--side-only .dash-side {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
}

.dash-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.panel {
  border: 1px solid $line;
  border-radius: $radius-lg;
  background: $surface;
  box-shadow: $shadow-xs;
  overflow: hidden;
}

.panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 12px;
}

.panel__title {
  margin: 0;
  color: $ink;
  font-size: 15px;
  font-weight: 650;
}

.panel__desc {
  margin: 4px 0 0;
  color: $ink-faint;
  font-size: 12px;
}

.panel__link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: $brand;
  font-size: 12.5px;
  white-space: nowrap;

  &:hover { color: $brand-hover; }
}

.panel__hint {
  color: $ink-faint;
  font-size: 11.5px;
}

.panel__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px 14px;
  border-top: 1px solid $line;
  color: $ink-faint;
  font-size: 11.5px;
}

/* 日程 */
.schedule {
  min-height: 120px;
  padding: 0 12px 6px;
  max-height: 438px;
  overflow-y: auto;
}

.schedule-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 8px;
  border-radius: $radius-md;
  transition: background-color .16s ease;

  &:hover { background: $surface-2; }

  &.is-past { opacity: .58; }
  &.is-cancel { opacity: .5; text-decoration: line-through; }
}

.schedule-row__time {
  width: 48px;
  flex-shrink: 0;
  text-align: right;
}

.schedule-row__clock {
  display: block;
  color: $ink;
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.schedule-row__end {
  display: block;
  margin-top: 2px;
  color: $ink-faint;
  font-size: 10.5px;
}

.schedule-row__line {
  position: relative;
  display: flex;
  justify-content: center;
  width: 14px;
  height: 38px;
  flex-shrink: 0;

  &::before {
    content: "";
    position: absolute;
    top: -12px;
    bottom: -12px;
    width: 1px;
    background: $line;
  }

  i {
    position: relative;
    z-index: 1;
    width: 8px;
    height: 8px;
    margin-top: 15px;
    border-radius: 50%;
    background: $brand;
    box-shadow: 0 0 0 4px $brand-soft;
  }

  &.tone-success i { background: $success; box-shadow: 0 0 0 4px $success-soft; }
  &.tone-info i { background: $info; box-shadow: 0 0 0 4px $info-soft; }
  &.tone-muted i { background: $ink-faint; box-shadow: 0 0 0 4px $line; }
}

.schedule-row__body {
  flex: 1;
  min-width: 0;
}

.schedule-row__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  strong {
    color: $ink;
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
  }
}

.schedule-row__project {
  overflow: hidden;
  color: $ink-muted;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-row__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0 0;
  color: $ink-faint;
  font-size: 11.5px;

  span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
}

.schedule-row__state {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: $radius-pill;
  background: $brand-soft;
  color: $brand;
  font-size: 11px;
  font-weight: 600;

  &.state-1 { background: $info-soft; color: $info; }
  &.state-2 { background: $success-soft; color: $success; }
  &.state-3 { background: $line; color: $ink-faint; }
}

/* 待办 */
.todo-list {
  padding: 0 10px 6px;
  min-height: 72px;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: $radius-md;
  color: inherit;
  transition: background-color .16s ease;

  &:hover {
    background: $brand-soft;

    .todo-item__arrow { color: $brand; transform: translateX(2px); }
  }
}

.todo-item__dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: $brand;
  box-shadow: 0 0 0 3px rgba(103, 80, 164, .12);

  &.tone-info { background: $info; box-shadow: 0 0 0 3px rgba(59, 130, 246, .14); }
  &.tone-warning { background: $warning; box-shadow: 0 0 0 3px rgba(245, 158, 11, .18); }
}

.todo-item__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.todo-item__title {
  overflow: hidden;
  color: $ink;
  font-size: 13px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-item__meta {
  color: $ink-faint;
  font-size: 11.5px;
}

.todo-item__arrow {
  color: $ink-faint;
  font-size: 12px;
  transition: all .18s ease;
}

.todo-empty {
  padding: 18px 12px 20px;
  color: $ink-faint;
  font-size: 12.5px;
  text-align: center;
}

.todo-count {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 9px;
  border-top: 1px solid $line;
  color: $brand;
  font-size: 12px;

  &:hover { background: $brand-soft; }
}

/* 快捷 */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 0 14px 16px;
}

.quick-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid $line;
  border-radius: $radius-md;
  color: $ink-secondary;
  font-size: 12.5px;
  transition: all .18s ease;

  &:hover {
    border-color: $brand-tint;
    background: $brand-soft;
    color: $brand;
    transform: translateY(-1px);
  }
}

.quick-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 9px;
  background: $brand-soft;
  color: $brand;
  font-size: 15px;

  &.tone-info { background: $info-soft; color: $info; }
  &.tone-success { background: $success-soft; color: $success; }
  &.tone-warning { background: $warning-soft; color: $warning; }
}

/* 项目分布 */
.panel--projects {
  margin-top: 16px;
}

.project-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 28px;
  padding: 4px 20px 18px;
}

.project-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-row__title {
  width: 118px;
  flex-shrink: 0;
  overflow: hidden;
  color: $ink-secondary;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-row__bar {
  flex: 1;
  height: 7px;
  border-radius: $radius-pill;
  background: $bg-deep;
  overflow: hidden;
}

.project-row__fill {
  display: block;
  height: 100%;
  border-radius: $radius-pill;
  background: linear-gradient(90deg, $brand-tint, $brand);
  transition: width .4s ease;
}

.project-row__count {
  width: 42px;
  flex-shrink: 0;
  color: $ink-muted;
  font-size: 11.5px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* 空态 */
.empty-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 44px 20px 52px;
  color: $ink-faint;
  font-size: 12.5px;

  p { margin: 0; }

  a {
    margin-top: 4px;
    color: $brand;
    font-size: 12.5px;
  }
}

.empty-block__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-bottom: 4px;
  border-radius: 50%;
  background: $brand-soft;
  color: $brand;
  font-size: 18px;
  font-weight: 600;
}

.empty-inline {
  padding: 26px 20px 30px;
  color: $ink-faint;
  font-size: 12.5px;
  text-align: center;
}

@media (max-width: 1280px) {
  .dashboard { padding: 18px; }
  .kpi-grid:not([class*='--cols-']) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dash-grid { grid-template-columns: minmax(0, 1fr); }
  .dash-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: 1fr;
    align-items: stretch;
  }
  .dash-side .panel { height: 100%; }
  .dash-grid--side-only .dash-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .project-list { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 768px) {
  .dash-hero { flex-direction: column; align-items: stretch; }
  .dash-hero__title { font-size: 20px; }
  .kpi-grid { grid-template-columns: minmax(0, 1fr); }
  .dash-side { grid-template-columns: minmax(0, 1fr); }
  .dash-grid--side-only .dash-side { grid-template-columns: minmax(0, 1fr); }
  .quick-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>