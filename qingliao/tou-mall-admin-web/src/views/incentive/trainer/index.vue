<template>
  <div class="ta-page">
    <header class="ta-top">
      <router-link to="/" class="ta-back">‹ 返回后台</router-link>
      <div class="ta-title">内训考核</div>
      <div class="ta-sub">每一步都算数</div>
    </header>

    <main class="ta-main">
      <section v-if="profile" class="ta-card ta-profile">
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
          <input v-model="keyword" placeholder="搜索姓名" @keyup.enter="loadTherapists">
          <button @click="loadTherapists">搜索</button>
        </div>
        <div v-if="therapists.length" class="ta-people">
          <button
            v-for="p in therapists"
            :key="p.id"
            class="ta-person"
            :class="{active: selectedTherapist && selectedTherapist.id === p.id}"
            @click="chooseTherapist(p)">
            <span>{{ p.name }}</span>
            <small>{{ p.shopName || '未分配门店' }}</small>
          </button>
        </div>
        <div v-else class="ta-empty">没有找到在职疗愈师</div>
      </section>

      <section v-if="selectedTherapist" class="ta-card">
        <div class="ta-step">02 选择部位</div>
        <div v-if="loadingProjects" class="ta-empty">正在读取项目…</div>
        <div v-else class="ta-projects">
          <button
            v-for="p in projects"
            :key="p.projectKey"
            class="ta-project"
            :class="{active: form.projectKey === p.projectKey, done: p.status === 'CERTIFIED'}"
            :disabled="p.status === 'CERTIFIED'"
            @click="chooseProject(p)">
            <span>{{ p.projectName }}</span>
            <small>{{ p.statusLabel }}</small>
          </button>
        </div>
        <div v-if="!loadingProjects && !projects.length" class="ta-empty">该疗愈师暂无启用中的考核项目</div>
      </section>

      <section v-if="form.projectKey" class="ta-card">
        <div class="ta-step">03 记录结果</div>
        <label class="ta-label">考核日期</label>
        <input v-model="form.assessDate" class="ta-input" type="date" :max="today" :min="earliest">
        <label class="ta-label">结果</label>
        <div class="ta-result">
          <button :class="{active: form.result === 1}" @click="form.result = 1">通过</button>
          <button :class="{active: form.result === 0}" @click="form.result = 0">不通过</button>
        </div>
        <label class="ta-label">备注（选填）</label>
        <textarea
          v-model="form.remark"
          class="ta-input"
          rows="3"
          maxlength="500"
          placeholder="例如：手法稳定，肩颈力度还需加强"/>
        <button class="ta-submit" :disabled="submitting" @click="submit">
          {{ submitting ? '提交中…' : '提交考核' }}
        </button>
      </section>

      <section class="ta-card">
        <div class="ta-step-row">
          <div class="ta-step">我的提交</div>
          <input v-model="month" class="ta-month" type="month" @change="loadMine(1)">
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

<script>
import dayjs from 'dayjs'
import incentiveApi from '@/api/incentive'

export default {
  name: 'TrainerAssess',
  data() {
    return {
      profile: null,
      keyword: '',
      therapists: [],
      selectedTherapist: null,
      projects: [],
      loadingProjects: false,
      form: {projectKey: '', assessDate: dayjs().format('YYYY-MM-DD'), result: 1, remark: ''},
      submitting: false,
      mine: [],
      mineTotal: 0,
      minePage: 1,
      mineSize: 20,
      month: dayjs().format('YYYY-MM'),
      toast: '',
      toastTimer: null,
      destroyed: false
    }
  },
  computed: {
    today() {
      return dayjs().format('YYYY-MM-DD')
    },
    earliest() {
      return dayjs().subtract(30, 'day').format('YYYY-MM-DD')
    }
  },
  created() {
    this.bootstrap()
  },
  beforeDestroy() {
    this.destroyed = true
    clearTimeout(this.toastTimer)
  },
  methods: {
    async bootstrap() {
      try {
        const [profile, people, mine] = await Promise.all([
          incentiveApi.trainerProfile(),
          incentiveApi.trainerTherapists({}),
          incentiveApi.myAssessments({month: this.month, page: 1, size: this.mineSize})
        ])
        if (this.destroyed) return
        this.profile = profile.data
        this.therapists = people.data || []
        this.applyMine(mine.data, 1)
      } catch (e) {
        this.notify(this.messageOf(e, '加载失败，请稍后重试'))
      }
    },
    async loadTherapists() {
      try {
        const res = await incentiveApi.trainerTherapists({keyword: this.keyword})
        if (this.destroyed) return
        this.therapists = res.data || []
      } catch (e) {
        this.notify(this.messageOf(e, '读取疗愈师失败'))
      }
    },
    async chooseTherapist(person) {
      if (this.selectedTherapist && this.selectedTherapist.id === person.id) return
      this.selectedTherapist = person
      this.projects = []
      this.form.projectKey = ''
      this.loadingProjects = true
      try {
        const res = await incentiveApi.trainerProjects({massagistId: person.id})
        if (this.destroyed) return
        this.projects = res.data || []
      } catch (e) {
        this.notify(this.messageOf(e, '读取项目失败'))
      } finally {
        this.loadingProjects = false
      }
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
        this.selectedTherapist
          ? incentiveApi.trainerProjects({massagistId: this.selectedTherapist.id})
          : Promise.resolve({data: []}),
        incentiveApi.myAssessments({month: this.month, page: 1, size: this.mineSize})
      ])
      if (this.destroyed) return
      this.profile = profile.data
      this.projects = projects.data || []
      this.applyMine(mine.data, 1)
    },
    async loadMine(page) {
      try {
        const res = await incentiveApi.myAssessments({month: this.month, page, size: this.mineSize})
        if (this.destroyed) return
        this.applyMine(res.data, page)
      } catch (e) {
        this.notify(this.messageOf(e, '读取提交记录失败'))
      }
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
  }
}
</script>

<style scoped>
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
.ta-search input, .ta-input, .ta-month {
  flex: 1; border: 1px solid #e3e0d4; border-radius: 10px; padding: 10px 12px;
  background: #fff; font-size: 14px; box-sizing: border-box; width: 100%;
}
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
.ta-toast {
  position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%);
  background: rgba(47,43,34,.92); color: #f5f6ee; padding: 10px 16px;
  border-radius: 999px; font-size: 13px; max-width: 80vw; text-align: center; z-index: 3000;
}
@media (min-width: 720px) {
  .ta-main { max-width: 560px; margin: 0 auto; }
}
</style>
