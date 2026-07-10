<template>
  <div class="page-container">
    <!-- 列表模式 -->
    <template v-if="currentView === 'list'">
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h2 class="page-title">课程管理</h2>
        <a-space>
          <a-input-search placeholder="搜索课程" style="width: 200px" v-model:value="searchText" />
          <a-select v-model:value="filterType" style="width: 120px" placeholder="课程类型">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="SINGLE">单次课程</a-select-option>
            <a-select-option value="SERIES">系列课程</a-select-option>
          </a-select>
          <a-select v-model:value="filterStatus" style="width: 120px" placeholder="状态">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="PUBLISHED">已发布</a-select-option>
            <a-select-option value="DRAFT">草稿</a-select-option>
            <a-select-option value="ENDED">已结束</a-select-option>
          </a-select>
          <a-button type="primary" @click="currentView = 'create'">+ 创建课程</a-button>
        </a-space>
      </div>

      <!-- 课程统计 -->
      <a-row :gutter="24" style="margin-bottom: 24px">
        <a-col :span="6"><a-card><a-statistic title="课程总数" :value="courses.length" /></a-card></a-col>
        <a-col :span="6"><a-card><a-statistic title="进行中" :value="courses.filter(c => c.status === 'PUBLISHED').length" :value-style="{ color: '#27AE60' }" /></a-card></a-col>
        <a-col :span="6"><a-card><a-statistic title="本周开课" :value="18" suffix="节" /></a-card></a-col>
        <a-col :span="6"><a-card><a-statistic title="平均满员率" :value="78" suffix="%" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
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
                <a-tag :color="course.status === 'PUBLISHED' ? 'green' : course.status === 'DRAFT' ? 'default' : 'red'">
                  {{ course.statusLabel }}
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
              <a-button type="link" size="small" @click.stop="handleCopy(course)">复制</a-button>
              <a-button type="link" size="small" danger @click.stop="handleUnpublish(course)">下架</a-button>
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
                <div style="font-size: 11px;">添加图片</div>
              </div>
            </div>
            <div style="color: #999; font-size: 12px; margin-top: 8px;">
              课程详情页滚动展示的图片，建议3-8张。下次创建相同导师的课程时，系统会优先推荐已有图片。
            </div>
            <div v-if="suggestedImages.length > 0" style="margin-top: 12px;">
              <div style="font-size: 12px; color: #6B463C; margin-bottom: 8px;">💡 推荐图片（来自相同导师/类似课程）：</div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <div v-for="(simg, si) in suggestedImages" :key="si" class="gallery-suggest" @click="useSuggestedImage(simg)">
                  <img :src="simg" />
                  <div class="gallery-suggest-add">+</div>
                </div>
              </div>
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
                    <a-select-option :value="45">45 分钟</a-select-option>
                    <a-select-option :value="60">60 分钟</a-select-option>
                    <a-select-option :value="90">90 分钟</a-select-option>
                    <a-select-option :value="120">120 分钟</a-select-option>
                    <a-select-option :value="180">180 分钟（半日）</a-select-option>
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
              <a-col :span="8"><a-form-item label="活动日期"><a-date-picker style="width: 100%" /></a-form-item></a-col>
              <a-col :span="8"><a-form-item label="开始时间"><a-time-picker format="HH:mm" style="width: 100%" /></a-form-item></a-col>
              <a-col :span="8"><a-form-item label="时长"><a-select v-model:value="form.duration"><a-select-option :value="120">120分钟</a-select-option><a-select-option :value="180">180分钟</a-select-option><a-select-option :value="360">全天</a-select-option></a-select></a-form-item></a-col>
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

          <a-divider>Seeds 积分奖励</a-divider>
          <a-row :gutter="24">
            <a-col :span="12">
              <a-form-item label="每节完课奖励">
                <a-input-number v-model:value="form.seedsReward" :min="0" style="width: 100%" suffix="Seeds/人/节" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="提交评价奖励（每人一次）">
                <a-input-number v-model:value="form.reviewSeeds" :min="0" style="width: 100%" suffix="Seeds/人" />
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
          <a-descriptions-item label="Seeds奖励">完课 {{ form.seedsReward || 0 }} Seeds/人/节 · 评价 {{ form.reviewSeeds || 0 }} Seeds/人</a-descriptions-item>
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
          <a-tag :color="currentCourse.status === 'PUBLISHED' ? 'green' : 'default'">{{ currentCourse.statusLabel }}</a-tag>
        </a-space>
        <a-space>
          <a-button @click="handleEditCourse">编辑课程</a-button>
          <a-button type="primary" danger ghost @click="handleUnpublishCurrent">下架</a-button>
        </a-space>
      </div>

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
                <a-statistic title="平均评分" :value="4.8" :precision="1" suffix="/ 5" />
              </a-card>
            </a-col>
          </a-row>
        </a-tab-pane>

        <a-tab-pane key="schedule" tab="排期记录">
          <a-card>
            <a-table :columns="scheduleColumns" :data-source="courseScheduleData" size="small">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'status'">
                  <a-tag :color="record.status === '已完成' ? 'green' : record.status === '进行中' ? 'blue' : 'default'">{{ record.status }}</a-tag>
                </template>
                <template v-if="column.dataIndex === 'checkin'">
                  <a-progress :percent="record.checkinRate" size="small" :stroke-color="'#6B463C'" style="width: 100px;" />
                </template>
              </template>
            </a-table>
          </a-card>
        </a-tab-pane>

        <a-tab-pane key="students" tab="学员列表">
          <a-card>
            <a-table :columns="studentColumns" :data-source="courseStudentData" size="small">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'name'">
                  <a-space>
                    <a-avatar size="small" :style="{ backgroundColor: '#6B463C' }">{{ record.name.charAt(0) }}</a-avatar>
                    <span>{{ record.name }}</span>
                  </a-space>
                </template>
                <template v-if="column.dataIndex === 'attendance'">
                  <a-progress :percent="record.attendance" size="small" :stroke-color="record.attendance >= 80 ? '#27AE60' : '#F39C12'" style="width: 100px" />
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
              <a-tag color="#6B463C">会员候补席位：{{ waitlistData.filter(w => w.seatType === 'MEMBER' && ['待支付','排队中'].includes(w.status)).length }}/{{ currentCourse?.memberWaitlistSeats || 3 }}</a-tag>
              <a-tag color="#8B6354">普通候补席位：不限量</a-tag>
            </a-space>
            <a-table :columns="waitlistColumns" :data-source="waitlistData" size="small" :pagination="false">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'position'">
                  <a-tag color="#6B463C">第 {{ record.position }} 位</a-tag>
                </template>
                <template v-if="column.dataIndex === 'seatType'">
                  <a-tag :color="record.seatType === 'MEMBER' ? 'gold' : 'default'">{{ record.seatType === 'MEMBER' ? '会员席位' : '普通席位' }}</a-tag>
                </template>
                <template v-if="column.dataIndex === 'status'">
                  <a-tag :color="waitlistStatusColor(record.status)">{{ record.status }}</a-tag>
                </template>
                <template v-if="column.dataIndex === 'action'">
                  <a-space>
                    <a-button type="link" size="small" :disabled="record.status !== '排队中'" @click="promoteWaitlist(record)">手动递补</a-button>
                    <a-button type="link" size="small" danger :disabled="!['待支付','排队中'].includes(record.status)" @click="cancelWaitlist(record)">退出退款</a-button>
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

    <!-- 封面裁剪弹窗 -->
    <ImageCropper v-model:open="cropperVisible" @cropped="onCoverCropped" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import ImageCropper from '@/components/ImageCropper.vue'
import { adminListCourses, getCourse, createCourse, setCourseStatus, savePriceTiers, saveMemberDiscounts } from '@/api/course'
import { listTrainers } from '@/api/trainer'
import { listVenues } from '@/api/venue'
import { courseReviews as fetchCourseReviews } from '@/api/review'

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
const currentCourse = ref<any>(null)

const difficultyMap: Record<string, string> = { BEGINNER: '入门', INTERMEDIATE: '进阶', ADVANCED: '高级' }

const coverColors = [
  'linear-gradient(135deg, #6B463C, #8B6354)',
  'linear-gradient(135deg, #4A6741, #6B8F62)',
  'linear-gradient(135deg, #5C4B8A, #8B73B8)',
  'linear-gradient(135deg, #8B5E3C, #C4956A)',
  'linear-gradient(135deg, #3D5A6E, #5A8A9E)',
]

const form = ref({
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
})

const courses = ref<any[]>([])

const statusLabelMap: Record<string, string> = { PUBLISHED: '已发布', DRAFT: '草稿', ENDED: '已结束', ON_SHELF: '已上架', OFF_SHELF: '已下架' }

function trainerName(id: string) {
  return trainerOptions.value.find(t => t.id === id)?.displayName || ''
}

/** 后端课程字段 → 页面展示字段映射 */
function mapCourse(c: any) {
  const dateStr = c.startDate ? String(c.startDate).slice(0, 10) : ''
  return {
    id: c.id,
    name: c.title,
    type: '',
    typeLabel: (c.categories && c.categories[0]?.name) || '课程',
    trainer: c.trainer?.displayName || '—',
    trainerId: c.trainerId,
    schedule: [dateStr, [c.startTime, c.endTime].filter(Boolean).join('-')].filter(Boolean).join(' '),
    venue: c.venue?.name || '—',
    price: (c.originalPrice ?? 0) / 100,
    capacity: c.maxCapacity ?? 0,
    enrolled: c.currentEnrolled ?? 0,
    status: c.status,
    statusLabel: statusLabelMap[c.status] || c.status,
    coverImage: c.coverImage || '',
    coverColor: coverColors[0],
    desc: c.description || '',
    raw: c,
  }
}

async function loadCourses() {
  loading.value = true
  try {
    const data: any = await adminListCourses({ page: 1, pageSize: 100, keyword: searchText.value || undefined, status: filterStatus.value || undefined })
    const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
    courses.value = items.map(mapCourse)
  } catch (e: any) {
    message.error(e?.message || '加载课程列表失败')
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  try {
    const [ts, vs]: any = await Promise.all([listTrainers(), listVenues()])
    trainerOptions.value = Array.isArray(ts) ? ts : []
    venueOptions.value = Array.isArray(vs) ? vs : []
  } catch (e: any) {
    message.error(e?.message || '加载导师/场地失败')
  }
}

onMounted(() => {
  loadCourses()
  loadOptions()
})

const filteredCourses = computed(() => {
  return courses.value.filter(c => {
    if (searchText.value && !c.name.includes(searchText.value)) return false
    if (filterType.value && c.type !== filterType.value) return false
    if (filterStatus.value && c.status !== filterStatus.value) return false
    return true
  })
})

// 课程详情数据
const scheduleColumns = [
  { title: '日期', dataIndex: 'date', width: 120 },
  { title: '时间', dataIndex: 'time', width: 120 },
  { title: '场地', dataIndex: 'venue', width: 120 },
  { title: '报名', dataIndex: 'enrolled', width: 80 },
  { title: '签到率', dataIndex: 'checkin', width: 140 },
  { title: '状态', dataIndex: 'status', width: 80 },
]
const courseScheduleData = ref([
  { date: '2025-06-23', time: '09:00-10:30', venue: '冥想室A', enrolled: '6/8', checkinRate: 83, status: '已完成' },
  { date: '2025-06-21', time: '09:00-10:30', venue: '冥想室A', enrolled: '7/8', checkinRate: 100, status: '已完成' },
  { date: '2025-06-20', time: '09:00-10:30', venue: '冥想室A', enrolled: '5/8', checkinRate: 80, status: '已完成' },
  { date: '2025-06-25', time: '09:00-10:30', venue: '冥想室A', enrolled: '4/8', checkinRate: 0, status: '待开始' },
  { date: '2025-06-27', time: '09:00-10:30', venue: '冥想室A', enrolled: '6/8', checkinRate: 0, status: '待开始' },
])

const studentColumns = [
  { title: '学员', dataIndex: 'name', width: 150 },
  { title: '手机号', dataIndex: 'phone', width: 130 },
  { title: '报名日期', dataIndex: 'enrollDate', width: 120 },
  { title: '已上课', dataIndex: 'attended', width: 80 },
  { title: '出勤率', dataIndex: 'attendance', width: 150 },
  { title: '会员卡', dataIndex: 'card', width: 80 },
]
const courseStudentData = ref([
  { name: '张敏', phone: '138****1234', enrollDate: '2025-06-01', attended: '8/10', attendance: 80, card: '季卡' },
  { name: '李悦', phone: '139****5678', enrollDate: '2025-06-03', attended: '9/10', attendance: 90, card: '月卡' },
  { name: '赵雪', phone: '137****3456', enrollDate: '2025-06-01', attended: '10/10', attendance: 100, card: '季卡' },
  { name: '陈思涵', phone: '135****7890', enrollDate: '2025-06-05', attended: '7/10', attendance: 70, card: '-' },
  { name: '林小雨', phone: '158****1111', enrollDate: '2025-06-08', attended: '6/8', attendance: 75, card: '月卡' },
  { name: '孙思琪', phone: '186****5555', enrollDate: '2025-06-10', attended: '5/6', attendance: 83, card: '季卡' },
])

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
}

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
  return {
    title: form.value.name,
    description: form.value.description,
    coverImage: form.value.coverImage || undefined,
    trainerId: form.value.trainerId || undefined,
    venueId: form.value.venueId || undefined,
    startDate: form.value.startDate && typeof form.value.startDate.format === 'function' ? form.value.startDate.format('YYYY-MM-DD') : undefined,
    startTime: startTimeStr,
    endTime: endTimeStr,
    maxCapacity: form.value.capacity,
    originalPrice: Math.round(basePrice * 100),
    status,
  }
}

async function submitCourse(status: string) {
  if (!form.value.name) { message.warning('请填写课程名称'); return }
  if (!form.value.trainerId) { message.warning('请选择授课导师'); return }
  submitting.value = true
  try {
    const created: any = await createCourse(buildCoursePayload(status))
    const newId = created?.id
    if (newId) {
      const tiers = form.value.priceTiers.map(t => ({ seatFrom: t.from, seatTo: t.to, price: Math.round((t.price || 0) * 100) }))
      const discounts = [
        { cardType: 'YEARLY', discountPercent: form.value.yearlyDiscount },
        { cardType: 'QUARTERLY', discountPercent: form.value.quarterlyDiscount },
        { cardType: 'MONTHLY', discountPercent: form.value.monthlyDiscount },
      ]
      await savePriceTiers(newId, tiers)
      await saveMemberDiscounts(newId, discounts)
    }
    message.success(status === 'DRAFT' ? '已保存为草稿' : '课程发布成功')
    currentView.value = 'list'
    createStep.value = 0
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

// ===== 详情图集管理 =====
// 全局图片库（模拟已上传过的图片）
const imageLibrary = ref<{ trainerId: string; courseName: string; url: string }[]>([
  { trainerId: '1', courseName: '正念冒想入门', url: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&h=400&fit=crop' },
  { trainerId: '1', courseName: '正念冒想入门', url: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=400&fit=crop' },
  { trainerId: '1', courseName: '深度冒想进阶', url: 'https://images.unsplash.com/photo-1593811167562-9cef47bfc4d7?w=600&h=400&fit=crop' },
  { trainerId: '2', courseName: '声音疗愈工作坊', url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&h=400&fit=crop' },
  { trainerId: '2', courseName: '颂钵深度体验', url: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&h=400&fit=crop' },
  { trainerId: '3', courseName: '舞动身心体验课', url: 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=600&h=400&fit=crop' },
  { trainerId: '4', courseName: '精油调配工作坊', url: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=600&h=400&fit=crop' },
])

// 根据当前选择的导师和课程名称推荐图片
const suggestedImages = computed(() => {
  const tid = form.value.trainerId
  const name = form.value.name
  if (!tid && !name) return []
  // 优先推荐相同导师+名称相似的，再推荐相同导师其他课程的
  const sameTrainer = imageLibrary.value.filter(img => img.trainerId === tid)
  const similar = sameTrainer.filter(img => name && img.courseName.includes(name.slice(0, 2)))
  const rest = sameTrainer.filter(img => !similar.includes(img))
  const result = [...similar, ...rest].map(i => i.url).filter(u => !form.value.gallery.includes(u))
  return result.slice(0, 6)
})

function addGalleryImage() {
  // 模拟上传，实际项目中会调用文件上传API
  const demoUrls = [
    'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1593811167562-9cef47bfc4d7?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=600&h=400&fit=crop',
  ]
  const unused = demoUrls.filter(u => !form.value.gallery.includes(u))
  if (unused.length > 0) {
    form.value.gallery.push(unused[0])
    // 同时添加到图片库
    if (form.value.trainerId) {
      imageLibrary.value.push({ trainerId: form.value.trainerId, courseName: form.value.name || '', url: unused[0] })
    }
    message.success('图片已添加')
  } else {
    message.info('演示图片已用完，实际项目中请上传新图片')
  }
}

function removeGalleryImage(idx: number) {
  form.value.gallery.splice(idx, 1)
}

function useSuggestedImage(url: string) {
  if (!form.value.gallery.includes(url)) {
    form.value.gallery.push(url)
    message.success('已引用推荐图片')
  }
}

// ===== 复制课程 =====
function handleCopy(course: any) {
  const copy = {
    ...course,
    id: 'copy-' + Date.now(),
    name: course.name + '（副本）',
    status: 'DRAFT',
    statusLabel: '草稿',
    enrolled: 0,
  }
  courses.value.unshift(copy)
  message.success(`已复制为草稿课程「${copy.name}」，可继续编辑`)
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
const waitlistData = ref([
  { position: 1, seatType: 'MEMBER', name: '周晓欣', phone: '138****2020', joinTime: '2025-06-23 10:12', deadline: '开课前 24h', paid: '¥299', status: '排队中' },
  { position: 2, seatType: 'MEMBER', name: '吴磊', phone: '139****3131', joinTime: '2025-06-23 14:30', deadline: '开课前 6h', paid: '¥299', status: '排队中' },
  { position: 3, seatType: 'MEMBER', name: '郑琪', phone: '137****4242', joinTime: '2025-06-24 09:05', deadline: '开课前 24h', paid: '¥299', status: '待支付' },
  { position: 4, seatType: 'NORMAL', name: '刘洋', phone: '135****5353', joinTime: '2025-06-24 11:20', deadline: '开课前 24h', paid: '¥299', status: '排队中' },
])
function waitlistStatusColor(status: string) {
  switch (status) {
    case '待支付': return 'orange'
    case '排队中': return 'blue'
    case '已递补': return 'green'
    default: return 'default'
  }
}
function promoteWaitlist(record: any) {
  record.status = '已递补'
  message.success(`${record.name} 已手动递补上课，已发送开课通知`)
}
function cancelWaitlist(record: any) {
  record.status = '已退款'
  message.success(`${record.name} 已退出候补，锁定金额已全额退款`)
}

// ===== 下架课程 =====
async function handleUnpublish(course: any) {
  if (course.status === 'ENDED') {
    message.warning('该课程已下架')
    return
  }
  try {
    await setCourseStatus(course.id, 'ENDED')
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
function handleEditCourse() {
  if (!currentCourse.value) return
  const c = currentCourse.value
  // 预填表单数据
  form.value.name = c.name
  form.value.type = c.type || 'SINGLE'
  form.value.description = c.desc || ''
  form.value.capacity = c.capacity || 8
  form.value.coverType = c.coverImage ? 'upload' : 'gradient'
  form.value.coverColor = c.coverColor || coverColors[0]
  form.value.coverImage = c.coverImage || ''
  form.value.gallery = c.gallery ? [...c.gallery] : []
  form.value.trainerId = c.trainerId || ''
  createStep.value = 0
  currentView.value = 'create'
  message.info(`正在编辑课程「${c.name}」，修改后可保存或重新发布`)
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
