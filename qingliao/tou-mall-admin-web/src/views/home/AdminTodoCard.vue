<template>
  <div class="todo-float" :class="{ collapsed }">
    <div v-if="collapsed" class="todo-pill" @click="collapsed = false">
      <i class="el-icon-s-check"></i>
      <span>门店待办</span>
      <span v-if="panel.pendingCount" class="pill-badge">{{ panel.pendingCount }}</span>
    </div>

    <div v-else class="todo-card">
      <div class="todo-head">
        <div class="title-row">
          <div class="todo-title">门店待办</div>
          <div class="head-actions">
            <button type="button" class="icon-btn" title="收起" @click="collapsed = true">—</button>
          </div>
        </div>
        <div class="tabs">
          <button type="button" class="tab" :class="{ active: tab === 'pending' }" @click="tab = 'pending'">
            待完成 <span class="badge">{{ panel.pendingCount }}</span>
          </button>
          <button type="button" class="tab" :class="{ active: tab === 'done' }" @click="tab = 'done'">
            已完成 <span class="badge">{{ panel.doneCount }}</span>
          </button>
        </div>
      </div>

      <div v-loading="loading" class="todo-body">
        <template v-if="tab === 'pending'">
          <div v-for="item in panel.pending" :key="item.id" class="item">
            <button type="button" class="check" title="标记完成" @click="askComplete(item)"></button>
            <div class="item-main">
              <div class="item-text">{{ item.content }}</div>
              <div class="meta">
                <span v-if="item.overdue" class="overdue">昨日未完成</span>
                <span>创建：{{ item.creatorName || '—' }} {{ item.createTimeText }}</span>
              </div>
            </div>
          </div>
          <div v-if="!panel.pending.length" class="empty">暂无待办，今天的门店事务都处理好了</div>
        </template>

        <template v-else>
          <div v-for="item in panel.done" :key="item.id" class="item done">
            <div class="done-icon">✓</div>
            <div class="item-main">
              <div class="item-text">{{ item.content }}</div>
              <div class="timeline">
                <div><b>创建</b> {{ item.creatorName || '—' }} · {{ item.createTimeText }}</div>
                <div><b>完成</b> {{ item.completeName || '—' }} · {{ item.completeTimeText }}</div>
              </div>
            </div>
          </div>
          <div v-if="!panel.done.length" class="empty">近 7 天还没有完成的待办</div>
        </template>
      </div>

      <div class="todo-foot">
        <span class="hint">{{ tab === 'pending' ? '完成事项将保留操作记录' : '仅展示近 7 天已完成事项' }}</span>
        <button v-if="tab === 'pending'" type="button" class="add-btn" @click="openAdd">＋ 新增待办</button>
        <button v-else type="button" class="add-btn" @click="openRecords">查看全部记录 →</button>
      </div>
    </div>

    <!-- 新增待办 -->
    <el-dialog title="新增待办" :visible.sync="addVisible" width="420px" append-to-body>
      <el-input v-model="addForm.content" type="textarea" :rows="3" maxlength="500" show-word-limit
                placeholder="例如：回访昨日退款客户，确认到账情况"/>
      <div slot="footer">
        <el-button size="small" @click="addVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="submitting" @click="submitAdd">创建待办</el-button>
      </div>
    </el-dialog>

    <!-- 确认完成 -->
    <el-dialog title="确认完成待办？" :visible.sync="confirmVisible" width="420px" append-to-body>
      <p class="confirm-desc">确认后将记录你的账号及当前完成时间，并同步给本门店所有员工。</p>
      <p class="confirm-text">{{ confirmItem && confirmItem.content }}</p>
      <div slot="footer">
        <el-button size="small" @click="confirmVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="submitting" @click="submitComplete">确认完成</el-button>
      </div>
    </el-dialog>

    <!-- 待办记录 -->
    <el-drawer title="待办记录" :visible.sync="recordsVisible" size="480px" append-to-body>
      <div class="records-body">
        <div class="filters">
          <button v-for="option in statusOptions" :key="option.value" type="button" class="filter-btn"
                  :class="{ active: recordsFilter.status === option.value }" @click="changeRecordsStatus(option.value)">
            {{ option.label }}
          </button>
          <el-select v-model="recordsFilter.days" size="mini" style="width: 110px" @change="loadRecords">
            <el-option label="近 7 天" :value="7"/>
            <el-option label="近 30 天" :value="30"/>
            <el-option label="全部" :value="0"/>
          </el-select>
        </div>

        <div v-for="group in recordGroups" :key="group.day" class="record-group">
          <div class="record-day">{{ group.label }}</div>
          <div v-for="item in group.list" :key="item.id" class="record">
            <div class="record-head">
              <div class="text">{{ item.content }}</div>
              <el-tag size="mini" :type="item.status === 1 ? 'success' : 'info'">
                {{ item.status === 1 ? '已完成' : '未完成' }}
              </el-tag>
            </div>
            <div class="info">
              <span>创建：{{ item.creatorName || '—' }} {{ item.createTimeText }}</span>
              <span v-if="item.status === 1">完成：{{ item.completeName || '—' }} {{ item.completeTimeText }}</span>
            </div>
          </div>
        </div>
        <div v-if="!loading && !recordGroups.length" class="empty">没有符合条件的待办记录</div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import adminTodoApi from '@/api/adminTodo'

export default {
  name: 'AdminTodoCard',
  props: {
    shopId: {
      type: [Number, String],
      default: ''
    }
  },
  data() {
    return {
      collapsed: false,
      loading: false,
      submitting: false,
      tab: 'pending',
      panel: { pending: [], done: [], pendingCount: 0, doneCount: 0 },
      addVisible: false,
      addForm: { content: '' },
      confirmVisible: false,
      confirmItem: null,
      recordsVisible: false,
      records: [],
      recordsFilter: { status: '', days: 7 },
      statusOptions: [
        { label: '全部', value: '' },
        { label: '已完成', value: 1 },
        { label: '未完成', value: 0 }
      ]
    }
  },
  computed: {
    recordGroups() {
      const groups = []
      const map = {}
      this.records.forEach(item => {
        const time = item.status === 1 && item.completeTime ? item.completeTime : item.createTime
        const day = time ? String(time).substring(0, 10) : ''
        if (!map[day]) {
          map[day] = { day, label: this.dayLabel(day), list: [] }
          groups.push(map[day])
        }
        map[day].list.push(item)
      })
      return groups
    }
  },
  watch: {
    shopId: {
      immediate: true,
      handler(value) {
        if (value) {
          this.load()
        }
      }
    }
  },
  methods: {
    async load() {
      if (!this.shopId) {
        return
      }
      this.loading = true
      try {
        const res = await adminTodoApi.panel(this.shopId)
        const data = res.data || {}
        this.panel = {
          pending: data.pending || [],
          done: data.done || [],
          pendingCount: data.pendingCount || 0,
          doneCount: data.doneCount || 0
        }
      } catch (e) {
        this.panel = { pending: [], done: [], pendingCount: 0, doneCount: 0 }
      } finally {
        this.loading = false
      }
    },
    openAdd() {
      this.addForm = { content: '' }
      this.addVisible = true
    },
    async submitAdd() {
      if (!this.addForm.content || !this.addForm.content.trim()) {
        this.$message.warning('请填写待办内容')
        return
      }
      this.submitting = true
      try {
        await adminTodoApi.add({ shopId: this.shopId, content: this.addForm.content.trim() })
        this.$message.success('待办已创建')
        this.addVisible = false
        this.tab = 'pending'
        this.load()
      } finally {
        this.submitting = false
      }
    },
    askComplete(item) {
      this.confirmItem = item
      this.confirmVisible = true
    },
    async submitComplete() {
      if (!this.confirmItem) {
        return
      }
      this.submitting = true
      try {
        await adminTodoApi.complete({ id: this.confirmItem.id })
        this.$message.success('已标记完成')
        this.confirmVisible = false
        this.confirmItem = null
        this.tab = 'done'
        this.load()
      } finally {
        this.submitting = false
      }
    },
    async reopen(item) {
      await adminTodoApi.reopen(item.id)
      this.$message.success('已恢复为未完成')
      this.load()
    },
    openRecords() {
      this.recordsVisible = true
      this.loadRecords()
    },
    changeRecordsStatus(status) {
      this.recordsFilter.status = status
      this.loadRecords()
    },
    async loadRecords() {
      this.loading = true
      try {
        const params = {
          shopId: this.shopId,
          page: 1,
          size: 100,
          days: this.recordsFilter.days
        }
        if (this.recordsFilter.status !== '') {
          params.status = this.recordsFilter.status
        }
        const res = await adminTodoApi.records(params)
        const data = res.data || {}
        this.records = data.list || []
      } catch (e) {
        this.records = []
      } finally {
        this.loading = false
      }
    },
    dayLabel(day) {
      if (!day) {
        return '未记录日期'
      }
      const today = this.formatDay(new Date())
      const yesterday = this.formatDay(new Date(Date.now() - 24 * 60 * 60 * 1000))
      const text = day.substring(5).replace('-', '月') + '日'
      if (day === today) {
        return '今天 · ' + text
      }
      if (day === yesterday) {
        return '昨天 · ' + text
      }
      return text
    },
    formatDay(date) {
      const pad = value => (value < 10 ? '0' + value : value)
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    }
  }
}
</script>

<style lang="scss" scoped>
.todo-float {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2000;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  letter-spacing: 0.05em;

  &.collapsed {
    right: 24px;
    bottom: 24px;
  }
}

.todo-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 999px;
  background: #584219;
  color: #f3e9d8;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(88, 66, 25, 0.28);
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-1px);
  }
}

.pill-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #e4c892;
  color: #584219;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}

.todo-card {
  width: 360px;
  background: #ffffff;
  border: 1px solid #ebe4da;
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(88, 66, 25, 0.18);
  overflow: hidden;
}

.todo-head {
  padding: 14px 16px 0;
  border-bottom: 1px solid #f0ebe3;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.todo-title {
  font-size: 15px;
  font-weight: 600;
  color: #584219;
  letter-spacing: 0.06em;
}

.icon-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: #f6f4f2;
  color: #8a6a40;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.tabs {
  display: flex;
  gap: 22px;
  margin-top: 12px;
}

.tab {
  position: relative;
  padding: 0 0 10px;
  border: none;
  background: transparent;
  color: #8a6a40;
  font-size: 13px;
  cursor: pointer;

  &.active {
    color: #584219;
    font-weight: 600;

    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 2px;
      background: #584219;
      border-radius: 2px;
    }
  }
}

.badge {
  display: inline-block;
  min-width: 17px;
  height: 17px;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 9px;
  background: #f6f1e8;
  color: #8a6a40;
  font-size: 11px;
  line-height: 17px;
  text-align: center;
}

.todo-body {
  max-height: 300px;
  min-height: 80px;
  padding: 6px 16px;
  overflow-y: auto;
}

.item {
  display: flex;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid #f6f2ec;

  &:last-child {
    border-bottom: none;
  }
}

.check {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border: 1.5px solid #cbbfa8;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;

  &:hover {
    border-color: #584219;
    background: #f6f1e8;
  }
}

.done-icon {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border-radius: 50%;
  background: #584219;
  color: #f3e9d8;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-text {
  color: #3b3128;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}

.item.done .item-text {
  color: #8a6a40;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  color: #a89880;
  font-size: 11px;
}

.overdue {
  padding: 0 6px;
  border-radius: 4px;
  background: #fbf0e8;
  color: #c4562f;
}

.timeline {
  margin-top: 6px;
  color: #a89880;
  font-size: 11px;
  line-height: 1.7;

  b {
    color: #8a6a40;
    font-weight: 500;
  }
}

.empty {
  padding: 26px 0;
  color: #a89880;
  font-size: 12px;
  text-align: center;
}

.todo-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid #f0ebe3;
  background: #fdfcfa;
}

.hint {
  color: #a89880;
  font-size: 11px;
}

.add-btn {
  padding: 6px 14px;
  border: 1px solid #e4d9c9;
  border-radius: 8px;
  background: #ffffff;
  color: #584219;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: #f6f1e8;
  }
}

.confirm-desc {
  margin: 0 0 10px;
  color: #8a6a40;
  font-size: 13px;
  line-height: 1.6;
}

.confirm-text {
  margin: 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: #f6f4f2;
  color: #3b3128;
  font-size: 13px;
  line-height: 1.6;
}

.records-body {
  padding: 0 20px 24px;
}

.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 16px;
  border-bottom: 1px solid #f0ebe3;
}

.filter-btn {
  padding: 5px 12px;
  border: 1px solid #ebe4da;
  border-radius: 999px;
  background: #ffffff;
  color: #8a6a40;
  font-size: 12px;
  cursor: pointer;

  &.active {
    border-color: #584219;
    background: #584219;
    color: #f3e9d8;
  }
}

.record-group {
  margin-top: 18px;
}

.record-day {
  margin-bottom: 8px;
  color: #8a6a40;
  font-size: 12px;
  letter-spacing: 0.08em;
}

.record {
  padding: 12px 0;
  border-bottom: 1px solid #f6f2ec;
}

.record-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;

  .text {
    color: #3b3128;
    font-size: 13px;
    line-height: 1.5;
  }
}

.info {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
  color: #a89880;
  font-size: 11px;
}
</style>
