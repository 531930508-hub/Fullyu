<template>
  <div class="page-container">
    <!-- 列表模式 -->
    <template v-if="currentView === 'list'">
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h2 class="page-title">课程管理</h2>
        <a-space>
          <a-input-search placeholder="搜索课程名称" style="width: 200px" v-model:value="searchText" allow-clear @search="loadCourses" @change="onSearchChange" />
          <a-range-picker v-model:value="dateRange" style="width: 240px" :placeholder="['开课起', '开课止']" @change="onDateRangeChange" />
          <a-radio-group v-model:value="datePreset" @change="onDatePresetChange">
            <a-radio-button value="today">今天</a-radio-button>
            <a-radio-button value="near">近几天</a-radio-button>
            <a-radio-button value="week">本周</a-radio-button>
            <a-radio-button value="all">全部</a-radio-button>
          </a-radio-group>
          <a-select v-model:value="filterStatus" style="width: 130px" placeholder="数据状态" @change="loadCourses">
            <a-select-option value="">全部数据状态</a-select-option>
            <a-select-option value="PUBLISHED">已发布</a-select-option>
            <a-select-option value="DRAFT">草稿</a-select-option>
            <a-select-option value="COMPLETED">已完成</a-select-option>
            <a-select-option value="EXPIRED">已过期</a-select-option>
            <a-select-option value="CANCELLED">已下架</a-select-option>
          </a-select>
          <a-select v-model:value="filterPhase" style="width: 150px" placeholder="展示状态" @change="loadCourses">
            <a-select-option value="">全部展示状态</a-select-option>
            <a-select-option value="ENROLL_UPCOMING">报名未开始</a-select-option>
            <a-select-option value="ENROLLING">报名中</a-select-option>
            <a-select-option value="ENROLL_CLOSED">报名截止</a-select-option>
            <a-select-option value="LATE_ENROLLING">补报名中</a-select-option>
            <a-select-option value="ONGOING">进行中</a-select-option>
            <a-select-option value="ENDED">已结束</a-select-option>
          </a-select>
          <a-button v-perm="'course:create'" type="primary" @click="openCreate">+ 创建课程</a-button>
        </a-space>
      </div>

      <!-- 课程统计 -->
      <a-row :gutter="24" style="margin-bottom: 24px">
        <a-col :span="6"><a-card><a-statistic title="课程总数" :value="filteredCourses.length" /></a-card></a-col>
        <a-col :span="6"><a-card><a-statistic title="报名中" :value="filteredCourses.filter(c => c.bookable).length" :value-style="{ color: '#27AE60' }" /></a-card></a-col>
        <a-col :span="6"><a-card><a-statistic title="本周开课" :value="weekCourseCount" suffix="节" /></a-card></a-col>
        <a-col :span="6"><a-card><a-statistic title="平均满员率" :value="avgFillRate" suffix="%" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
      </a-row>

      <a-row :gutter="[24, 24]">
        <a-col :span="8" v-for="course in filteredCourses" :key="course.id">
          <a-card hoverable class="course-card" @click="viewCourseDetail(course)">
            <template #cover>
              <div class="course-cover" :style="course.coverImage ? { backgroundImage: `url(${course.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: course.coverColor }">
                <span class="course-type-badge">{{ course.typeLabel }}</span>
                <div class="course-cover-title">{{ course.name }}</div>
              </div>
            </template>
            <div class="course-meta">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 600; color: #4B3621;">{{ course.trainer }}</span>
                <a-tag :color="coursePhaseColor(course.phase)">
                  {{ course.phaseLabel || course.statusLabel }}
                </a-tag>
              </div>
              <div style="color: #7D665C; font-size: 13px; margin-bottom: 8px;">
                {{ course.schedule }} · {{ course.venue }}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #6B463C; font-weight: 600;">¥{{ course.price }}</span>
                <span style="color: #999; font-size: 12px;">{{ course.enrolled }}/{{ course.capacity }}人</span>
              </div>
              <a-progress :percent="Math.round(course.enrolled / course.capacity * 100)" :stroke-color="'#6B463C'" size="small" style="margin-top: 8px;" />
            </div>
            <template #actions>
              <a-button type="link" size="small" @click.stop="viewCourseDetail(course)">详情</a-button>
              <a-button v-perm="'course:create'" type="link" size="small" @click.stop="handleCopy(course)">复制</a-button>
              <a-dropdown trigger="click">
                <a-button type="link" size="small" @click.stop>管理</a-button>
                <template #overlay>
                  <a-menu @click="handleCourseMenuClick($event, course)">
                    <a-menu-item v-if="course.status === 'PUBLISHED' && canAdjustEnrollment(course)" key="adjust">调整报名截止</a-menu-item>
                    <a-menu-item v-if="course.status === 'PUBLISHED'" key="complete">标记为已结束</a-menu-item>
                    <a-menu-item v-if="course.status === 'PUBLISHED'" key="unpublish" danger>下架课程</a-menu-item>
                    <a-menu-item v-if="course.status === 'DRAFT'" key="delete" danger>删除草稿</a-menu-item>
                    <a-menu-item v-if="!['PUBLISHED', 'DRAFT'].includes(course.status)" key="view">查看历史</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </template>
          </a-card>
        </a-col>
      </a-row>
    </template>

    <!-- 创建/编辑课程模式 -->
    <template v-if="currentView === 'create'">
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <a-space>
          <a-button @click="currentView = 'list'">← 返回</a-button>
          <h2 class="page-title" style="margin: 0;">创建课程</h2>
        </a-space>
        <a-space>
          <a-button @click="currentView = 'list'">取消</a-button>
          <a-button @click="handleSaveDraft">保存草稿</a-button>
          <a-button type="primary" @click="handlePublish">发布课程</a-button>
        </a-space>
      </div>

      <a-steps :current="createStep" style="margin-bottom: 32px; max-width: 800px; margin-left: auto; margin-right: auto;">
        <a-step title="基本信息" />
        <a-step title="排期与场地" />
        <a-step title="定价与名额" />
        <a-step title="课程大纲" />
        <a-step title="确认发布" />
      </a-steps>

      <!-- Step 1: 基本信息 -->
      <a-card v-show="createStep === 0" title="基本信息">
        <a-form layout="vertical" style="max-width: 800px;">
          <a-row :gutter="24">
            <a-col :span="16">
              <a-form-item label="课程名称" required>
                <a-input v-model:value="form.name" placeholder="如：正念冥想入门 · 觉察呼吸" size="large" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="课程类型" required>
                <a-select v-model:value="form.type" placeholder="选择类型" size="large">
                  <a-select-option value="SINGLE">单次课程</a-select-option>
                  <a-select-option value="SERIES">系列课程</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item label="课程简介" required>
            <a-textarea v-model:value="form.description" :rows="3" placeholder="一段简短描述，展示在小程序课程列表卡片中（建议50字以内）" show-count :maxlength="100" />
          </a-form-item>
          <a-form-item label="课程详细介绍">
            <a-textarea v-model:value="form.detailDesc" :rows="5" placeholder="详细介绍课程内容、适合人群、课程特色等，展示在课程详情页" />
          </a-form-item>
          <a-row :gutter="24">
            <a-col :span="8">
              <a-form-item label="难度等级">
                <a-select v-model:value="form.difficulty" placeholder="选择难度">
                  <a-select-option value="BEGINNER">入门（零基础）</a-select-option>
                  <a-select-option value="INTERMEDIATE">进阶（有基础）</a-select-option>
                  <a-select-option value="ADVANCED">高级（资深练习者）</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="适合人群">
                <a-select v-model:value="form.targetAudience" mode="multiple" placeholder="可多选">
                  <a-select-option value="STRESS">压力大/焦虑人群</a-select-option>
                  <a-select-option value="SLEEP">睡眠问题</a-select-option>
                  <a-select-option value="BODY">身体僵硬/亚健康</a-select-option>
                  <a-select-option value="EMOTION">情绪管理</a-select-option>
                  <a-select-option value="EXPLORE">自我探索</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="课程标签">
                <a-select v-model:value="form.tags" mode="tags" placeholder="输入标签回车添加">
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="24">
            <a-col :span="12">
              <a-form-item label="授课导师" required>
                <a-select v-model:value="form.trainerId" placeholder="选择导师" show-search option-filter-prop="children">
                  <a-select-option v-for="t in trainerOptions" :key="t.id" :value="t.id">{{ t.displayName }}</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="助教（可选）">
                <a-select v-model:value="form.assistantId" placeholder="选择助教" allow-clear>
                  <a-select-option value="a1">小林</a-select-option>
                  <a-select-option value="a2">小陈</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item label="课程封面">
            <a-radio-group v-model:value="form.coverType">
              <a-radio value="upload">上传图片（推荐）</a-radio>
              <a-radio value="gradient">渐变色</a-radio>
            </a-radio-group>
            <div v-if="form.coverType === 'gradient'" style="margin-top: 12px; display: flex; gap: 12px;">
              <div v-for="color in coverColors" :key="color" class="color-option" :class="{ active: form.coverColor === color }" :style="{ background: color }" @click="form.coverColor = color"></div>
            </div>
            <div v-else style="margin-top: 12px;">
              <div v-if="form.coverImage" class="cover-preview" @click="cropperVisible = true">
                <img :src="form.coverImage" />
                <div class="cover-preview-mask">点击重新裁剪</div>
              </div>
              <div v-else class="cover-upload-box" @click="cropperVisible = true">
                <span style="font-size: 24px;">+</span><div>上传并裁剪</div>
              </div>
              <div style="color: #999; font-size: 12px; margin-top: 8px;">为保证小程序显示效果，封面统一裁剪为正方形（1:1）</div>
            </div>
          </a-form-item>
          <a-form-item label="详情图集（滚动展示）">
            <div class="gallery-upload">
              <div v-for="(img, idx) in form.gallery" :key="idx" class="gallery-item">
                <img :src="img" />
                <div class="gallery-remove" @click="removeGalleryImage(idx)">×</div>
              </div>
              <div class="gallery-add" @click="addGalleryImage">
                <span style="font-size: 20px;">+</span>
                <div style="font-size: 11px;">上传图片</div>
              </div>
            </div>
            <input ref="galleryInputRef" type="file" accept="image/*" multiple style="display: none" @change="onGalleryFilesSelected" />
            <div style="color: #999; font-size: 12px; margin-top: 8px;">
              课程详情页滚动展示的图片，由你自行上传，建议3-8张（可一次选择多张）。
            </div>
          </a-form-item>
        </a-form>
        <div style="text-align: right; margin-top: 24px;">
          <a-button type="primary" @click="createStep = 1">下一步</a-button>
        </div>
      </a-card>

      <!-- Step 2: 排期与场地 -->
      <a-card v-show="createStep === 1" title="排期与场地">
        <a-form layout="vertical" style="max-width: 800px;">
          <a-form-item label="排期方式" required>
            <a-radio-group v-model:value="form.scheduleType">
              <a-radio value="RECURRING">周期循环（每周固定）</a-radio>
              <a-radio value="SINGLE">单次活动</a-radio>
              <a-radio value="APPOINTMENT">预约制</a-radio>
            </a-radio-group>
          </a-form-item>
          <template v-if="form.scheduleType === 'RECURRING'">
            <a-form-item label="上课日期">
              <a-checkbox-group v-model:value="form.weekdays">
                <a-checkbox value="1">周一</a-checkbox>
                <a-checkbox value="2">周二</a-checkbox>
                <a-checkbox value="3">周三</a-checkbox>
                <a-checkbox value="4">周四</a-checkbox>
                <a-checkbox value="5">周五</a-checkbox>
                <a-checkbox value="6">周六</a-checkbox>
                <a-checkbox value="7">周日</a-checkbox>
              </a-checkbox-group>
            </a-form-item>
            <a-row :gutter="24">
              <a-col :span="8">
                <a-form-item label="上课时间">
                  <a-time-picker v-model:value="form.startTime" format="HH:mm" placeholder="开始时间" style="width: 100%" />
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="课程时长">
                  <a-select v-model:value="form.duration" placeholder="选择时长">
                    <a-select-option v-for="d in durationOptions" :key="d.value" :value="Number(d.value)">{{ d.label }}</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="总节数">
                  <a-input-number v-model:value="form.totalSessions" :min="1" style="width: 100%" placeholder="如 12 节" />
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="24">
              <a-col :span="12">
                <a-form-item label="开课日期"><a-date-picker v-model:value="form.startDate" style="width: 100%" placeholder="第一节课日期" /></a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="结课日期"><a-date-picker v-model:value="form.endDate" style="width: 100%" placeholder="最后一节课日期" /></a-form-item>
              </a-col>
            </a-row>
          </template>
          <template v-if="form.scheduleType === 'SINGLE'">
            <a-row :gutter="24">
              <a-col :span="8"><a-form-item label="活动日期"><a-date-picker v-model:value="form.startDate" style="width: 100%" placeholder="选择活动日期" @change="(v: any) => { form.endDate = v }" /></a-form-item></a-col>
              <a-col :span="8"><a-form-item label="开始时间"><a-time-picker v-model:value="form.startTime" format="HH:mm" placeholder="开始时间" style="width: 100%" /></a-form-item></a-col>
              <a-col :span="8"><a-form-item label="时长"><a-select v-model:value="form.duration" placeholder="选择时长"><a-select-option v-for="d in durationOptions" :key="d.value" :value="Number(d.value)">{{ d.label }}</a-select-option></a-select></a-form-item></a-col>
            </a-row>
          </template>
          <a-form-item label="上课场地" required>
            <a-select v-model:value="form.venueId" placeholder="选择场地">
              <a-select-option v-for="v in venueOptions" :key="v.id" :value="v.id">{{ v.name }}（{{ v.capacity }}人）</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="所需物料">
            <a-select v-model:value="form.materials" mode="multiple" placeholder="选择课程所需物料">
              <a-select-option value="yoga_mat">瑜伽垫</a-select-option>
              <a-select-option value="cushion">蒲团/坐垫</a-select-option>
              <a-select-option value="singing_bowl">颂钵</a-select-option>
              <a-select-option value="essential_oil">精油套装</a-select-option>
              <a-select-option value="blanket">毛毯</a-select-option>
              <a-select-option value="eye_mask">眼罩</a-select-option>
              <a-select-option value="incense">线香/熏香</a-select-option>
              <a-select-option value="speaker">蓝牙音箱</a-select-option>
            </a-select>
          </a-form-item>
        </a-form>
        <div style="text-align: right; margin-top: 24px;">
          <a-button style="margin-right: 12px" @click="createStep = 0">上一步</a-button>
          <a-button type="primary" @click="createStep = 2">下一步</a-button>
        </div>
      </a-card>

      <!-- Step 3: 定价与名额 -->
      <a-card v-show="createStep === 2" title="定价与名额">
        <a-form layout="vertical" style="max-width: 800px;">
          <a-row :gutter="24">
            <a-col :span="8">
              <a-form-item label="每节容量（最大人数）" required>
                <a-input-number v-model:value="form.capacity" :min="1" :max="50" suffix="人" style="width: 100%" size="large" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="最少开课人数" required>
                <a-input-number v-model:value="form.minStudents" :min="1" suffix="人" style="width: 100%" size="large" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="最晚成团时间" required>
                <a-date-picker v-model:value="form.groupDeadline" show-time format="YYYY-MM-DD HH:mm" style="width: 100%" size="large" placeholder="选择截止时间" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-alert message="若到「最晚成团时间」仍未达到最少开课人数，系统将自动取消该课程，并释放已占用的场地与物料，已报名学员全额退款。" type="warning" style="margin-bottom: 16px" show-icon />

          <a-divider>阶梯定价（自定义名次与价格）</a-divider>
          <a-alert message="自定义设置“第几位到第几位”的价格，越早报名越优惠（按报名顺序）" type="info" style="margin-bottom: 16px" show-icon />
          <div v-for="(tier, index) in form.priceTiers" :key="index" style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center;">
            <span style="color: #6B463C;">第</span>
            <a-input-number v-model:value="tier.from" :min="1" style="width: 80px" />
            <span style="color: #6B463C;">位 至 第</span>
            <a-input-number v-model:value="tier.to" :min="tier.from" style="width: 80px" />
            <span style="color: #6B463C;">位</span>
            <a-input-number v-model:value="tier.price" prefix="¥" :min="0" style="width: 140px" />
            <span style="color: #999; font-size: 12px;">/ 人</span>
            <a-button v-if="form.priceTiers.length > 1" type="text" danger size="small" @click="form.priceTiers.splice(index, 1)">删除</a-button>
          </div>
          <a-button type="dashed" size="small" @click="addPriceTier">+ 添加价格区间</a-button>

          <a-divider>会员卡折扣（按百分比）</a-divider>
          <a-alert message="按百分比打折：例如 70% 即按原价的 70%（七折）收费，0% 即免费（¥0），100% 即不打折。" type="info" style="margin-bottom: 16px" show-icon />
          <a-row :gutter="24">
            <a-col :span="8">
              <a-form-item label="年卡会员折扣">
                <a-input-number v-model:value="form.yearlyDiscount" :min="0" :max="100" :formatter="(v: any) => `${v}%`" :parser="(v: any) => v.replace('%', '')" style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="季卡会员折扣">
                <a-input-number v-model:value="form.quarterlyDiscount" :min="0" :max="100" :formatter="(v: any) => `${v}%`" :parser="(v: any) => v.replace('%', '')" style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="月卡会员折扣">
                <a-input-number v-model:value="form.monthlyDiscount" :min="0" :max="100" :formatter="(v: any) => `${v}%`" :parser="(v: any) => v.replace('%', '')" style="width: 100%" />
              </a-form-item>
            </a-col>
          </a-row>

          <a-divider>候补排队（小程序约满后的候补机制）</a-divider>
          <a-form-item>
            <a-switch v-model:checked="form.waitlistEnabled" /> <span style="margin-left: 8px; color: #4B3621;">开启候补排队（类似 12306 候补逻辑）</span>
          </a-form-item>
          <template v-if="form.waitlistEnabled">
            <a-alert type="info" style="margin-bottom: 16px" show-icon
              message="候补即预付：约满后学员下单锁价+锁排队顺序并支付，支付成功才进入候补队列；有人取消则按「会员席位优先→普通席位」顺序自动递补，轮到直接上课；超过候补截止仍未轮上则自动全额退款；未支付超时/主动取消则释放锁定。" />
            <a-row :gutter="24">
              <a-col :span="12">
                <a-form-item label="候补截止（默认可候补至开课前多久，学员可在此范围内自选）">
                  <a-select v-model:value="form.waitlistDeadlineHours" style="width: 100%">
                    <a-select-option :value="48">开课前 48 小时</a-select-option>
                    <a-select-option :value="24">开课前 24 小时</a-select-option>
                    <a-select-option :value="6">开课前 6 小时</a-select-option>
                    <a-select-option :value="1">开课前 1 小时</a-select-option>
                    <a-select-option :value="0.5">开课前 30 分钟</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="会员候补席位数（优先占用，满后会员进普通席位）">
                  <a-input-number v-model:value="form.memberWaitlistSeats" :min="0" :max="20" style="width: 100%" suffix="席" />
                </a-form-item>
              </a-col>
            </a-row>
          </template>

          <a-form-item label="可用代金券">
            <a-radio-group v-model:value="form.voucherPolicy">
              <a-radio value="ALL">允许使用全部券</a-radio>
              <a-radio value="SOME">指定可用券</a-radio>
              <a-radio value="NONE">不可使用代金券</a-radio>
            </a-radio-group>
          </a-form-item>

          <a-divider>积分奖励</a-divider>
          <a-row :gutter="24">
            <a-col :span="12">
              <a-form-item label="每节完课奖励">
                <a-input-number v-model:value="form.seedsReward" :min="0" style="width: 100%" suffix="积分/人/节" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="提交评价奖励（每人一次）">
                <a-input-number v-model:value="form.reviewSeeds" :min="0" style="width: 100%" suffix="积分/人" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>
        <div style="text-align: right; margin-top: 24px;">
          <a-button style="margin-right: 12px" @click="createStep = 1">上一步</a-button>
          <a-button type="primary" @click="createStep = 3">下一步</a-button>
        </div>
      </a-card>

     <!-- Step 4: 课程大纲与退款规则 -->
      <a-card v-show="createStep === 3" title="课程大纲与规则">
        <a-form layout="vertical" style="max-width: 800px;">
          <a-form-item label="课程目标">
            <a-textarea v-model:value="form.objectives" :rows="3" placeholder="学员完成课程后将获得什么？如：掌握3种呼吸法、能独立进行20分钟冥想…" />
          </a-form-item>
          <a-form-item label="课程大纲（每节内容 - 多节课程每节名称将作为后缀显示）">
            <a-alert message='多节课程将自动生成后缀，如「正念冥想入门 · 第1节：觉察呼吸」，每节学员可不同' type="info" style="margin-bottom: 12px" show-icon />
            <div v-for="(item, index) in form.syllabus" :key="index" style="display: flex; gap: 12px; margin-bottom: 12px; align-items: center;">
              <span style="color: #6B463C; font-weight: 600; min-width: 50px;">第{{ index + 1 }}节</span>
              <a-input v-model:value="item.title" placeholder="节次主题（如：觉察呼吸）" style="width: 200px;" />
              <a-input v-model:value="item.content" placeholder="内容简介" style="flex: 1;" />
              <a-button type="text" danger @click="form.syllabus.splice(index, 1)" :disabled="form.syllabus.length <= 1">删除</a-button>
            </div>
            <a-button type="dashed" block @click="form.syllabus.push({ title: '', content: '' })">+ 添加一节</a-button>
          </a-form-item>
          <a-form-item label="学员须知">
            <a-textarea v-model:value="form.notice" :rows="3" placeholder="如：请穿宽松衣物，课前2小时避免进食，迟到15分钟以上无法进入…" />
          </a-form-item>

          <a-divider>退款规则（可自定义多条）</a-divider>
          <a-alert message="按时间段设置退款比例，从远到近排列" type="info" style="margin-bottom: 12px" show-icon />
          <div v-for="(rule, index) in form.refundRules" :key="index" style="display: flex; gap: 12px; margin-bottom: 12px; align-items: center;">
            <span style="min-width: 80px;">开课前</span>
            <a-input-number v-model:value="rule.hoursFrom" :min="0" style="width: 80px" />
            <span>~</span>
            <a-input-number v-model:value="rule.hoursTo" :min="0" style="width: 80px" />
            <span>小时</span>
            <span style="margin: 0 8px;">→ 退</span>
            <a-input-number v-model:value="rule.refundPercent" :min="0" :max="100" style="width: 80px" />
            <span>%</span>
            <a-button type="text" danger size="small" @click="form.refundRules.splice(index, 1)" :disabled="form.refundRules.length <= 1">删除</a-button>
          </div>
          <a-button type="dashed" size="small" @click="form.refundRules.push({ hoursFrom: 0, hoursTo: 0, refundPercent: 0 })">+ 添加规则</a-button>
        </a-form>
        <div style="text-align: right; margin-top: 24px;">
          <a-button style="margin-right: 12px" @click="createStep = 2">上一步</a-button>
          <a-button type="primary" @click="createStep = 4">下一步</a-button>
        </div>
      </a-card>

      <!-- Step 5: 确认发布 -->
      <a-card v-show="createStep === 4" title="确认发布">
        <a-descriptions bordered :column="2">
          <a-descriptions-item label="课程名称">{{ form.name || '-' }}</a-descriptions-item>
          <a-descriptions-item label="授课导师">{{ trainerName(form.trainerId) || '-' }}</a-descriptions-item>
          <a-descriptions-item label="难度等级">{{ difficultyMap[form.difficulty] || '-' }}</a-descriptions-item>
          <a-descriptions-item label="课程时间">{{ form.duration ? form.duration + '分钟' : '-' }}{{ form.weekdays.length ? ' · 每周' + form.weekdays.join(',') : '' }}</a-descriptions-item>
          <a-descriptions-item label="容量">最少{{ form.minStudents }}人 / 最多{{ form.capacity }}人</a-descriptions-item>
          <a-descriptions-item label="最晚成团时间">{{ form.groupDeadline ? formatDeadline(form.groupDeadline) : '-' }}</a-descriptions-item>
          <a-descriptions-item label="总节数">{{ form.syllabus.filter(s => s.title).length || form.totalSessions }}节</a-descriptions-item>
          <a-descriptions-item label="阶梯定价" :span="2">
            <span v-for="tier in form.priceTiers" :key="tier.from" style="margin-right: 16px;">第{{ tier.from }}-{{ tier.to }}位: ¥{{ tier.price }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="会员折扣" :span="2">年卡 {{ form.yearlyDiscount }}% / 季卡 {{ form.quarterlyDiscount }}% / 月卡 {{ form.monthlyDiscount }}%（百分比收费）</a-descriptions-item>
          <a-descriptions-item label="候补排队" :span="2">{{ form.waitlistEnabled ? `已开启（预付候补），会员候补席位 ${form.memberWaitlistSeats} 个 + 普通候补不限量，可候补至开课前 ${form.waitlistDeadlineHours} 小时` : '未开启' }}</a-descriptions-item>
          <a-descriptions-item label="积分奖励">完课 {{ form.seedsReward || 0 }} 积分/人/节 · 评价 {{ form.reviewSeeds || 0 }} 积分/人</a-descriptions-item>
          <a-descriptions-item label="退款政策">
            <span v-for="(rule, i) in form.refundRules" :key="i" style="display: block; font-size: 12px;">{{ rule.hoursFrom }}~{{ rule.hoursTo }}h前 → 退{{ rule.refundPercent }}%</span>
          </a-descriptions-item>
        </a-descriptions>
        <a-alert style="margin-top: 24px" type="info">
          <template #message>发布后课程将在小程序端展示，学员可立即预约报名，场地日程将自动占位</template>
        </a-alert>
        <div style="text-align: right; margin-top: 24px;">
          <a-button style="margin-right: 12px" @click="createStep = 3">上一步</a-button>
          <a-button style="margin-right: 12px" @click="handleSaveDraft">存为草稿</a-button>
          <a-button type="primary" size="large" @click="handlePublish">确认发布</a-button>
        </div>
      </a-card>
    </template>

    <!-- 课程详情模式 -->
    <template v-if="currentView === 'detail' && currentCourse">
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <a-space>
          <a-button @click="currentView = 'list'">← 返回列表</a-button>
          <h2 class="page-title" style="margin: 0;">{{ currentCourse.name }}</h2>
          <a-tag :color="coursePhaseColor(currentCourse.phase)">{{ currentCourse.phaseLabel || currentCourse.statusLabel }}</a-tag>
          <a-tag v-if="currentCourse.status !== 'PUBLISHED'" color="default">数据状态：{{ currentCourse.statusLabel }}</a-tag>
        </a-space>
        <a-space>
          <a-button v-perm="'course:update'" v-if="['PUBLISHED','DRAFT'].includes(currentCourse.status)" @click="handleEditCourse">编辑课程</a-button>
          <a-button v-perm="'course:update'" v-if="currentCourse.status === 'PUBLISHED' && canAdjustEnrollment(currentCourse)" @click="openEnrollWindow(currentCourse)">调整报名截止</a-button>
          <a-button v-perm="'course:update'" v-if="currentCourse.status === 'PUBLISHED'" @click="handleComplete(currentCourse)">标记为已结束</a-button>
          <a-button v-perm="'course:update'" v-if="currentCourse.status === 'PUBLISHED'" type="primary" danger ghost @click="handleUnpublishCurrent">下架</a-button>
        </a-space>
      </div>

      <a-alert v-if="currentCourse.status === 'PUBLISHED'" type="info" show-icon style="margin-bottom: 16px"
        message="展示状态按当前时间自动推导，无需手工切换：报名未开始 / 报名中 / 报名截止 / 进行中 / 已结束。已结束课程不再进入小程序发现列表，但历史预约仍可查看。课程开始后把报名截止改到未来，即展示为「补报名中」。" />

      <a-tabs v-model:activeKey="detailTab">
        <a-tab-pane key="info" tab="基本信息">
          <a-row :gutter="24">
            <a-col :span="16">
              <a-card title="课程信息">
                <a-descriptions :column="2" bordered size="small">
                  <a-descriptions-item label="课程名称">{{ currentCourse.name }}</a-descriptions-item>
                  <a-descriptions-item label="课程类型">{{ currentCourse.typeLabel }}</a-descriptions-item>
                  <a-descriptions-item label="授课导师">{{ currentCourse.trainer }}</a-descriptions-item>
                  <a-descriptions-item label="上课场地">{{ currentCourse.venue }}</a-descriptions-item>
                  <a-descriptions-item label="排课时间">{{ currentCourse.schedule }}</a-descriptions-item>
                  <a-descriptions-item label="课程时长">{{ currentCourse.durationLabel || '90分钟' }}</a-descriptions-item>
                  <a-descriptions-item label="展示状态">{{ currentCourse.phaseLabel || '-' }}</a-descriptions-item>
                  <a-descriptions-item label="数据状态">{{ currentCourse.statusLabel }}</a-descriptions-item>
                  <a-descriptions-item label="报名截止">{{ formatLifecycleTime(currentCourse.enrollDeadline) }}</a-descriptions-item>
                  <a-descriptions-item label="课程结束">{{ formatLifecycleTime(currentCourse.endAt) }}</a-descriptions-item>
                  <a-descriptions-item label="课程价格">¥{{ currentCourse.price }}</a-descriptions-item>
                  <a-descriptions-item label="容量">{{ currentCourse.capacity }}人</a-descriptions-item>
                  <a-descriptions-item label="难度" :span="2">{{ currentCourse.difficultyLabel || '入门' }}</a-descriptions-item>
                  <a-descriptions-item label="课程简介" :span="2">{{ currentCourse.desc || '引导学员通过呼吸觉察、身体扫描等正念练习，回归当下平静。' }}</a-descriptions-item>
                </a-descriptions>
              </a-card>
            </a-col>
            <a-col :span="8">
              <a-card title="课程数据">
                <a-statistic title="报名人数" :value="currentCourse.enrolled" :suffix="'/ ' + currentCourse.capacity" style="margin-bottom: 16px;" />
                <a-progress :percent="Math.round(currentCourse.enrolled / currentCourse.capacity * 100)" :stroke-color="'#6B463C'" />
                <a-divider />
                <a-statistic title="总收入" :value="currentCourse.enrolled * currentCourse.price" prefix="¥" style="margin-bottom: 12px;" />
                <a-statistic title="平均评分" :value="avgRating" :precision="1" suffix="/ 5" />
              </a-card>
            </a-col>
          </a-row>
        </a-tab-pane>

        <a-tab-pane key="students" tab="学员列表">
          <a-card>
            <a-table :columns="studentColumns" :data-source="courseStudentData" :loading="studentsLoading" size="small">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'name'">
                  <a-space>
                    <a-avatar size="small" :style="{ backgroundColor: '#6B463C' }">{{ record.name.charAt(0) }}</a-avatar>
                    <span>{{ record.name }}</span>
                  </a-space>
                </template>
                <template v-if="column.dataIndex === 'checkedIn'">
                  <a-tag :color="record.checkedIn ? 'green' : 'default'">{{ record.checkedIn ? '已签到' : '未签到' }}</a-tag>
                </template>
              </template>
            </a-table>
          </a-card>
        </a-tab-pane>

        <a-tab-pane key="waitlist" tab="候补队列">
          <a-card>
            <a-alert style="margin-bottom: 16px" type="info" show-icon
              message="候补即预付：支付成功才进入队列排队；递补顺序「会员候补席位优先 → 普通候补席位」，轮到直接上课；未轮上或主动退出全额退款，未支付超时自动取消。" />
            <a-space style="margin-bottom: 12px">
              <a-tag color="#6B463C">会员候补席位：{{ waitlistData.filter(w => w.seatType === 'MEMBER' && ['PENDING_PAYMENT','WAITING'].includes(w.status)).length }}/{{ currentCourse?.raw?.memberWaitlistSeats || 3 }}</a-tag>
              <a-tag color="#8B6354">普通候补席位：不限量</a-tag>
            </a-space>
            <a-table :columns="waitlistColumns" :data-source="waitlistData" :loading="waitlistLoading" size="small" :pagination="false">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'position'">
                  <a-tag color="#6B463C">第 {{ record.position }} 位</a-tag>
                </template>
                <template v-if="column.dataIndex === 'seatType'">
                  <a-tag :color="record.seatType === 'MEMBER' ? 'gold' : 'default'">{{ record.seatType === 'MEMBER' ? '会员席位' : '普通席位' }}</a-tag>
                </template>
                <template v-if="column.dataIndex === 'status'">
                  <a-tag :color="waitlistStatusColor(record.status)">{{ waitlistStatusLabel(record.status) || record.status }}</a-tag>
                </template>
                <template v-if="column.dataIndex === 'action'">
                  <a-space>
                    <a-button v-perm="'waitlist:manage'" type="link" size="small" :disabled="record.status !== 'WAITING'" @click="promoteWaitlist(record)">手动递补</a-button>
                    <a-button v-perm="'waitlist:manage'" type="link" size="small" danger :disabled="!['PENDING_PAYMENT','WAITING'].includes(record.status)" @click="cancelWaitlist(record)">退出退款</a-button>
                  </a-space>
                </template>
              </template>
            </a-table>
          </a-card>
        </a-tab-pane>

        <a-tab-pane key="reviews" tab="课程评价">
          <a-card>
            <div v-for="review in courseReviews" :key="review.id" style="border-bottom: 1px solid #f0ebe5; padding: 16px 0;">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <a-avatar size="small" :style="{ backgroundColor: '#6B463C' }">{{ review.name.charAt(0) }}</a-avatar>
                <span style="font-weight: 500;">{{ review.name }}</span>
                <a-rate :value="review.rating" disabled :style="{ fontSize: '14px' }" />
                <span style="color: #999; font-size: 12px; margin-left: auto;">{{ review.date }}</span>
              </div>
              <p style="color: #4B3621; margin: 0;">{{ review.content }}</p>
            </div>
          </a-card>
        </a-tab-pane>
      </a-tabs>
    </template>

    <!-- 调整报名截止 / 开放补报名 -->
    <a-modal
      v-model:open="enrollModalVisible"
      title="调整报名截止"
      :confirm-loading="enrollSubmitting"
      ok-text="保存"
      cancel-text="取消"
      @ok="submitEnrollWindow"
    >
      <a-form layout="vertical">
        <a-form-item label="截止方式">
          <a-radio-group v-model:value="enrollMode">
            <a-radio value="default">恢复默认：开课时刻截止</a-radio>
            <a-radio value="custom">指定未来截止时间（可开放补报名）</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="enrollMode === 'custom'" label="报名截止时间">
          <a-date-picker
            v-model:value="enrollEndAt"
            show-time
            format="YYYY-MM-DD HH:mm"
            style="width: 100%"
            placeholder="须晚于当前且不晚于课程结束时间"
          />
        </a-form-item>
      </a-form>
      <a-alert type="info" show-icon
        message="课程开始后仍开放报名，即视为「补报名中」，小程序会明确提示；截止后恢复为报名截止/进行中。" />
      <p style="margin: 12px 0 0; color: #999;">当前课程结束时间：{{ formatLifecycleTime(currentCourse?.endAt) }}</p>
    </a-modal>

    <!-- 封面裁剪弹窗 -->
    <ImageCropper v-model:open="cropperVisible" @cropped="onCoverCropped" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import dayjs from 'dayjs'
import ImageCropper from '@/components/ImageCropper.vue'
import { adminListCourses, getCourse, createCourse, updateCourse, setCourseStatus, deleteCourse, savePriceTiers, saveMemberDiscounts, setEnrollmentWindow } from '@/api/course'
import { listCourseWaitlist, promoteWaitlistEntry, cancelWaitlistEntry } from '@/api/waitlist'
import { listTrainerOptions } from '@/api/trainer'
import { listVenues } from '@/api/venue'
import { courseReviews as fetchCourseReviews } from '@/api/review'
import { courseRoster } from '@/api/checkin'
import { useDictStore } from '@/stores/dict'
import {
  coursePhaseColor,
  coursePhaseLabel,
  courseStatusLabel,
  memberCardTypeLabel,
  waitlistStatusColor,
  waitlistStatusLabel,
} from '@fullyu/shared'

const currentView = ref<'list' | 'create' | 'detail'>('list')
const loading = ref(false)
const submitting = ref(false)
const trainerOptions = ref<any[]>([])
const venueOptions = ref<any[]>([])
const createStep = ref(0)
const detailTab = ref('info')
const searchText = ref('')
const filterType = ref('')
const filterStatus = ref('')
const filterPhase = ref('')
/** 报名截止调整弹窗 */
const enrollModalVisible = ref(false)
const enrollSubmitting = ref(false)
const enrollMode = ref<'default' | 'custom'>('custom')
const enrollEndAt = ref<any>(null)
const enrollTargetId = ref('')
/** 日期快捷预设：today|near(前一天~后三天)|week|all，默认 near */
const datePreset = ref<'today' | 'near' | 'week' | 'all' | ''>('near')
/** 开课日期范围 [起, 止]（dayjs），默认前一天到后三天 */
function presetToRange(preset: string): any {
  const now = dayjs()
  if (preset === 'today') return [now.startOf('day'), now.endOf('day')]
  if (preset === 'near') return [now.subtract(1, 'day').startOf('day'), now.add(3, 'day').endOf('day')]
  if (preset === 'week') {
    const dow = now.day() || 7
    const monday = now.subtract(dow - 1, 'day').startOf('day')
    return [monday, monday.add(6, 'day').endOf('day')]
  }
  return null
}
const dateRange = ref<any>(presetToRange('near'))
const currentCourse = ref<any>(null)
/** 编辑中的课程 ID（null=新建） */
const editingId = ref<string | null>(null)

const dictStore = useDictStore()
/** 课程时长选项（单次/多次共用 course_duration 值集） */
const durationOptions = computed(() => dictStore.getItems('course_duration'))

const difficultyMap: Record<string, string> = { BEGINNER: '入门', INTERMEDIATE: '进阶', ADVANCED: '高级' }

const coverColors = [
  'linear-gradient(135deg, #6B463C, #8B6354)',
  'linear-gradient(135deg, #4A6741, #6B8F62)',
  'linear-gradient(135deg, #5C4B8A, #8B73B8)',
  'linear-gradient(135deg, #8B5E3C, #C4956A)',
  'linear-gradient(135deg, #3D5A6E, #5A8A9E)',
]

function createDefaultForm() {
  return {
  name: '', type: '', description: '', detailDesc: '', difficulty: '', targetAudience: [] as string[],
  tags: [] as string[], trainerId: '', assistantId: '', coverType: 'upload', coverColor: coverColors[0], coverImage: '',
  gallery: [] as string[],
  scheduleType: 'RECURRING', weekdays: [] as string[], startTime: null as any, duration: 90, totalSessions: 12,
  startDate: null as any, endDate: null as any, venueId: '', materials: [] as string[],
  capacity: 8, minStudents: 3, groupDeadline: null as any,
  priceTiers: [{ from: 1, to: 2, price: 300 }, { from: 3, to: 4, price: 330 }, { from: 5, to: 8, price: 360 }],
  yearlyDiscount: 70, quarterlyDiscount: 85, monthlyDiscount: 95,
  waitlistEnabled: true, waitlistDeadlineHours: 24, memberWaitlistSeats: 3,
  voucherPolicy: 'ALL', seedsReward: 10, reviewSeeds: 5,
  objectives: '', syllabus: [{ title: '', content: '' }, { title: '', content: '' }, { title: '', content: '' }],
  notice: '',
  refundRules: [
    { hoursFrom: 48, hoursTo: 9999, refundPercent: 100 },
    { hoursFrom: 24, hoursTo: 48, refundPercent: 80 },
    { hoursFrom: 2, hoursTo: 24, refundPercent: 50 },
    { hoursFrom: 0, hoursTo: 2, refundPercent: 0 },
  ],
  }
}

const form = ref(createDefaultForm())

const courses = ref<any[]>([])

/** 课程展示状态统一取自共享生命周期口径 */

/** 已结束课程不能再改报名窗口，只能复制新排期 */
function canAdjustEnrollment(course: any) {
  if (!course || course.status !== 'PUBLISHED') return false
  return !['ENDED', 'COMPLETED', 'EXPIRED'].includes(String(course.phase || '').toUpperCase())
}

function formatLifecycleTime(value: any) {
  if (!value) return '—'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : '—'
}

function trainerName(id: string) {
  return trainerOptions.value.find(t => t.id === id)?.displayName || ''
}

/** 后端课程字段 → 页面展示字段映射 */
function mapCourse(c: any) {
  const dateStr = c.startDate ? String(c.startDate).slice(0, 10) : ''
  const phase = String(c.phase || '').toUpperCase()
  return {
    id: c.id,
    name: c.title,
    type: c.type || '',
    typeLabel: (c.categories && c.categories[0]?.name) || '课程',
    trainer: c.trainer?.displayName || '—',
    trainerId: c.trainerId,
    schedule: [dateStr, [c.startTime, c.endTime].filter(Boolean).join('-')].filter(Boolean).join(' '),
    venue: c.venue?.name || '—',
    price: (c.originalPrice ?? 0) / 100,
    capacity: c.maxCapacity ?? 0,
    enrolled: c.currentEnrolled ?? 0,
    status: c.status,
    statusLabel: courseStatusLabel(c.status) || c.status,
    phase,
    phaseLabel: coursePhaseLabel(phase) || courseStatusLabel(c.status) || c.status,
    bookable: c.bookable === true,
    enrollDeadline: c.enrollDeadline || c.enrollEndAt || c.startAt || null,
    startAt: c.startAt || null,
    endAt: c.endAt || null,
    coverImage: c.coverImage || '',
    gallery: Array.isArray(c.gallery) ? c.gallery : [],
    coverColor: coverColors[0],
    desc: c.description || '',
    raw: c,
  }
}

async function loadCourses() {
  loading.value = true
  try {
    const range = Array.isArray(dateRange.value) ? dateRange.value : null
    const startDateFrom = range && range[0] ? range[0].startOf('day').toISOString() : undefined
    const startDateTo = range && range[1] ? range[1].endOf('day').toISOString() : undefined
    const data: any = await adminListCourses({
      page: 1,
      pageSize: 100,
      keyword: searchText.value || undefined,
      status: filterStatus.value || undefined,
      phase: filterPhase.value || undefined,
      startDateFrom,
      startDateTo,
    })
    const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
    courses.value = items.map(mapCourse)
  } catch (e: any) {
    message.error(e?.message || '加载课程列表失败')
  } finally {
    loading.value = false
  }
}

/** 切换日期快捷预设：同步日期范围并重新拉取 */
function onDatePresetChange() {
  dateRange.value = presetToRange(datePreset.value)
  loadCourses()
}

/** 手动选择日期范围：清除预设高亮并重新拉取 */
function onDateRangeChange() {
  datePreset.value = ''
  loadCourses()
}

/** 搜索框清空时自动刷新（避免逐字请求，非空时依赖回车/搜索按钮触发） */
function onSearchChange(e: any) {
  if (!e?.target?.value) loadCourses()
}

async function loadOptions() {
  try {
    const [ts, vs]: any = await Promise.all([listTrainerOptions(), listVenues()])
    trainerOptions.value = Array.isArray(ts) ? ts : []
    venueOptions.value = Array.isArray(vs) ? vs : []
  } catch (e: any) {
    message.error(e?.message || '加载导师/场地失败')
  }
}

onMounted(() => {
  loadCourses()
  loadOptions()
  dictStore.load()
})

const filteredCourses = computed(() => {
  return courses.value.filter(c => {
    if (searchText.value && !c.name.includes(searchText.value)) return false
    if (filterType.value && c.type !== filterType.value) return false
    if (filterStatus.value && c.status !== filterStatus.value) return false
    if (filterPhase.value && c.phase !== filterPhase.value) return false
    return true
  })
})

// 课程详情数据
const studentColumns = [
  { title: '学员', dataIndex: 'name', width: 150 },
  { title: '手机号', dataIndex: 'phone', width: 140 },
  { title: '报名日期', dataIndex: 'enrollDate', width: 120 },
  { title: '会员卡', dataIndex: 'card', width: 100 },
  { title: '签到状态', dataIndex: 'checkedIn', width: 110 },
]
const courseStudentData = ref<any[]>([])
const studentsLoading = ref(false)

async function loadStudents(courseId: string) {
  studentsLoading.value = true
  try {
    const rows: any = await courseRoster(courseId)
    courseStudentData.value = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      name: r.user?.nickname || '匿名用户',
      phone: r.user?.phone || '-',
      enrollDate: r.enrolledAt ? dayjs(r.enrolledAt).format('YYYY-MM-DD') : '-',
      card: memberCardTypeLabel(r.cardType) || '-',
      checkedIn: !!r.checkedIn,
    }))
  } catch (e: any) {
    message.error(e?.message || '加载学员列表失败')
  } finally {
    studentsLoading.value = false
  }
}

const courseReviews = ref([
  { id: '1', name: '张敏', rating: 5, date: '2025-06-22', content: '王老师的引导非常温柔，第一次体验正念冥想就感受到内心的平静。课后整个人状态都好了很多！' },
  { id: '2', name: '赵雪', rating: 5, date: '2025-06-19', content: '连续参加了3次冥想课，明显感觉自己的焦虑减少了。王老师总能准确地感受到我的状态。' },
  { id: '3', name: '李悦', rating: 4, date: '2025-06-18', content: '整体体验很好，场地很安静。如果能有冥想引导音频带回家练习就更好了。' },
  { id: '4', name: '陈思涵', rating: 5, date: '2025-06-15', content: '第一次冥想就睡着了，说明真的很放松。老师说这是正常的，慢慢就能保持清醒觉察了。' },
])

function viewCourseDetail(course: any) {
  currentCourse.value = course
  currentView.value = 'detail'
  detailTab.value = 'info'
  loadCourseReviews(course.id)
  loadWaitlist(course.id)
  loadStudents(course.id)
}

/** 卡片「管理」菜单：统一收口课程生命周期操作 */
function handleCourseMenuClick(info: any, course: any) {
  handleCourseAction(String(info?.key || ''), course)
}

function handleCourseAction(key: string, course: any) {
  if (key === 'adjust') return openEnrollWindow(course)
  if (key === 'complete') return handleComplete(course)
  if (key === 'unpublish') return handleUnpublish(course)
  if (key === 'delete') return handleDelete(course)
  if (key === 'view') return viewCourseDetail(course)
}

/** 打开报名截止调整：默认填入现有截止或课程结束时刻 */
function openEnrollWindow(course: any) {
  if (!course?.id) return
  enrollTargetId.value = course.id
  enrollMode.value = 'custom'
  const raw = course.raw || {}
  const suggested = course.enrollDeadline ? dayjs(course.enrollDeadline) : dayjs(course.endAt || raw.endAt || raw.startAt || raw.startDate)
  const fallback = dayjs().add(1, 'hour')
  enrollEndAt.value = suggested.isValid() && suggested.isAfter(dayjs()) ? suggested : fallback
  enrollModalVisible.value = true
}

async function submitEnrollWindow() {
  if (!enrollTargetId.value) return
  let iso: string | null = null
  if (enrollMode.value === 'custom') {
    if (!enrollEndAt.value || !dayjs(enrollEndAt.value).isValid()) {
      message.warning('请选择报名截止时间')
      return
    }
    if (!dayjs(enrollEndAt.value).isAfter(dayjs())) {
      message.warning('报名截止时间须晚于当前时间')
      return
    }
    iso = dayjs(enrollEndAt.value).toISOString()
  }
  enrollSubmitting.value = true
  try {
    await setEnrollmentWindow(enrollTargetId.value, iso)
    message.success(iso ? '报名截止已更新，展示状态会按时间自动切换' : '已恢复默认截止（开课时刻）')
    enrollModalVisible.value = false
    const id = enrollTargetId.value
    await loadCourses()
    await refreshCurrentCourse(id)
  } catch (e: any) {
    message.error(e?.message || '调整报名截止失败')
  } finally {
    enrollSubmitting.value = false
  }
}

/** 手动归档历史课程：停止报名并退出小程序发现列表，保留订单与退款历史 */
function handleComplete(course: any) {
  if (!course || course.status !== 'PUBLISHED') return
  Modal.confirm({
    title: '确认将该课程标记为已结束？',
    content: `「${course.name}」将立即停止报名并从小程序发现列表移除，订单、签到与退款历史仍保留。该操作不可撤销。`,
    okText: '确认结束',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await setCourseStatus(course.id, 'COMPLETED')
        message.success('课程已结束归档')
        await loadCourses()
        await refreshCurrentCourse(course.id)
      } catch (e: any) {
        message.error(e?.message || '结束课程失败')
      }
    },
  })
}

/** 操作后同步详情页展示数据 */
async function refreshCurrentCourse(id: string) {
  if (currentCourse.value?.id !== id) return
  try {
    const data: any = await getCourse(id)
    if (data?.id) currentCourse.value = mapCourse(data)
  } catch {
    // 详情刷新失败不覆盖已有页面，列表已刷新。
  }
}

/** 本周开课数（基于当前筛选结果，startDate 落在本周一~周日的课程数） */
const weekCourseCount = computed(() => {
  const now = new Date()
  const day = now.getDay() || 7
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(now.getDate() - day + 1)
  const nextMonday = new Date(monday)
  nextMonday.setDate(monday.getDate() + 7)
  return filteredCourses.value.filter((c) => {
    const raw = c.raw || {}
    const d = raw.startDate ? new Date(raw.startDate) : null
    return d && d >= monday && d < nextMonday
  }).length
})

/** 平均满员率（基于当前筛选结果，仅统计有容量的课程，报名/容量取平均，封顶100%） */
const avgFillRate = computed(() => {
  const valid = filteredCourses.value.filter((c) => Number(c.capacity) > 0)
  if (!valid.length) return 0
  const sum = valid.reduce((s, c) => s + Math.min(Number(c.enrolled) / Number(c.capacity), 1), 0)
  return Math.round((sum / valid.length) * 100)
})

/** 当前课程平均评分（基于已加载的真实评价） */
const avgRating = computed(() => {
  const list = courseReviews.value
  if (!list.length) return 0
  const sum = list.reduce((s, r) => s + Number(r.rating || 0), 0)
  return sum / list.length
})

async function loadCourseReviews(courseId: string) {
  try {
    const data: any = await fetchCourseReviews(courseId)
    const list = Array.isArray(data) ? data : []
    courseReviews.value = list.map((r: any) => ({
      id: r.id,
      name: r.user?.nickname || '匿名学员',
      rating: r.rating,
      date: r.createdAt ? String(r.createdAt).slice(0, 10) : '',
      content: r.content,
    }))
  } catch {
    courseReviews.value = []
  }
}

function buildCoursePayload(status: string) {
  const start = form.value.startTime
  const startTimeStr = start && typeof start.format === 'function' ? start.format('HH:mm') : undefined
  const endTimeStr = start && typeof start.format === 'function' && form.value.duration
    ? start.add(form.value.duration, 'minute').format('HH:mm')
    : undefined
  const basePrice = Math.max(0, ...form.value.priceTiers.map(t => t.price || 0))
  const gd = form.value.groupDeadline
  return {
    title: form.value.name,
    type: form.value.type || 'SINGLE',
    description: form.value.description,
    detailDesc: form.value.detailDesc || undefined,
    learningGoals: form.value.objectives || undefined,
    categories: form.value.tags,
    targetAudience: form.value.targetAudience,
    difficulty: form.value.difficulty || undefined,
    coverType: form.value.coverType,
    coverColor: form.value.coverColor,
    coverImage: form.value.coverImage || undefined,
    gallery: form.value.gallery,
    trainerId: form.value.trainerId || undefined,
    assistantId: form.value.assistantId || undefined,
    venueId: form.value.venueId || undefined,
    scheduleType: form.value.scheduleType,
    weekdays: form.value.weekdays.map(d => Number(d)),
    startDate: form.value.startDate && typeof form.value.startDate.format === 'function' ? form.value.startDate.format('YYYY-MM-DD') : undefined,
    endDate: form.value.endDate && typeof form.value.endDate.format === 'function' ? form.value.endDate.format('YYYY-MM-DD') : undefined,
    startTime: startTimeStr,
    endTime: endTimeStr,
    duration: form.value.duration ?? undefined,
    totalSessions: form.value.totalSessions ?? undefined,
    groupDeadline: gd && typeof gd.format === 'function' ? gd.format('YYYY-MM-DD HH:mm:ss') : (gd || undefined),
    materials: Array.isArray(form.value.materials) ? form.value.materials : [],
    minCapacity: form.value.minStudents,
    maxCapacity: form.value.capacity,
    originalPrice: Math.round(basePrice * 100),
    waitlistEnabled: form.value.waitlistEnabled,
    waitlistDeadlineHours: form.value.waitlistDeadlineHours,
    memberWaitlistSeats: form.value.memberWaitlistSeats,
    voucherPolicy: form.value.voucherPolicy,
    seedsReward: form.value.seedsReward ?? undefined,
    reviewSeeds: form.value.reviewSeeds ?? undefined,
    syllabus: Array.isArray(form.value.syllabus) ? form.value.syllabus.filter(s => s.title || s.content) : [],
    notice: form.value.notice || undefined,
    refundRules: form.value.refundRules,
    status,
  }
}

/** 进入新建：重置表单并清除编辑态 */
function openCreate() {
  form.value = createDefaultForm()
  editingId.value = null
  currentCourse.value = null
  createStep.value = 0
  currentView.value = 'create'
}

/** 保存阶梯价与会员折扣（新建/编辑共用） */
async function persistTiersAndDiscounts(id: string) {
  if (!id) return
  const tiers = form.value.priceTiers.map(t => ({ seatFrom: t.from, seatTo: t.to, price: Math.round((t.price || 0) * 100) }))
  const discounts = [
    { cardType: 'YEARLY', discountPercent: form.value.yearlyDiscount },
    { cardType: 'QUARTERLY', discountPercent: form.value.quarterlyDiscount },
    { cardType: 'MONTHLY', discountPercent: form.value.monthlyDiscount },
  ]
  await savePriceTiers(id, tiers)
  await saveMemberDiscounts(id, discounts)
}

async function submitCourse(target: 'DRAFT' | 'PUBLISHED') {
  if (!form.value.name) { message.warning('请填写课程名称'); return }
  if (!form.value.trainerId) { message.warning('请选择授课导师'); return }
  if (!form.value.venueId) { message.warning('请选择上课场地'); return }
  submitting.value = true
  try {
    // 无论发布还是存草稿，都先全量保存字段：新建走 createCourse，编辑走 updateCourse
    const payload: any = buildCoursePayload('DRAFT')
    let id = editingId.value
    if (id) {
      // 编辑不通过表单改动课程状态，状态仅由状态机（发布/下架）流转
      delete payload.status
      await updateCourse(id, payload)
    } else {
      const created: any = await createCourse(payload)
      id = created?.id || null
      editingId.value = id
    }
    if (id) await persistTiersAndDiscounts(id)
    // 发布：保存完成后再经状态机置为 PUBLISHED（触发场地可用性/冲突校验与占用登记）
    if (target === 'PUBLISHED' && id) {
      await setCourseStatus(id, 'PUBLISHED')
    }
    message.success(target === 'DRAFT' ? '已保存为草稿' : '课程发布成功')
    currentView.value = 'list'
    createStep.value = 0
    editingId.value = null
    loadCourses()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

function handleSaveDraft() {
  submitCourse('DRAFT')
}

function handlePublish() {
  submitCourse('PUBLISHED')
}

function addPriceTier() {
  const last = form.value.priceTiers[form.value.priceTiers.length - 1]
  form.value.priceTiers.push({ from: last.to + 1, to: last.to + 2, price: last.price + 30 })
}

// ===== 封面裁剪 =====
const cropperVisible = ref(false)
function onCoverCropped(dataUrl: string) {
  form.value.coverImage = dataUrl
  message.success('封面已裁剪')
}

// ===== 详情图集管理（用户自定义上传）=====
const galleryInputRef = ref<HTMLInputElement | null>(null)

function addGalleryImage() {
  galleryInputRef.value?.click()
}

function onGalleryFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  if (!files.length) return
  let pending = files.length
  let added = 0
  files.forEach(file => {
    if (!file.type.startsWith('image/')) { pending--; return }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      if (url && !form.value.gallery.includes(url)) { form.value.gallery.push(url); added++ }
      pending--
      if (pending === 0 && added > 0) message.success(`已添加 ${added} 张图片`)
    }
    reader.onerror = () => { pending-- }
    reader.readAsDataURL(file)
  })
  // 重置以允许再次选择相同文件
  input.value = ''
}

function removeGalleryImage(idx: number) {
  form.value.gallery.splice(idx, 1)
}

// ===== 复制课程（直接落库） =====
async function handleCopy(course: any) {
  try {
    // 1. 拉取源课程完整数据
    const c: any = await getCourse(course.id)
    if (!c) { message.error('源课程不存在'); return }
    // 2. 组装副本数据：日期置空，标题加后缀，状态为草稿
    const payload: any = {
      title: (c.title || '') + '（副本）',
      coverImage: c.coverImage || '',
      type: c.type,
      categories: c.categories || [],
      description: c.description || '',
      targetAudience: c.targetAudience || [],
      learningGoals: c.learningGoals || '',
      startDate: null,
      endDate: null,
      startTime: c.startTime || '',
      endTime: c.endTime || '',
      trainerId: c.trainerId,
      venueId: c.venueId,
      minCapacity: c.minCapacity,
      maxCapacity: c.maxCapacity,
      originalPrice: c.originalPrice,
      gallery: c.gallery || [],
      scheduleType: c.scheduleType,
      weekdays: c.weekdays || [],
      status: 'DRAFT',
      waitlistEnabled: c.waitlistEnabled,
      waitlistDeadlineHours: c.waitlistDeadlineHours,
      memberWaitlistSeats: c.memberWaitlistSeats,
      detailDesc: c.detailDesc || '',
      difficulty: c.difficulty || '',
      assistantId: c.assistantId || '',
      coverType: c.coverType || '',
      coverColor: c.coverColor || '',
      duration: c.duration,
      totalSessions: c.totalSessions,
      materials: c.materials || [],
      groupDeadline: null,
      voucherPolicy: c.voucherPolicy || 'ALL',
      seedsReward: c.seedsReward,
      reviewSeeds: c.reviewSeeds,
      syllabus: c.syllabus || [],
      notice: c.notice || '',
      refundRules: c.refundRules || [],
      internalNote: c.internalNote || '',
      trainerSeeds: c.trainerSeeds,
      allowDeduction: c.allowDeduction,
    }
    // 3. 创建副本课程
    const created: any = await createCourse(payload)
    // 4. 复制阶梯价和会员折扣
    if (created?.id) {
      if (Array.isArray(c.priceTiers) && c.priceTiers.length) {
        await savePriceTiers(created.id, c.priceTiers.map((t: any) => ({ seatFrom: t.seatFrom, seatTo: t.seatTo, price: t.price })))
      }
      if (Array.isArray(c.memberDiscounts) && c.memberDiscounts.length) {
        await saveMemberDiscounts(created.id, c.memberDiscounts.map((d: any) => ({ cardType: d.cardType, discountPercent: d.discountPercent })))
      }
    }
    message.success('课程已复制为草稿，请设置日期后发布')
    loadCourses()
  } catch (e: any) {
    message.error(e?.message || '复制失败')
  }
}

// ===== 时间格式化 =====
function formatDeadline(d: any) {
  if (!d) return '-'
  if (typeof d === 'string') return d
  // dayjs 对象
  if (d && typeof d.format === 'function') return d.format('YYYY-MM-DD HH:mm')
  return String(d)
}

// ===== 候补队列 =====
const waitlistColumns = [
  { title: '排队', dataIndex: 'position', width: 80 },
  { title: '席位', dataIndex: 'seatType', width: 90 },
  { title: '学员', dataIndex: 'name', width: 100 },
  { title: '手机号', dataIndex: 'phone', width: 130 },
  { title: '下单时间', dataIndex: 'joinTime', width: 150 },
  { title: '候补至', dataIndex: 'deadline', width: 120 },
  { title: '锁定金额', dataIndex: 'paid', width: 100 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '操作', dataIndex: 'action', width: 180 },
]
const waitlistData = ref<any[]>([])
const waitlistLoading = ref(false)

async function loadWaitlist(courseId: string) {
  waitlistLoading.value = true
  try {
    const rows: any = await listCourseWaitlist(courseId)
    const dh = currentCourse.value?.raw?.waitlistDeadlineHours ?? 24
    waitlistData.value = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      id: r.id,
      position: r.position,
      seatType: r.seatType,
      name: r.name,
      phone: r.phone,
      joinTime: r.createdAt ? String(r.createdAt).replace('T', ' ').slice(0, 16) : '',
      deadline: `开课前 ${dh}h`,
      paid: `¥${(Number(r.lockedPrice || 0) / 100).toFixed(2)}`,
      status: r.status,
    }))
  } catch (e: any) {
    message.error(e?.message || '加载候补名单失败')
  } finally {
    waitlistLoading.value = false
  }
}

/** 手动递补（二次确认；超额时红色警示，仍允许执行） */
function promoteWaitlist(record: any) {
  const cap = Number(currentCourse.value?.capacity || 0)
  const enrolled = Number(currentCourse.value?.enrolled || 0)
  const over = cap > 0 && enrolled >= cap
  Modal.confirm({
    title: '确认手动递补该学员？',
    content: over
      ? `⚠ 当前报名 ${enrolled}/${cap} 已满，递补将【超出最大开课人数】。${record.name} 仍会成功上课并计为订单成功。确认继续？`
      : `将 ${record.name} 递补为正式报名，并发送递补成功通知。确认继续？`,
    okText: over ? '已超员，确认递补' : '确认递补',
    okType: over ? 'danger' : 'primary',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await promoteWaitlistEntry(record.id)
        message.success(res?.overCapacity ? `${record.name} 已超额递补上课，已发送通知` : `${record.name} 已递补上课，已发送通知`)
        await loadWaitlist(currentCourse.value.id)
        if (currentCourse.value) currentCourse.value.enrolled = Number(currentCourse.value.enrolled || 0) + 1
      } catch (e) {
        // 错误已由拦截器统一提示
      }
    },
  })
}

/** 退出退款（二次确认；已支付则全额退回微信） */
function cancelWaitlist(record: any) {
  const paid = record.status === 'WAITING'
  Modal.confirm({
    title: paid ? '确认为该学员退出并全额退款？' : '确认取消该候补？',
    content: paid
      ? `${record.name} 的锁定金额将【原路全额退回微信】，操作不可撤销。确认继续？`
      : `${record.name} 尚未支付，将取消其候补资格。确认继续？`,
    okText: '确认',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await cancelWaitlistEntry(record.id, paid ? '管理员操作候补退出，全额退款' : '管理员取消候补')
        message.success(paid ? `${record.name} 已退出候补，锁定金额已全额退款` : `${record.name} 候补已取消`)
        await loadWaitlist(currentCourse.value.id)
      } catch (e) {
        // 错误已由拦截器统一提示
      }
    },
  })
}

// ===== 删除草稿课程 =====
async function handleDelete(course: any) {
  if (course.status !== 'DRAFT') {
    message.warning('仅草稿状态的课程可删除')
    return
  }
  Modal.confirm({
    title: '确认删除该草稿课程？',
    content: `将永久删除课程「${course.name}」及其阶梯价/会员折扣配置，操作不可撤销。仅当无人报名/候补时可删除。确认继续？`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await deleteCourse(course.id)
        message.success(`课程「${course.name}」已删除`)
        loadCourses()
      } catch (e: any) {
        message.error(e?.message || '删除失败')
      }
    },
  })
}

// ===== 下架课程 =====
async function handleUnpublish(course: any) {
  if (course.status === 'CANCELLED') {
    message.warning('该课程已下架')
    return
  }
  try {
    await setCourseStatus(course.id, 'CANCELLED')
    message.success(`课程「${course.name}」已下架，小程序端将不再展示`)
    loadCourses()
  } catch (e: any) {
    message.error(e?.message || '下架失败')
  }
}

async function handleUnpublishCurrent() {
  if (!currentCourse.value) return
  await handleUnpublish(currentCourse.value)
  currentView.value = 'list'
}

// ===== 编辑课程 =====
/** 把 'HH:mm' 字符串解析为 dayjs（不依赖 customParseFormat 插件） */
function parseTimeToDayjs(v: string) {
  if (!v || !/^\d{1,2}:\d{2}/.test(v)) return null
  const [hh, mm] = v.split(':').map(Number)
  return dayjs().hour(hh).minute(mm).second(0).millisecond(0)
}

/** 排期方式：数据库枚举 → 前端 radio 值 */
function scheduleTypeToForm(v: string): string {
  if (v === 'WEEKLY') return 'RECURRING'
  if (v === 'ONE_TIME') return 'SINGLE'
  if (v === 'APPOINTMENT') return 'APPOINTMENT'
  return 'RECURRING'
}

async function handleEditCourse() {
  if (!currentCourse.value) return
  const id = currentCourse.value.id
  if (!id) return
  try {
    const c: any = await getCourse(id)
    const f = createDefaultForm()
    f.name = c.title || ''
    f.type = c.type || 'SINGLE'
    f.description = c.description || ''
    f.detailDesc = c.detailDesc || ''
    f.difficulty = c.difficulty || ''
    f.objectives = c.learningGoals || ''
    f.targetAudience = Array.isArray(c.targetAudience) ? [...c.targetAudience] : []
    f.tags = Array.isArray(c.categories) ? [...c.categories] : []
    f.trainerId = c.trainerId || ''
    f.assistantId = c.assistantId || ''
    f.coverType = c.coverType || (c.coverImage ? 'upload' : 'gradient')
    f.coverColor = c.coverColor || coverColors[0]
    f.coverImage = c.coverImage || ''
    f.gallery = Array.isArray(c.gallery) ? [...c.gallery] : []
    f.scheduleType = scheduleTypeToForm(c.scheduleType)
    f.weekdays = Array.isArray(c.weekdays) ? c.weekdays.map((d: any) => String(d)) : []
    f.startDate = c.startDate ? dayjs(c.startDate) : null
    f.endDate = c.endDate ? dayjs(c.endDate) : null
    f.startTime = c.startTime ? parseTimeToDayjs(c.startTime) : null
    f.duration = c.duration ?? 90
    f.totalSessions = c.totalSessions ?? 12
    f.venueId = c.venueId || ''
    f.materials = Array.isArray(c.materials) ? [...c.materials] : []
    f.capacity = c.maxCapacity ?? 8
    f.minStudents = c.minCapacity ?? 3
    f.groupDeadline = c.groupDeadline ? dayjs(c.groupDeadline) : null
    f.voucherPolicy = c.voucherPolicy || 'ALL'
    f.seedsReward = c.seedsReward ?? 10
    f.reviewSeeds = c.reviewSeeds ?? 5
    f.notice = c.notice || ''
    if (Array.isArray(c.syllabus) && c.syllabus.length) {
      f.syllabus = c.syllabus.map((s: any) => ({ title: s.title || '', content: s.content || '' }))
    }
    f.waitlistEnabled = c.waitlistEnabled ?? true
    f.waitlistDeadlineHours = c.waitlistDeadlineHours ?? 24
    f.memberWaitlistSeats = c.memberWaitlistSeats ?? 3
    if (Array.isArray(c.refundRules) && c.refundRules.length) {
      f.refundRules = c.refundRules.map((r: any) => ({ hoursFrom: r.hoursFrom, hoursTo: r.hoursTo, refundPercent: r.refundPercent }))
    }
    if (Array.isArray(c.priceTiers) && c.priceTiers.length) {
      f.priceTiers = c.priceTiers.map((t: any) => ({ from: t.seatFrom, to: t.seatTo, price: (t.price ?? 0) / 100 }))
    }
    if (Array.isArray(c.memberDiscounts)) {
      for (const d of c.memberDiscounts) {
        if (d.cardType === 'YEARLY') f.yearlyDiscount = d.discountPercent
        else if (d.cardType === 'QUARTERLY') f.quarterlyDiscount = d.discountPercent
        else if (d.cardType === 'MONTHLY') f.monthlyDiscount = d.discountPercent
      }
    }
    form.value = f
    editingId.value = id
    createStep.value = 0
    currentView.value = 'create'
    message.info(`正在编辑课程「${f.name}」，修改后可保存或重新发布`)
  } catch (e: any) {
    message.error(e?.message || '加载课程详情失败')
  }
}
</script>

<style scoped>
.course-card :deep(.ant-card-cover) { margin: 0; }
.course-cover {
  height: 120px; display: flex; flex-direction: column;
  justify-content: flex-end; padding: 16px; position: relative;
  border-radius: 12px 12px 0 0;
}
.course-type-badge {
  position: absolute; top: 12px; right: 12px;
  background: rgba(255,255,255,0.9); padding: 2px 10px;
  border-radius: 12px; font-size: 12px; color: #4B3621;
}
.course-cover-title {
  color: #fff; font-size: 18px; font-weight: 600;
  text-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
.course-meta { padding: 4px 0; }
.color-option {
  width: 48px; height: 48px; border-radius: 8px; cursor: pointer;
  border: 3px solid transparent; transition: all 0.2s;
}
.color-option.active { border-color: #4B3621; transform: scale(1.1); }
.color-option:hover { transform: scale(1.05); }
.cover-upload-box {
  width: 120px; height: 120px; border: 1px dashed #d9cfc4; border-radius: 8px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: pointer; color: #7D665C; background: #faf7f3; transition: all 0.2s;
}
.cover-upload-box:hover { border-color: #6B463C; color: #6B463C; }
.cover-preview {
  width: 120px; height: 120px; border-radius: 8px; overflow: hidden;
  position: relative; cursor: pointer;
}
.cover-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-preview-mask {
  position: absolute; inset: 0; background: rgba(0,0,0,0.45); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 12px;
  opacity: 0; transition: opacity 0.2s;
}
.cover-preview:hover .cover-preview-mask { opacity: 1; }
/* 图集上传 */
.gallery-upload { display: flex; gap: 12px; flex-wrap: wrap; }
.gallery-item {
  width: 100px; height: 100px; border-radius: 8px; overflow: hidden;
  position: relative; border: 1px solid #e8e0d8;
}
.gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gallery-remove {
  position: absolute; top: 4px; right: 4px; width: 20px; height: 20px;
  background: rgba(0,0,0,0.5); color: #fff; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; cursor: pointer; opacity: 0; transition: opacity 0.2s;
}
.gallery-item:hover .gallery-remove { opacity: 1; }
.gallery-add {
  width: 100px; height: 100px; border: 1px dashed #d9cfc4; border-radius: 8px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: pointer; color: #7D665C; background: #faf7f3; transition: all 0.2s;
}
.gallery-add:hover { border-color: #6B463C; color: #6B463C; }
.gallery-suggest {
  width: 64px; height: 64px; border-radius: 6px; overflow: hidden;
  position: relative; cursor: pointer; border: 1px solid #e8e0d8;
}
.gallery-suggest img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gallery-suggest-add {
  position: absolute; inset: 0; background: rgba(107,70,60,0.4); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 600; opacity: 0; transition: opacity 0.2s;
}
.gallery-suggest:hover .gallery-suggest-add { opacity: 1; }
</style>
