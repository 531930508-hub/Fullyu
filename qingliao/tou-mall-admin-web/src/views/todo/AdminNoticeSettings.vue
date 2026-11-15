<template>
  <el-dialog title="我的审批通知" :visible.sync="visible" width="720px" class="notice-settings"
    :before-close="beforeClose" :close-on-click-modal="!submitting" :close-on-press-escape="!submitting" @closed="closed">
    <el-alert v-if="status && status.realDeliveryEnabled" title="审批提醒会推送到你绑定的微信服务号。" type="success" :closable="false" show-icon />
    <el-alert v-else title="当前为模拟验证，不会发送真实微信消息。" type="info" :closable="false" show-icon />
    <section class="binding-section" aria-label="个人服务号绑定">
      <h3>Full愈服务号</h3>
      <div v-loading="statusLoading">
        <div v-if="statusError" class="error-state" role="alert">
          {{ statusError }} <el-button type="text" @click="loadStatus">重试</el-button>
        </div>
        <template v-else-if="status">
          <p v-if="!status.enabled">审批通知尚未开启，待办中心仍可正常使用。</p>
          <template v-else>
            <p v-if="!status.bound">尚未绑定当前后台账号。</p>
            <p v-else-if="status.following">已绑定当前后台账号，已关注服务号。</p>
            <p v-else>已绑定当前后台账号，但尚未关注服务号。关注后可重新扫码绑定或点「刷新状态」。</p>
            <p v-if="!status.templateConfigured" class="secondary">尚未配置消息模板，审批提醒暂不会真实发送。</p>
            <p v-if="!status.qrAvailable" class="secondary">扫码绑定尚未开放，暂不能在这里新增绑定。</p>
            <el-button size="small" :disabled="submitting" @click="loadStatus">刷新状态</el-button>
            <el-button v-if="status.qrAvailable" size="small" type="primary" :loading="qrLoading" :disabled="submitting" @click="openQr">{{ status.bound ? '重新扫码绑定' : '扫码绑定服务号' }}</el-button>
            <el-button v-if="status.bound && status.following && status.realDeliveryEnabled" size="small" :loading="testing" :disabled="submitting" @click="sendTest">发送测试消息</el-button>
            <el-button v-if="status.bound" size="small" :disabled="submitting" @click="unlink">解除我的绑定</el-button>
          </template>
        </template>
      </div>
      <p v-if="actionError" class="error-state" role="alert">{{ actionError }}</p>
    </section>
    <section aria-label="个人通知记录">
      <div class="section-head"><h3>我的通知记录</h3><el-button size="small" :disabled="logsLoading" @click="loadLogs">刷新记录</el-button></div>
      <p class="secondary">仅显示分配给你的通知，发送结果以微信回执为准。</p>
      <div v-if="logsError" class="error-state" role="alert">{{ logsError }} <el-button type="text" @click="loadLogs">重试</el-button></div>
      <el-table v-else :data="rows" v-loading="logsLoading" border empty-text="暂无通知记录">
        <el-table-column prop="approvalId" label="审批编号" min-width="100" />
        <el-table-column label="类型" min-width="90"><template slot-scope="scope">{{ kindLabel(scope.row.kind) }}</template></el-table-column>
        <el-table-column label="状态" min-width="150"><template slot-scope="scope">{{ stateLabel(scope.row.state) }}</template></el-table-column>
        <el-table-column label="结果" min-width="120"><template slot-scope="scope">{{ resultLabel(scope.row.result) }}</template></el-table-column>
        <el-table-column label="记录时间" min-width="180"><template slot-scope="scope">{{ timeLabel(scope.row.createTime) }}</template></el-table-column>
      </el-table>
      <div class="notice-pager"><el-pagination layout="total, prev, pager, next" :page-size="size" :current-page="page" :total="total" @current-change="changePage" /></div>
    </section>
    <span slot="footer"><el-button :disabled="submitting" @click="beforeClose(() => { visible = false })">关闭</el-button></span>
    <el-dialog title="扫码绑定 Full愈服务号" :visible.sync="qrVisible" width="360px" append-to-body class="notice-qr" @closed="stopQrPoll">
      <div class="qr-body" v-loading="qrLoading">
        <img v-if="qrImage" :src="qrImage" alt="服务号绑定二维码" class="qr-image">
        <p>请用微信扫描二维码并在微信中允许授权，即可绑定当前后台账号。</p>
        <p class="secondary">二维码 10 分钟内有效，绑定成功后此窗口会自动关闭。</p>
        <p v-if="qrError" class="error-state" role="alert">{{ qrError }}</p>
      </div>
    </el-dialog>
  </el-dialog>
</template>
<script>
import adminNoticeApi from '@/api/adminNotice'
export default {
  name: 'AdminNoticeSettings',
  data() {
    return {visible: false, status: null, rows: [], total: 0, page: 1, size: 10,
      statusLoading: false, logsLoading: false, submitting: false,
      statusError: '', logsError: '', actionError: '', statusRequest: 0, logsRequest: 0,
      qrVisible: false, qrImage: '', qrError: '', qrLoading: false, qrTimer: null, testing: false}
  },
  beforeDestroy() { this.closed() },
  methods: {
    async open() {
      this.visible = true
      this.status = null
      this.rows = []
      this.total = 0
      this.page = 1
      this.actionError = ''
      await Promise.all([this.loadStatus(), this.loadLogs()])
    },
    beforeClose(done) { if (!this.submitting) done() },
    closed() {
      this.visible = false
      this.stopQrPoll()
      this.qrVisible = false
      this.statusRequest++
      this.logsRequest++
      this.status = null
      this.rows = []
      this.total = 0
    },
    async loadStatus(silent) {
      const request = ++this.statusRequest
      if (!silent) this.statusLoading = true
      if (!silent) this.statusError = ''
      try {
        const res = await adminNoticeApi.status()
        if (this.visible && request === this.statusRequest) {
          this.status = res.data || null
          if (silent && this.status && this.status.bound && this.status.following) {
            this.stopQrPoll()
            this.qrVisible = false
            this.$message.success('服务号绑定完成')
          }
        }
      } catch (error) {
        if (!silent && this.visible && request === this.statusRequest) {
          this.status = null
          this.statusError = '绑定状态加载失败，请重试。'
        }
      } finally { if (!silent && request === this.statusRequest) this.statusLoading = false }
    },
    async openQr() {
      if (this.qrLoading) return
      this.qrLoading = true
      this.qrError = ''
      this.qrImage = ''
      this.actionError = ''
      try {
        const res = await adminNoticeApi.oauthUrl()
        const data = res.data || {}
        if (!data.qrDataUrl) throw new Error('empty qr')
        this.qrImage = data.qrDataUrl
        this.qrVisible = true
        this.startQrPoll()
      } catch (error) {
        this.qrError = '二维码生成失败，请稍后重试。'
        this.qrVisible = true
      } finally { this.qrLoading = false }
    },
    startQrPoll() {
      this.stopQrPoll()
      this.qrTimer = setInterval(() => this.loadStatus(true), 5000)
    },
    stopQrPoll() {
      if (this.qrTimer) { clearInterval(this.qrTimer); this.qrTimer = null }
    },
    async sendTest() {
      if (this.testing) return
      this.testing = true
      this.actionError = ''
      try {
        await adminNoticeApi.testSend()
        this.$message.success('测试消息已发送，请在微信服务号中查看')
        await this.loadLogs()
      } catch (error) {
        this.actionError = '测试消息发送失败，具体原因见上方提示。'
      } finally { this.testing = false }
    },
    async loadLogs() {
      const request = ++this.logsRequest
      this.logsLoading = true
      this.logsError = ''
      try {
        const res = await adminNoticeApi.logs({page: this.page, size: this.size})
        if (this.visible && request === this.logsRequest) {
          this.rows = res.data && res.data.list || []
          this.total = res.data && res.data.total || 0
        }
      } catch (error) {
        if (this.visible && request === this.logsRequest) {
          this.rows = []
          this.total = 0
          this.logsError = '通知记录加载失败，请重试。'
        }
      } finally { if (request === this.logsRequest) this.logsLoading = false }
    },
    async changePage(page) { this.page = page; await this.loadLogs() },
    async unlink() {
      if (this.submitting || !this.status || !this.status.bound) return
      this.submitting = true
      this.actionError = ''
      try {
        await this.$confirm('解除后将不再向此绑定发送审批提醒，是否继续？', '解除我的绑定', {type: 'warning'})
        await adminNoticeApi.unlink()
        this.$message.success('已解除绑定')
        await this.loadStatus()
      } catch (error) {
        if (error !== 'cancel' && error !== 'close') this.actionError = '解除绑定失败，当前绑定未确认改变，请刷新后重试。'
      } finally { this.submitting = false }
    },
    timeLabel(value) { return value ? String(value).replace('T', ' ').slice(0, 19) : '' },
    kindLabel(kind) { return {PENDING: '待审批', CC: '抄送', RESULT: '审批结果'}[kind] || '通知' },
    resultLabel(result) {
      return {WECHAT_OK: '已送达', NOT_FOLLOWED: '未关注', INVALID_OPENID: 'openid失效', TEMPLATE_INVALID: '模板不可用',
        AUTH_INVALID: '授权失效', SEND_ERROR: '发送异常', SUPERSEDED: '待办已变化', ADMIN_DISABLED: '账号不可用',
        LIVE_DISABLED: '未开启发送', EXPIRED: '已过期', STALE: '积压已跳过'}[result] || (result ? String(result) : '')
    },
    stateLabel(state) {
      return {PENDING: '待评估', NOT_CONFIGURED: '等待配置', NOT_BOUND: '等待绑定或关注', MOCK: '模拟评估',
        LIVE_BLOCKED: '真实发送未开放', SUPERSEDED: '待办已变化', INACTIVE: '账号不可用', EXPIRED: '提醒已过期'}[state] || '待确认'
    }
  }
}
</script>
<style lang="scss">
.notice-settings {
  letter-spacing: 0.05em;
  .el-dialog { max-width: calc(100vw - 32px); }
  h3 { margin: 0 0 12px; font-size: 15px; letter-spacing: 0.06em; }
  p { margin: 0 0 12px; line-height: 1.7; }
  .binding-section { margin: 24px 0; }
  .secondary { color: inherit; opacity: 0.75; font-size: 12px; }
  .error-state { margin: 12px 0; line-height: 1.7; }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .section-head h3 { margin: 0; }
  .notice-pager { display: flex; justify-content: flex-end; margin-top: 16px; overflow-x: auto; }
}
.notice-qr {
  .qr-body { text-align: center; }
  .qr-image { width: 240px; height: 240px; display: block; margin: 0 auto 16px; }
}
</style>
