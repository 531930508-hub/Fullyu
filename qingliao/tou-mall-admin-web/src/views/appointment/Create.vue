<template>
  <div class="appointment-create">
    <header class="create-hero">
      <div class="create-hero__main">
        <p class="create-hero__eyebrow">预约管理</p>
        <h1 class="create-hero__title">预约登记</h1>
        <p class="create-hero__desc">
          与预约列表共用同一套建单抽屉。选好服务项目、到店时间与疗愈师后，提交即可进入排班与订单流程。
        </p>
        <div class="create-hero__actions">
          <el-button type="primary" icon="el-icon-plus" @click="openDrawer">开始登记</el-button>
          <el-button @click="$router.push('/appointment/list')">查看预约列表</el-button>
        </div>
      </div>
      <div class="create-hero__mark" aria-hidden="true">
        <span class="create-hero__mark-day">{{ todayLabel }}</span>
        <span class="create-hero__mark-text">轻疗运营台</span>
      </div>
    </header>

    <div class="create-grid">
      <section class="create-card">
        <h2 class="create-card__title">一次登记，三步入座</h2>
        <ol class="create-steps">
          <li class="create-step">
            <span class="create-step__no">01</span>
            <div>
              <p class="create-step__title">选择服务项目与人数</p>
              <p class="create-step__desc">按项目时长与床位需求带出可预约时段，支持多人同行。</p>
            </div>
          </li>
          <li class="create-step">
            <span class="create-step__no">02</span>
            <div>
              <p class="create-step__title">确认到店日期与时间</p>
              <p class="create-step__desc">系统自动校验营业时间、床位与疗愈师排班，冲突时段不可选。</p>
            </div>
          </li>
          <li class="create-step">
            <span class="create-step__no">03</span>
            <div>
              <p class="create-step__title">指派疗愈师与床位</p>
              <p class="create-step__desc">可按客户偏好指派；无人可接时可留空，由排班看板继续调度。</p>
            </div>
          </li>
        </ol>
        <div class="create-card__foot">
          <span>提交后可在「预约列表」继续改约、取消或收款。</span>
          <el-button type="text" @click="$router.push('/appointment/board')">去排班看板</el-button>
        </div>
      </section>

      <aside class="create-aside">
        <h2 class="create-aside__title">登记前请确认</h2>
        <ul class="create-tips">
          <li>客户手机号已存在时，系统会自动带出客户档案与历史偏好。</li>
          <li>选择疗愈师前，先确认该时段未被请假、培训或已有预约占用。</li>
          <li>多人同行请按实际到店人数填写，床位会按项目时长自动占用。</li>
          <li>定金与支付方式可在建单时一并记录，避免到店后重复核对。</li>
        </ul>
        <div class="create-aside__note">
          已提交的预约不会重复创建；如需补录历史单，请在预约列表中操作。
        </div>
      </aside>
    </div>

    <transition name="el-fade-in-linear">
      <div v-if="justCreated" class="create-success">
        <i class="el-icon-circle-check"></i>
        <div class="create-success__text">
          <p>预约已提交</p>
          <span>可在预约列表查看状态，或继续登记下一单。</span>
        </div>
        <el-button size="small" @click="$router.push('/appointment/list')">查看列表</el-button>
        <el-button size="small" type="primary" @click="openDrawer">再登记一单</el-button>
      </div>
    </transition>

    <appointment-drawer ref="appointmentDrawer" @submit-success="onCreated"/>
  </div>
</template>

<script>
import AppointmentDrawer from '@/views/home/AppointmentDrawer'

export default {
  name: 'appointmentCreate',
  components: { AppointmentDrawer },
  data() {
    return {
      justCreated: false
    }
  },
  computed: {
    todayLabel() {
      const now = new Date()
      const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]
      return `${now.getMonth() + 1}月${now.getDate()}日 ${week}`
    }
  },
  mounted() {
    // 从侧边栏进入时直接展开建单抽屉，减少一次点击；关闭后停留在说明页
    this.$nextTick(() => {
      this.openDrawer()
    })
  },
  methods: {
    openDrawer() {
      this.justCreated = false
      if (this.$refs.appointmentDrawer) {
        this.$refs.appointmentDrawer.open({}, {}, '预约登记')
      }
    },
    onCreated() {
      this.justCreated = true
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
@import "src/styles/variables.scss";

.appointment-create {
  padding: 20px;
}

.create-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 32px;
  border-radius: $radius-xl;
  border: 1px solid $line;
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(203, 187, 247, .55) 0%, rgba(203, 187, 247, 0) 58%),
    linear-gradient(135deg, #FFFFFF 0%, #F7F3FF 100%);
  box-shadow: $shadow-sm;
}

.create-hero__main {
  max-width: 640px;
}

.create-hero__eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .16em;
  color: $brand;
}

.create-hero__title {
  margin: 0;
  font-size: 30px;
  line-height: 38px;
  font-weight: 600;
  color: $ink;
  letter-spacing: -.02em;
}

.create-hero__desc {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 22px;
  color: $ink-secondary;
}

.create-hero__actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.create-hero__mark {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  min-width: 148px;
  padding: 18px 20px;
  border-radius: $radius-lg;
  background: rgba(255, 255, 255, .72);
  border: 1px solid rgba(220, 210, 240, .9);
  color: $ink-secondary;
}

.create-hero__mark-day {
  font-size: 13px;
  font-weight: 600;
  color: $brand-deep;
}

.create-hero__mark-text {
  font-size: 11px;
  letter-spacing: .12em;
  color: $ink-faint;
}

.create-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, .8fr);
  gap: 16px;
  margin-top: 16px;
}

.create-card,
.create-aside {
  background: $surface;
  border: 1px solid $line;
  border-radius: $radius-lg;
  box-shadow: $shadow-sm;
}

.create-card {
  padding: 22px 24px;
}

.create-card__title,
.create-aside__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: $ink;
}

.create-steps {
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.create-step {
  display: flex;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px dashed $line;

  &:last-child {
    border-bottom: 0;
  }
}

.create-step__no {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: $brand-soft;
  color: $brand;
  font-size: 12px;
  font-weight: 600;
  line-height: 34px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.create-step__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: $ink;
}

.create-step__desc {
  margin: 5px 0 0;
  font-size: 12.5px;
  line-height: 20px;
  color: $ink-muted;
}

.create-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px solid $line;
  font-size: 12px;
  color: $ink-muted;
}

.create-aside {
  padding: 22px 24px;
  background: $surface-2;
}

.create-tips {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;

  li {
    position: relative;
    padding-left: 16px;
    margin-bottom: 12px;
    font-size: 12.5px;
    line-height: 20px;
    color: $ink-secondary;

    &::before {
      content: "";
      position: absolute;
      left: 0;
      top: 7px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: $brand-tint;
    }
  }
}

.create-aside__note {
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: $radius-md;
  background: $brand-soft;
  font-size: 12px;
  line-height: 19px;
  color: $brand-deep;
}

.create-success {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 14px 18px;
  border-radius: $radius-lg;
  border: 1px solid #CFE7D8;
  background: $success-soft;
  color: $success;

  > i {
    font-size: 22px;
  }
}

.create-success__text {
  flex: 1;

  p {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }

  span {
    font-size: 12px;
    color: $ink-muted;
  }
}

@media (max-width: 1100px) {
  .create-grid {
    grid-template-columns: 1fr;
  }

  .create-hero__mark {
    display: none;
  }
}
</style>