<template>
  <div class="inbox-portal">
    <transition name="inbox-fade">
      <div v-if="visible" class="inbox-layer" @click.self="close">
        <aside class="inbox-panel" role="dialog" aria-label="站内消息">
          <header class="inbox-panel__head">
            <span class="inbox-panel__title">站内消息</span>
            <button type="button" class="inbox-panel__close" aria-label="关闭" @click="close">
              <i class="el-icon-close" aria-hidden="true"></i>
            </button>
          </header>

          <div class="inbox-panel__body">
            <div class="inbox">
              <div class="inbox__toolbar">
                <el-checkbox v-model="unreadOnly" @change="load(true)">仅看未读</el-checkbox>
                <el-button type="text" size="mini" :disabled="!unreadCount" @click="markAllRead">全部已读</el-button>
              </div>
              <div
                v-for="message in messages"
                :key="message.id"
                :class="['msg-item', { 'is-unread': !message.readTime }]"
                @click="openMessage(message)">
                <div class="msg-item__head">
                  <b>{{ message.title }}</b>
                  <small>{{ shortTime(message.createTime) }}</small>
                </div>
                <p>{{ message.content }}</p>
              </div>
              <p v-if="!messages.length" class="inbox__empty">{{ loading ? '加载中…' : '暂无消息' }}</p>
              <div v-if="messages.length < total" class="inbox__more">
                <el-button type="text" @click="loadMore">加载更多</el-button>
              </div>
              <p class="inbox__footer">结算提醒按月份与门店去重，同一条不会重复推送。</p>
            </div>
          </div>
        </aside>
      </div>
    </transition>
  </div>
</template>

<script>
import messageApi from '@/api/adminMessage'

export default {
  name: 'InboxPanel',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    // 未读数由外部（导航栏）维护，这里只用于「全部已读」按钮可用性
    unreadCount: {
      type: Number,
      default: 0
    }
  },
  data() {
    return {
      unreadOnly: false,
      messages: [],
      total: 0,
      page: 1,
      loading: false
    }
  },
  watch: {
    visible(value) {
      if (value) {
        this.page = 1
        this.load(true)
        this.lockScroll(true)
        document.addEventListener('keydown', this.onKeydown)
        // 浏览器把挂载点挪到 body 上，避免被上层元素的 filter/backdrop-filter 变成包含块
        this.$nextTick(this.attachToBody)
      } else {
        this.lockScroll(false)
        document.removeEventListener('keydown', this.onKeydown)
      }
    }
  },
  mounted() {
    this.attachToBody()
  },
  beforeDestroy() {
    document.removeEventListener('keydown', this.onKeydown)
    this.lockScroll(false)
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el)
    }
  },
  methods: {
    attachToBody() {
      this.el = this.el || this.$el
      if (!this.el) return
      if (this.el.parentNode !== document.body) {
        document.body.appendChild(this.el)
      }
    },
    lockScroll(locked) {
      document.body.classList.toggle('inbox-scroll-locked', !!locked)
    },
    onKeydown(event) {
      if (event.key === 'Escape' || event.keyCode === 27) {
        this.close()
      }
    },
    close() {
      this.$emit('update:visible', false)
    },
    async load(reset) {
      this.loading = true
      try {
        const res = await messageApi.page({
          page: reset ? 1 : this.page,
          size: 20,
          unreadOnly: this.unreadOnly || undefined
        })
        const data = res.data || {}
        const list = data.list || []
        this.messages = reset ? list : this.messages.concat(list)
        this.total = data.total || list.length
      } catch (e) {
        if (reset) {
          this.messages = []
          this.total = 0
        }
      } finally {
        this.loading = false
      }
    },
    async loadMore() {
      this.page += 1
      await this.load(false)
    },
    async markAllRead() {
      try {
        await messageApi.markAllRead()
      } catch (e) {
        // 失败不影响后续刷新
      }
      await this.load(true)
      this.$emit('refresh')
    },
    async openMessage(message) {
      this.close()
      if (!message.readTime) {
        try {
          await messageApi.markRead(message.id)
        } catch (e) {
          // 已读失败不阻断跳转
        }
        this.$emit('refresh')
      }
      const link = message.link
      let target = null
      if (link) {
        target = link
      } else if (/^SETTLEMENT/.test(message.type || '')) {
        target = { path: '/salary/incentive', query: { tab: 'settlement' } }
      }
      if (!target) {
        return
      }
      const navigation = this.$router.push(target)
      if (navigation && typeof navigation.catch === 'function') {
        navigation.catch(() => {})
      }
    },
    shortTime(value) {
      if (!value) return ''
      return String(value).replace('T', ' ').slice(5, 16)
    }
  }
}
</script>

<style lang="scss">
@import "src/styles/variables.scss";

body.inbox-scroll-locked {
  overflow: hidden;
}

.inbox-portal {
  position: static;
}

.inbox-layer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 3000;
  display: flex;
  justify-content: flex-end;
  /* 轻遮罩：过重的遮罩在宽屏上会被误认为「整屏变灰/卡死」 */
  background: rgba(23, 21, 28, .26);
}

.inbox-panel {
  display: flex;
  flex-direction: column;
  width: 380px;
  max-width: 100vw;
  height: 100%;
  background: #fff;
  border-radius: 20px 0 0 20px;
  box-shadow: 0 24px 60px -24px rgba(28, 27, 32, .38);
  overflow: hidden;
  animation: inbox-slide-in .26s cubic-bezier(.22, .61, .36, 1) both;
}

@keyframes inbox-slide-in {
  from { transform: translate3d(100%, 0, 0); }
  to { transform: translate3d(0, 0, 0); }
}

.inbox-fade-enter-active,
.inbox-fade-leave-active {
  transition: opacity .2s ease;
}

.inbox-fade-enter,
.inbox-fade-leave-to {
  opacity: 0;
}

.inbox-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 12px;
  color: #1C1B20;
}

.inbox-panel__title {
  font-size: 17px;
  font-weight: 600;
}

.inbox-panel__close {
  border: none;
  background: transparent;
  padding: 4px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: #726D7B;

  &:hover {
    color: #4A3B63;
  }
}

.inbox-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #F7F6FA;
}

.inbox {
  padding: 4px 14px 20px;
}

.inbox__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.msg-item {
  background: #fff;
  border: 1px solid #EFEBF3;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color .18s ease, box-shadow .18s ease;

  &:hover {
    border-color: #CBBBE4;
    box-shadow: 0 4px 14px rgba(74, 59, 99, .08);
  }

  &.is-unread {
    border-left: 3px solid #6750A4;

    .msg-item__head b {
      color: #4A3B63;
    }
  }

  &__head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;

    b {
      font-size: 13px;
      color: #2B2930;
      font-weight: 600;
    }

    small {
      font-size: 10px;
      color: #9A94A3;
      white-space: nowrap;
    }
  }

  p {
    margin: 6px 0 0;
    font-size: 12px;
    color: #79747E;
    line-height: 1.6;
  }
}

.inbox__empty {
  text-align: center;
  color: #9A94A3;
  font-size: 12px;
  padding: 40px 0;
}

.inbox__more {
  text-align: center;
}

.inbox__footer {
  margin-top: 12px;
  font-size: 10px;
  color: #B0AAB8;
  text-align: center;
}

@media (max-width: 768px) {
  .inbox-panel {
    width: 100%;
    max-width: 100vw;
    border-radius: 0;
  }
}
</style>