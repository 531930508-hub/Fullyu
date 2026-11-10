<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2 class="page-title">社群工作台</h2>
        <p class="page-sub">主理人视角的日常经营：入群审核、邀请礼遇、内容治理、活动与分享视觉。</p>
      </div>
      <a-space wrap>
        <a-select
          v-model:value="hostUserId"
          style="width: 220px"
          allow-clear
          show-search
          option-filter-prop="label"
          placeholder="平台视角（全部主理人）"
          :options="hostOptions"
          @change="onHostChange"
        />
        <a-select
          v-model:value="communityId"
          style="width: 220px"
          show-search
          option-filter-prop="label"
          placeholder="选择社群"
          :options="communityOptions"
          @change="onCommunityChange"
        />
        <a-button :loading="loading" @click="reloadAll">刷新</a-button>
      </a-space>
    </div>

    <a-empty v-if="!communities.length && !loading" description="暂无社群，请先在「社群管理」中创建并指派主理人" />

    <template v-else-if="currentCommunity">
      <a-card :bordered="false" class="summary">
        <div class="summary-main">
          <div class="summary-cover" :style="{ background: currentCommunity.coverFallback || '#F4EEE6' }">
            <img v-if="currentCommunity.coverUrl" :src="currentCommunity.coverUrl" alt="" />
          </div>
          <div class="summary-info">
            <div class="summary-title">
              {{ currentCommunity.name }}
              <a-tag v-if="currentCommunity.isOfficial" color="gold">官方</a-tag>
              <a-tag :color="currentCommunity.isActive ? 'green' : 'default'">{{ currentCommunity.isActive ? '已上架' : '已下架' }}</a-tag>
              <a-tag :color="visibilityColor(currentCommunity.visibility)">{{ visibilityText(currentCommunity.visibility) }}</a-tag>
              <a-tag color="blue">{{ joinModeText(currentCommunity.joinMode) }}</a-tag>
            </div>
            <div class="summary-meta">
              <span>主理人：{{ currentCommunity.ownerNickname || currentCommunity.ownerName || '未指派' }}（{{ currentCommunity.ownerRole || '平台直管' }}）</span>
              <span>年费：{{ currentCommunity.yearlyFee ? `¥${(currentCommunity.yearlyFee / 100).toFixed(0)}` : '免费' }}</span>
              <span>成员：{{ currentCommunity.memberCount }}</span>
              <span>待审申请：{{ pendingRequests.length }}</span>
              <span>可用礼遇：{{ activeInvites }}</span>
            </div>
          </div>
        </div>
      </a-card>

      <a-tabs v-model:activeKey="tab" class="workspace-tabs" @change="onTabChange">
        <a-tab-pane key="overview" tab="概览">
          <a-row :gutter="16">
            <a-col :xs="24" :md="8">
              <a-card title="经营提示" :bordered="false">
                <ul class="tips">
                  <li>动态发布后立即对成员可见；不合适的内容可在「内容治理」隐藏或删除，操作必须填写原因。</li>
                  <li>入群审核只影响加入动作，不审核动态与评论。</li>
                  <li>邀请礼遇不等于免费入群：仍需完成入群方式，零元加入会生成权益记录。</li>
                  <li>行踪展示由成员自己选择：不展示 / 仅已完成 / 全部活动。</li>
                </ul>
              </a-card>
            </a-col>
            <a-col :xs="24" :md="16">
              <a-card title="最近动态" :bordered="false">
                <a-empty v-if="!posts.length" description="还没有动态" />
                <div v-for="p in posts.slice(0, 4)" :key="p.id" class="mini-post">
                  <div class="mini-head">
                    <strong>{{ p.authorName || '成员' }}</strong>
                    <a-tag v-if="p.isDeleted" color="red">已删除</a-tag>
                    <a-tag v-else-if="p.isHidden" color="orange">已隐藏</a-tag>
                    <span class="muted">{{ fmtTime(p.createdAt) }}</span>
                  </div>
                  <div class="mini-body">{{ p.content }}</div>
                </div>
              </a-card>
            </a-col>
          </a-row>
        </a-tab-pane>

        <a-tab-pane key="requests" tab="入群申请">
          <a-card :bordered="false">
            <template #extra>
              <a-space>
                <a-select v-model:value="requestStatus" style="width: 130px" @change="loadRequests">
                  <a-select-option value="PENDING">待处理</a-select-option>
                  <a-select-option value="APPROVED">已通过</a-select-option>
                  <a-select-option value="REJECTED">已驳回</a-select-option>
                  <a-select-option value="">全部</a-select-option>
                </a-select>
              </a-space>
            </template>
            <a-table :columns="requestColumns" :data-source="requests" :loading="loadingRequests" size="small" row-key="id" :pagination="{ pageSize: 10 }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'user'">
                  <a-space>
                    <a-avatar :src="record.user?.avatar" size="small">{{ (record.user?.name || '用')[0] }}</a-avatar>
                    <span>{{ record.user?.name || '用户' }}</span>
                  </a-space>
                </template>
                <template v-if="column.dataIndex === 'status'">
                  <a-tag :color="requestStatusColor(record.status)">{{ requestStatusText(record.status) }}</a-tag>
                </template>
                <template v-if="column.dataIndex === 'createdAt'">
                  {{ fmtTime(record.createdAt) }}
                </template>
                <template v-if="column.dataIndex === 'action'">
                  <a-space v-if="record.status === 'PENDING'">
                    <a @click="openReview(record, true)">通过</a>
                    <a style="color: #c0392b" @click="openReview(record, false)">驳回</a>
                  </a-space>
                  <span v-else class="muted">{{ record.reviewNote || '—' }}</span>
                </template>
              </template>
            </a-table>
          </a-card>
        </a-tab-pane>

        <a-tab-pane key="invites" tab="邀请与礼遇">
          <a-card :bordered="false">
            <template #extra>
              <a-button type="primary" @click="openInviteAdd">+ 新建邀请</a-button>
            </template>
            <a-alert
              type="info"
              show-icon
              style="margin-bottom: 12px"
              message="普通邀请不等于免费入群；「免年费」与「减免」会附带权益，领取后仍需按社群入群方式加入。"
            />
            <a-table :columns="inviteColumns" :data-source="invites" :loading="loadingInvites" size="small" row-key="id" :pagination="{ pageSize: 10 }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'kind'">
                  <a-tag :color="record.kind === 'NORMAL' ? 'blue' : record.kind === 'WAIVER' ? 'green' : 'orange'">
                    {{ inviteKindText(record.kind) }}
                  </a-tag>
                </template>
                <template v-if="column.dataIndex === 'amount'">
                  {{ record.kind === 'REDUCE' ? `¥${(record.amount / 100).toFixed(0)}` : '—' }}
                </template>
                <template v-if="column.dataIndex === 'quota'">
                  {{ record.claimedCount || 0 }} / {{ record.quota || '不限' }}
                </template>
                <template v-if="column.dataIndex === 'expiresAt'">
                  {{ record.expiresAt ? fmtDate(record.expiresAt) : '长期' }}
                </template>
                <template v-if="column.dataIndex === 'isActive'">
                  <a-tag :color="record.isActive ? 'green' : 'default'">{{ record.isActive ? '有效' : '已停用' }}</a-tag>
                </template>
                <template v-if="column.dataIndex === 'action'">
                  <a-space wrap>
                    <a @click="openInviteEdit(record)">编辑</a>
                    <a @click="openInviteShare(record)">二维码</a>
                    <a-popconfirm v-if="record.isActive" title="停用后已领取的权益不受影响，新用户不能再领取。确定停用？" @confirm="onDisableInvite(record)">
                      <a style="color: #c0392b">停用</a>
                    </a-popconfirm>
                  </a-space>
                </template>
              </template>
            </a-table>
          </a-card>
        </a-tab-pane>

        <a-tab-pane key="posts" tab="内容治理">
          <a-card :bordered="false">
            <template #extra>
              <a-space>
                <a-select v-model:value="postStatus" style="width: 130px" @change="loadPosts">
                  <a-select-option value="">全部</a-select-option>
                  <a-select-option value="APPROVED">已发布</a-select-option>
                  <a-select-option value="PENDING">历史待审</a-select-option>
                  <a-select-option value="REJECTED">已驳回</a-select-option>
                </a-select>
                <a-button @click="loadLogs">治理日志</a-button>
              </a-space>
            </template>
            <a-empty v-if="!posts.length" description="暂无动态" />
            <div v-for="p in posts" :key="p.id" class="post-item">
              <div class="post-head">
                <a-avatar :src="p.authorAvatar" size="small">{{ (p.authorName || '成')[0] }}</a-avatar>
                <span class="post-author">{{ p.authorName || '成员' }}</span>
                <a-tag v-if="p.isDeleted" color="red">已删除</a-tag>
                <a-tag v-else-if="p.isHidden" color="orange">已隐藏</a-tag>
                <a-tag v-else color="green">展示中</a-tag>
                <span class="post-time">{{ fmtTime(p.createdAt) }}</span>
                <a-space style="margin-left: auto">
                  <a v-if="!p.isHidden && !p.isDeleted" @click="openModeration(p, 'HIDE')">隐藏</a>
                  <a v-if="p.isHidden || p.isDeleted" @click="openModeration(p, 'RESTORE')">恢复</a>
                  <a v-if="!p.isDeleted" style="color: #c0392b" @click="openModeration(p, 'DELETE')">删除</a>
                </a-space>
              </div>
              <div class="post-content">{{ p.content }}</div>
              <div v-if="parseImages(p.images).length" class="post-images">
                <img v-for="(img, i) in parseImages(p.images)" :key="i" :src="img" alt="" />
              </div>
              <div v-if="p.hiddenReason" class="post-reason">处理原因：{{ p.hiddenReason }}</div>
            </div>
          </a-card>
        </a-tab-pane>

        <a-tab-pane key="events" tab="活动">
          <a-card :bordered="false">
            <template #extra>
              <a-button type="primary" @click="openEventAdd">+ 新增活动</a-button>
            </template>
            <a-table :columns="eventColumns" :data-source="events" :loading="loadingEvents" size="small" row-key="id" :pagination="{ pageSize: 10 }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'eventDate'">
                  {{ fmtDate(record.eventDate) }}
                </template>
                <template v-if="column.dataIndex === 'time'">
                  {{ record.time || '—' }}{{ record.endTime ? `–${record.endTime}` : '' }}
                </template>
                <template v-if="column.dataIndex === 'scope'">
                  <a-tag :color="record.scope === 'INTERNAL' ? 'purple' : 'blue'">{{ record.scope === 'INTERNAL' ? '仅成员' : '公开' }}</a-tag>
                </template>
                <template v-if="column.dataIndex === 'joined'">
                  {{ record.joined }}/{{ record.capacity || '不限' }}
                </template>
                <template v-if="column.dataIndex === 'isActive'">
                  <a-tag :color="record.isActive ? 'green' : 'default'">{{ record.isActive ? '上架' : '停用' }}</a-tag>
                </template>
                <template v-if="column.dataIndex === 'action'">
                  <a-space wrap>
                    <a @click="openEventEdit(record)">编辑</a>
                    <a @click="jumpShare('event', record.id)">分享图</a>
                    <a-popconfirm title="确定删除该活动？" @confirm="onRemoveEvent(record)">
                      <a style="color: #c0392b">删除</a>
                    </a-popconfirm>
                  </a-space>
                </template>
              </template>
            </a-table>
          </a-card>
        </a-tab-pane>

        <a-tab-pane key="share" tab="分享视觉">
          <a-row :gutter="16">
            <a-col :xs="24" :lg="10">
              <a-card title="选择分享目标" :bordered="false">
                <a-form layout="vertical">
                  <a-form-item label="目标">
                    <a-select v-model:value="shareTargetKey" :options="shareTargetOptions" @change="loadShareTarget" />
                  </a-form-item>
                  <a-form-item label="卡片图来源">
                    <a-radio-group v-model:value="artwork.source" @change="syncArtworkForm">
                      <a-radio value="custom">专用分享图</a-radio>
                      <a-radio value="cover">使用社群封面</a-radio>
                      <a-radio value="brand">品牌版式兜底</a-radio>
                    </a-radio-group>
                  </a-form-item>
                  <a-form-item v-if="artwork.source === 'custom'" label="5:4 分享图（建议 1500×1200）">
                    <div class="art-upload">
                      <div class="art-preview">
                        <img v-if="artwork.imageUrl" :src="artwork.imageUrl" alt="" />
                        <span v-else>5:4</span>
                      </div>
                      <div class="art-actions">
                        <a-upload :show-upload-list="false" :before-upload="onArtUpload" accept="image/*">
                          <a-button :loading="uploadingArt">{{ artwork.imageUrl ? '重新上传' : '上传图片' }}</a-button>
                        </a-upload>
                        <a-input v-model:value="artwork.imageUrl" placeholder="或粘贴 HTTPS 图片地址" style="margin-top: 8px" />
                      </div>
                    </div>
                  </a-form-item>
                  <a-row :gutter="16">
                    <a-col :span="12">
                      <a-form-item label="版式色调">
                        <a-select v-model:value="artwork.palette">
                          <a-select-option value="warm">暖棕</a-select-option>
                          <a-select-option value="sage">橄榄</a-select-option>
                          <a-select-option value="ink">墨色</a-select-option>
                        </a-select>
                      </a-form-item>
                    </a-col>
                    <a-col :span="12">
                      <a-form-item label="文字对齐">
                        <a-select v-model:value="artwork.layout">
                          <a-select-option value="left">左对齐</a-select-option>
                          <a-select-option value="center">居中</a-select-option>
                        </a-select>
                      </a-form-item>
                    </a-col>
                  </a-row>
                  <a-button type="primary" block :loading="savingArt" @click="onSaveArtwork">保存分享视觉</a-button>
                </a-form>
              </a-card>
            </a-col>
            <a-col :xs="24" :lg="14">
              <a-card title="小程序卡片预览（5:4）" :bordered="false">
                <a-spin :spinning="loadingShare">
                  <div v-if="sharePayload" class="card-preview-wrap">
                    <div class="mp-card">
                      <img class="mp-card-bg" :src="sharePayload.imageUrl" alt="" />
                      <div class="mp-card-overlay" :class="`layout-${sharePayload.artwork.layout}`">
                        <span class="mp-card-brand">FULL愈 · 在场</span>
                        <span class="mp-card-title">{{ sharePayload.title }}</span>
                        <span class="mp-card-sub">{{ sharePayload.subtitle }}</span>
                      </div>
                    </div>
                    <div class="card-meta">
                      <a-tag :color="shareStateColor(sharePayload.state)">{{ shareStateText(sharePayload) }}</a-tag>
                      <span class="muted">落地路径：{{ sharePayload.path }}</span>
                    </div>
                  </div>
                </a-spin>
              </a-card>
              <a-card title="海报二维码（小程序码 / H5 兜底）" :bordered="false" style="margin-top: 16px">
                <div v-if="sharePayload" class="poster-preview">
                  <div class="poster-card" :class="`palette-${sharePayload.artwork.palette}`">
                    <span class="poster-brand">FULL愈 · 在场</span>
                    <span class="poster-title" :class="`layout-${sharePayload.artwork.layout}`">{{ sharePayload.title }}</span>
                    <span class="poster-sub">{{ sharePayload.subtitle }}</span>
                    <div class="poster-qr">
                      <img :src="sharePayload.qrUrl" alt="二维码" />
                      <span>长按识别 · 打开同一页面</span>
                    </div>
                  </div>
                  <div class="poster-side">
                    <p class="muted">扫码后优先打开对应小程序页面；未配置小程序凭据时回退为 H5 页面。</p>
                    <a-input :value="sharePayload.scene" readonly addon-before="scene" />
                    <a-space style="margin-top: 8px">
                      <a-button size="small" @click="copyText(sharePayload.path)">复制路径</a-button>
                      <a-button size="small" @click="copyText(sharePayload.qrUrl)">复制二维码地址</a-button>
                    </a-space>
                  </div>
                </div>
              </a-card>
            </a-col>
          </a-row>
        </a-tab-pane>
      </a-tabs>
    </template>

    <!-- 入群审核 -->
    <a-modal v-model:open="reviewVisible" :title="reviewApproved ? '通过入群申请' : '驳回入群申请'" :confirm-loading="reviewSaving" @ok="submitReview">
      <p class="muted">申请人：{{ reviewTarget?.user?.name || '用户' }}；社群：{{ currentCommunity?.name }}</p>
      <a-textarea v-model:value="reviewNote" :rows="3" :placeholder="reviewApproved ? '备注（可选）' : '请填写驳回原因（可选，会展示给申请人）'" :maxlength="500" />
    </a-modal>

    <!-- 邀请编辑 -->
    <a-drawer v-model:open="inviteDrawer" :title="inviteForm.id ? '编辑邀请' : '新建邀请'" width="520" placement="right">
      <a-form layout="vertical">
        <a-form-item label="邀请名称" required>
          <a-input v-model:value="inviteForm.name" placeholder="如：老成员专属邀请 / 年度礼遇" />
        </a-form-item>
        <a-form-item label="类型">
          <a-select v-model:value="inviteForm.kind">
            <a-select-option value="NORMAL">普通邀请（不减免）</a-select-option>
            <a-select-option value="WAIVER">免年费礼遇</a-select-option>
            <a-select-option value="REDUCE">减免礼遇</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="inviteForm.kind === 'REDUCE'" label="减免金额（元）">
          <a-input-number v-model:value="inviteForm.amountYuan" :min="0" style="width: 100%" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="有效期">
              <a-date-picker v-model:value="inviteForm.expiresAt" value-format="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="领取上限（0 = 不限）">
              <a-input-number v-model:value="inviteForm.quota" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="说明">
          <a-textarea v-model:value="inviteForm.note" :rows="3" placeholder="领取条件或使用说明，会展示在邀请落地页" :maxlength="200" />
        </a-form-item>
        <a-alert type="warning" show-icon message="礼遇只影响应付金额；仍需满足社群入群方式（公开 / 审核 / 邀请制）。" />
        <a-button type="primary" block style="margin-top: 16px" :loading="inviteSaving" @click="submitInvite">
          {{ inviteForm.id ? '保存修改' : '创建邀请' }}
        </a-button>
      </a-form>
    </a-drawer>

    <!-- 邀请二维码 -->
    <a-modal v-model:open="inviteShareVisible" title="邀请二维码" :footer="null" width="460">
      <div v-if="inviteSharePayload" class="invite-share">
        <img :src="inviteSharePayload.qrUrl" alt="邀请二维码" class="invite-qr" />
        <p class="invite-share-title">{{ inviteSharePayload.title }}</p>
        <p class="muted">{{ inviteSharePayload.subtitle }}</p>
        <a-input :value="inviteSharePayload.path" readonly style="margin-top: 8px" />
        <a-button block style="margin-top: 8px" @click="copyText(inviteSharePayload.path)">复制落地路径</a-button>
      </div>
      <a-spin v-else />
    </a-modal>

    <!-- 内容治理 -->
    <a-modal v-model:open="moderationVisible" :title="moderationTitle" :confirm-loading="moderationSaving" @ok="submitModeration">
      <p class="muted">动态：{{ moderationTarget?.content?.slice(0, 80) }}</p>
      <a-textarea v-model:value="moderationReason" :rows="3" placeholder="请填写处理原因（必填，会记录在治理日志）" :maxlength="300" />
    </a-modal>

    <!-- 治理日志 -->
    <a-drawer v-model:open="logVisible" title="内容治理日志" width="560" placement="right">
      <a-empty v-if="!logs.length" description="暂无治理记录" />
      <div v-for="log in logs" :key="log.id" class="log-item">
        <div class="log-head">
          <a-tag :color="log.action === 'DELETE' ? 'red' : log.action === 'HIDE' ? 'orange' : 'green'">{{ moderationActionText(log.action) }}</a-tag>
          <span>{{ log.targetType === 'COMMENT' ? '评论' : '动态' }}</span>
          <span class="muted">{{ fmtTime(log.createdAt) }}</span>
        </div>
        <div class="log-body">{{ log.reason }}</div>
        <div class="muted">操作人：{{ log.actorName || log.actorId }}（{{ log.actorType === 'HOST' ? '主理人' : '平台' }}）</div>
      </div>
    </a-drawer>

    <!-- 活动编辑 -->
    <a-drawer v-model:open="eventDrawer" :title="eventForm.id ? '编辑活动' : '新增活动'" width="560" placement="right">
      <a-form layout="vertical">
        <a-form-item label="活动标题" required>
          <a-input v-model:value="eventForm.title" placeholder="如：线下静心工作坊 · 颂钵体验" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="日期" required>
              <a-date-picker v-model:value="eventForm.eventDate" value-format="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="形式">
              <a-select v-model:value="eventForm.type">
                <a-select-option value="OFFLINE">线下课程/活动</a-select-option>
                <a-select-option value="LIVE">直播</a-select-option>
                <a-select-option value="ONLINE">线上</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="开始时间">
              <a-time-picker v-model:value="eventForm.time" value-format="HH:mm" format="HH:mm" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="结束时间（用于判断已结束）">
              <a-time-picker v-model:value="eventForm.endTime" value-format="HH:mm" format="HH:mm" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="场地">
              <a-input v-model:value="eventForm.venue" placeholder="如：总店 · 瑜伽馆" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="容量（0=不限）">
              <a-input-number v-model:value="eventForm.capacity" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="已报名">
              <a-input-number v-model:value="eventForm.joined" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="可见范围">
              <a-select v-model:value="eventForm.scope">
                <a-select-option value="PUBLIC">公开</a-select-option>
                <a-select-option value="INTERNAL">仅社群成员</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="状态">
              <a-select v-model:value="eventForm.isActive">
                <a-select-option :value="true">上架</a-select-option>
                <a-select-option :value="false">停用</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="活动说明">
          <a-textarea v-model:value="eventForm.description" :rows="3" placeholder="活动内容、准备事项或适合人群" :maxlength="500" />
        </a-form-item>
        <a-button type="primary" block :loading="eventSaving" @click="submitEvent">
          {{ eventForm.id ? '保存修改' : '创建活动' }}
        </a-button>
      </a-form>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  adminListCommunities, adminListHosts, adminListJoinRequests, reviewJoinRequest,
  adminListInvites, createInvite, updateInvite, removeInvite,
  adminListPosts, moderateContent, adminListModerationLogs,
  adminListEvents, createEvent, updateEvent, deleteEvent,
} from '@/api/community'
import { getShareTarget, previewShareTargets, saveShareArtwork, type ShareArtwork, type SharePayload, type SharePreviewTargets, type ShareType } from '@/api/share'
import { uploadFile } from '@/api/upload'

const loading = ref(false)
const hostUserId = ref<string | undefined>(undefined)
const communityId = ref<string | undefined>(undefined)
const hosts = ref<any[]>([])
const communities = ref<any[]>([])
const tab = ref('overview')

const hostOptions = computed(() => hosts.value.map((h) => ({
  label: `${h.nickname || '未命名'} · ${h.roleLabel} · ${h.communityCount} 个社群`,
  value: h.id,
})))
const communityOptions = computed(() => communities.value.map((c) => ({
  label: `${c.name}${c.ownerNickname ? ` · ${c.ownerNickname}` : ''}`,
  value: c.id,
})))
const currentCommunity = computed(() => communities.value.find((c) => c.id === communityId.value) || null)

async function loadHosts() {
  try {
    const res: any = await adminListHosts()
    hosts.value = Array.isArray(res) ? res : []
  } catch { /* 统一提示 */ }
}

async function loadCommunities(keep = false) {
  loading.value = true
  try {
    const res: any = await adminListCommunities({ hostUserId: hostUserId.value })
    communities.value = Array.isArray(res) ? res : []
    if (!keep || !communities.value.some((c) => c.id === communityId.value)) {
      communityId.value = communities.value[0]?.id
    }
  } catch {
    communities.value = []
  } finally {
    loading.value = false
  }
}

function onHostChange() {
  communityId.value = undefined
  loadCommunities()
}

function onCommunityChange() {
  resetShare()
  reloadTab()
}

async function reloadAll() {
  await Promise.all([loadHosts(), loadCommunities(true)])
  resetShare()
  await reloadTab()
}

function onTabChange(key: string) {
  if (key === 'requests') loadRequests()
  if (key === 'invites') loadInvites()
  if (key === 'posts') loadPosts()
  if (key === 'events') loadEvents()
  if (key === 'share') ensureShareTargets()
}

/** 切换社群后按当前标签页重新取数 */
function reloadTab() {
  if (!communityId.value) return
  if (tab.value === 'share') { ensureShareTargets(); return }
  if (tab.value === 'events') { loadEvents(); return }
  if (tab.value === 'requests') { loadRequests(); return }
  if (tab.value === 'invites') { loadInvites(); return }
  if (tab.value === 'posts') { loadPosts(); return }
  // 概览：汇总三类数据
  loadRequests()
  loadInvites()
  loadPosts()
}

// ---------------- 入群申请 ----------------
const requests = ref<any[]>([])
const requestStatus = ref('PENDING')
const loadingRequests = ref(false)
const pendingRequests = computed(() => requests.value.filter((r) => r.status === 'PENDING'))
const reviewVisible = ref(false)
const reviewSaving = ref(false)
const reviewTarget = ref<any>(null)
const reviewApproved = ref(true)
const reviewNote = ref('')

const requestColumns = [
  { title: '申请人', dataIndex: 'user', width: 180 },
  { title: '申请说明', dataIndex: 'note', ellipsis: true },
  { title: '提交时间', dataIndex: 'createdAt', width: 150 },
  { title: '状态', dataIndex: 'status', width: 100 },
  { title: '处理', dataIndex: 'action', width: 160 },
]

async function loadRequests() {
  if (!communityId.value) return
  loadingRequests.value = true
  try {
    const res: any = await adminListJoinRequests({
      communityId: communityId.value,
      status: requestStatus.value || undefined,
      hostUserId: hostUserId.value,
    })
    requests.value = Array.isArray(res) ? res : []
  } catch {
    requests.value = []
  } finally {
    loadingRequests.value = false
  }
}

function openReview(record: any, approved: boolean) {
  reviewTarget.value = record
  reviewApproved.value = approved
  reviewNote.value = ''
  reviewVisible.value = true
}

async function submitReview() {
  if (!reviewTarget.value) return
  reviewSaving.value = true
  try {
    await reviewJoinRequest(reviewTarget.value.id, {
      approved: reviewApproved.value,
      note: reviewNote.value.trim() || undefined,
      hostUserId: hostUserId.value,
    })
    message.success(reviewApproved.value ? '已通过，申请人可按社群方式加入' : '已驳回')
    reviewVisible.value = false
    loadRequests()
  } catch { /* 统一提示 */ } finally {
    reviewSaving.value = false
  }
}

function requestStatusText(s: string) {
  return s === 'PENDING' ? '待处理' : s === 'APPROVED' ? '已通过' : '已驳回'
}
function requestStatusColor(s: string) {
  return s === 'PENDING' ? 'orange' : s === 'APPROVED' ? 'green' : 'red'
}

// ---------------- 邀请 / 礼遇 ----------------
const invites = ref<any[]>([])
const loadingInvites = ref(false)
const activeInvites = computed(() => invites.value.filter((i) => i.isActive).length)
const inviteColumns = [
  { title: '名称', dataIndex: 'name' },
  { title: '类型', dataIndex: 'kind', width: 100 },
  { title: '减免', dataIndex: 'amount', width: 90 },
  { title: '领取', dataIndex: 'quota', width: 100 },
  { title: '有效期', dataIndex: 'expiresAt', width: 120 },
  { title: '状态', dataIndex: 'isActive', width: 90 },
  { title: '操作', dataIndex: 'action', width: 190 },
]
const inviteDrawer = ref(false)
const inviteSaving = ref(false)
const inviteForm = ref<any>(emptyInvite())

function emptyInvite() {
  return { id: '', name: '', kind: 'NORMAL', amountYuan: 0, expiresAt: undefined as string | undefined, quota: 0, note: '' }
}

async function loadInvites() {
  if (!communityId.value) return
  loadingInvites.value = true
  try {
    const res: any = await adminListInvites(communityId.value, hostUserId.value)
    invites.value = Array.isArray(res) ? res : []
  } catch {
    invites.value = []
  } finally {
    loadingInvites.value = false
  }
}

function openInviteAdd() {
  inviteForm.value = emptyInvite()
  inviteDrawer.value = true
}

function openInviteEdit(record: any) {
  inviteForm.value = {
    id: record.id,
    name: record.name || '',
    kind: record.kind || 'NORMAL',
    amountYuan: (record.amount || 0) / 100,
    expiresAt: record.expiresAt ? fmtDate(record.expiresAt) : undefined,
    quota: record.quota || 0,
    note: record.note || '',
  }
  inviteDrawer.value = true
}

async function submitInvite() {
  if (!inviteForm.value.name?.trim()) {
    message.warning('请填写邀请名称')
    return
  }
  if (!communityId.value) return
  inviteSaving.value = true
  try {
    const body = {
      communityId: communityId.value,
      name: inviteForm.value.name.trim(),
      kind: inviteForm.value.kind,
      amount: inviteForm.value.kind === 'REDUCE' ? Math.round((inviteForm.value.amountYuan || 0) * 100) : 0,
      expiresAt: inviteForm.value.expiresAt ? `${inviteForm.value.expiresAt}T23:59:59` : null,
      quota: inviteForm.value.quota || 0,
      note: inviteForm.value.note || undefined,
      hostUserId: hostUserId.value,
    }
    if (inviteForm.value.id) {
      await updateInvite(inviteForm.value.id, body)
      message.success('邀请已更新')
    } else {
      await createInvite(body)
      message.success('邀请已创建')
    }
    inviteDrawer.value = false
    loadInvites()
  } catch { /* 统一提示 */ } finally {
    inviteSaving.value = false
  }
}

async function onDisableInvite(record: any) {
  try {
    await removeInvite(record.id, hostUserId.value)
    message.success('已停用')
    loadInvites()
  } catch { /* 统一提示 */ }
}

const inviteShareVisible = ref(false)
const inviteSharePayload = ref<SharePayload | null>(null)

async function openInviteShare(record: any) {
  inviteShareVisible.value = true
  inviteSharePayload.value = null
  try {
    inviteSharePayload.value = await getShareTarget('invite', record.id)
  } catch {
    inviteShareVisible.value = false
  }
}

function inviteKindText(kind: string) {
  return kind === 'WAIVER' ? '免年费' : kind === 'REDUCE' ? '减免' : '普通邀请'
}

// ---------------- 内容治理 ----------------
const posts = ref<any[]>([])
const postStatus = ref('')
const moderationVisible = ref(false)
const moderationSaving = ref(false)
const moderationTarget = ref<any>(null)
const moderationAction = ref<'HIDE' | 'RESTORE' | 'DELETE'>('HIDE')
const moderationReason = ref('')
const logVisible = ref(false)
const logs = ref<any[]>([])

async function loadPosts() {
  if (!communityId.value) return
  try {
    const res: any = await adminListPosts(postStatus.value || undefined, communityId.value, hostUserId.value)
    posts.value = Array.isArray(res) ? res : []
  } catch {
    posts.value = []
  }
}

function openModeration(post: any, action: 'HIDE' | 'RESTORE' | 'DELETE') {
  moderationTarget.value = post
  moderationAction.value = action
  moderationReason.value = ''
  moderationVisible.value = true
}

const moderationTitle = computed(() => {
  const action = moderationAction.value
  return action === 'HIDE' ? '隐藏动态' : action === 'RESTORE' ? '恢复动态' : '删除动态'
})

async function submitModeration() {
  if (!moderationTarget.value || !communityId.value) return
  if (!moderationReason.value.trim()) {
    message.warning('请填写处理原因')
    return
  }
  moderationSaving.value = true
  try {
    await moderateContent({
      communityId: communityId.value,
      targetType: 'POST',
      targetId: moderationTarget.value.id,
      action: moderationAction.value,
      reason: moderationReason.value.trim(),
      hostUserId: hostUserId.value,
    })
    message.success('已处理，操作已记录')
    moderationVisible.value = false
    loadPosts()
    if (logVisible.value) loadLogs()
  } catch { /* 统一提示 */ } finally {
    moderationSaving.value = false
  }
}

async function loadLogs() {
  if (!communityId.value) return
  logVisible.value = true
  try {
    const res: any = await adminListModerationLogs(communityId.value, hostUserId.value)
    logs.value = Array.isArray(res) ? res : []
  } catch {
    logs.value = []
  }
}

function moderationActionText(action: string) {
  return action === 'HIDE' ? '隐藏' : action === 'RESTORE' ? '恢复' : '删除'
}

// ---------------- 活动 ----------------
const events = ref<any[]>([])
const loadingEvents = ref(false)
const eventColumns = [
  { title: '日期', dataIndex: 'eventDate', width: 110 },
  { title: '时间', dataIndex: 'time', width: 120 },
  { title: '活动', dataIndex: 'title' },
  { title: '范围', dataIndex: 'scope', width: 90 },
  { title: '场地', dataIndex: 'venue', width: 130 },
  { title: '报名', dataIndex: 'joined', width: 90 },
  { title: '状态', dataIndex: 'isActive', width: 80 },
  { title: '操作', dataIndex: 'action', width: 160 },
]
const eventDrawer = ref(false)
const eventSaving = ref(false)
const eventForm = ref<any>(emptyEvent())

function emptyEvent() {
  return {
    id: '', title: '', eventDate: '', time: '', endTime: '', type: 'OFFLINE',
    venue: '', capacity: 0, joined: 0, scope: 'PUBLIC', isActive: true, description: '',
  }
}

async function loadEvents() {
  if (!communityId.value) return
  loadingEvents.value = true
  try {
    const res: any = await adminListEvents(communityId.value, hostUserId.value)
    events.value = Array.isArray(res) ? res : []
  } catch {
    events.value = []
  } finally {
    loadingEvents.value = false
  }
}

function openEventAdd() {
  eventForm.value = emptyEvent()
  eventDrawer.value = true
}

function openEventEdit(record: any) {
  eventForm.value = {
    id: record.id,
    title: record.title || '',
    eventDate: fmtDate(record.eventDate),
    time: record.time || '',
    endTime: record.endTime || '',
    type: record.type || 'OFFLINE',
    venue: record.venue || '',
    capacity: record.capacity ?? 0,
    joined: record.joined ?? 0,
    scope: record.scope || 'PUBLIC',
    isActive: record.isActive !== false,
    description: record.description || '',
  }
  eventDrawer.value = true
}

async function submitEvent() {
  if (!communityId.value) return
  if (!eventForm.value.title?.trim() || !eventForm.value.eventDate) {
    message.warning('标题与日期为必填')
    return
  }
  eventSaving.value = true
  try {
    const body = {
      communityId: communityId.value,
      title: eventForm.value.title.trim(),
      eventDate: eventForm.value.eventDate,
      time: eventForm.value.time || '',
      endTime: eventForm.value.endTime || null,
      type: eventForm.value.type,
      venue: eventForm.value.venue || null,
      capacity: eventForm.value.capacity || 0,
      joined: eventForm.value.joined || 0,
      scope: eventForm.value.scope,
      isActive: eventForm.value.isActive,
      description: eventForm.value.description || null,
    }
    if (eventForm.value.id) {
      await updateEvent(eventForm.value.id, body)
      message.success('活动已更新')
    } else {
      await createEvent(body)
      message.success('活动已创建')
    }
    eventDrawer.value = false
    loadEvents()
    resetShare()
  } catch { /* 统一提示 */ } finally {
    eventSaving.value = false
  }
}

async function onRemoveEvent(record: any) {
  try {
    await deleteEvent(record.id)
    message.success('已删除')
    loadEvents()
    resetShare()
  } catch { /* 统一提示 */ }
}

// ---------------- 分享视觉 ----------------
const shareTargets = ref<SharePreviewTargets | null>(null)
const shareTargetKey = ref<string>('')
const sharePayload = ref<SharePayload | null>(null)
const loadingShare = ref(false)
const savingArt = ref(false)
const uploadingArt = ref(false)
const artwork = ref<ShareArtwork>({ source: 'brand', palette: 'warm', layout: 'left' })

const shareTargetOptions = computed(() => {
  if (!shareTargets.value) return []
  const options: { label: string; value: string }[] = []
  if (shareTargets.value.community) {
    options.push({ label: `社群 · ${shareTargets.value.community.title}`, value: `community:${shareTargets.value.community.id}` })
  }
  if (shareTargets.value.host) {
    options.push({ label: `主理人主页 · ${shareTargets.value.host.title}`, value: `host:${shareTargets.value.host.id}` })
  }
  for (const event of shareTargets.value.events) {
    options.push({ label: `活动 · ${event.title}${event.date ? `（${event.date}）` : ''}`, value: `event:${event.id}` })
  }
  return options
})

async function ensureShareTargets() {
  if (!communityId.value) return
  if (shareTargets.value) return
  try {
    shareTargets.value = await previewShareTargets(communityId.value)
    const first = shareTargetOptions.value[0]?.value
    if (first) {
      shareTargetKey.value = first
      await loadShareTarget()
    }
  } catch {
    shareTargets.value = null
  }
}

function resetShare() {
  shareTargets.value = null
  shareTargetKey.value = ''
  sharePayload.value = null
}

function jumpShare(type: ShareType, id: string) {
  tab.value = 'share'
  shareTargetKey.value = `${type}:${id}`
  ensureShareTargets().then(() => loadShareTarget())
}

async function loadShareTarget() {
  const value = shareTargetKey.value
  if (!value) return
  const [type, id] = value.split(':') as [ShareType, string]
  loadingShare.value = true
  try {
    const payload = await getShareTarget(type, id)
    sharePayload.value = payload
    artwork.value = { ...payload.artwork }
  } catch {
    sharePayload.value = null
  } finally {
    loadingShare.value = false
  }
}

function syncArtworkForm() {
  if (!sharePayload.value) return
  if (artwork.value.source === 'cover') {
    artwork.value.imageUrl = undefined
  }
}

async function onArtUpload(file: File) {
  uploadingArt.value = true
  try {
    const res = await uploadFile(file, 'community-share')
    artwork.value.imageUrl = res.url
    artwork.value.source = 'custom'
    message.success('分享图已上传')
  } catch { /* 统一提示 */ } finally {
    uploadingArt.value = false
  }
  return false
}

async function onSaveArtwork() {
  if (!sharePayload.value || !communityId.value) return
  if (artwork.value.source === 'custom' && !/^https?:\/\//i.test(artwork.value.imageUrl || '')) {
    message.warning('专用分享图需要 HTTPS 图片地址')
    return
  }
  savingArt.value = true
  try {
    const body: any = { artwork: { ...artwork.value } }
    if (sharePayload.value.type === 'event') {
      body.eventId = sharePayload.value.id
    } else {
      body.communityId = communityId.value
    }
    await saveShareArtwork(body)
    message.success('分享视觉已保存')
    await loadShareTarget()
  } catch { /* 统一提示 */ } finally {
    savingArt.value = false
  }
}

function shareStateText(payload: SharePayload) {
  if (payload.state === 'normal') return '正常分享'
  if (payload.state === 'ended') return '已结束'
  if (payload.state === 'restricted') return '仅受邀可见'
  return payload.reason || '不可分享'
}

function shareStateColor(state: string) {
  return state === 'normal' ? 'green' : state === 'ended' ? 'default' : state === 'restricted' ? 'orange' : 'red'
}

// ---------------- 工具 ----------------
function visibilityText(v: string) {
  return v === 'INVITE_ONLY' ? '邀请制' : v === 'HIDDEN' ? '隐藏' : '公开'
}
function visibilityColor(v: string) {
  return v === 'INVITE_ONLY' ? 'purple' : v === 'HIDDEN' ? 'default' : 'green'
}
function joinModeText(v: string) {
  return v === 'APPROVAL' ? '需审核' : v === 'INVITE' ? '仅邀请' : '公开加入'
}
function fmtDate(value: string) {
  if (!value) return ''
  return String(value).slice(0, 10)
}
function fmtTime(value: string) {
  if (!value) return ''
  return String(value).replace('T', ' ').slice(0, 16)
}
function parseImages(raw: any): string[] {
  if (Array.isArray(raw)) return raw
  try {
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
async function copyText(text: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制')
  } catch {
    message.warning('复制失败，请手动选择复制')
  }
}

onMounted(async () => {
  await Promise.all([loadHosts(), loadCommunities()])
  await reloadTab()
})
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.page-title {
  margin: 0;
}
.page-sub {
  margin: 6px 0 0;
  color: #8c8c8c;
  font-size: 13px;
}
.summary {
  margin-bottom: 12px;
  border-radius: 12px;
}
.summary-main {
  display: flex;
  gap: 16px;
  align-items: center;
}
.summary-cover {
  width: 96px;
  height: 96px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
}
.summary-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.summary-title {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.summary-meta {
  margin-top: 8px;
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  color: #595959;
  font-size: 13px;
}
.tips {
  margin: 0;
  padding-left: 18px;
  color: #595959;
  line-height: 1.9;
  font-size: 13px;
}
.mini-post {
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}
.mini-post:last-child {
  border-bottom: none;
}
.mini-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mini-body {
  margin-top: 4px;
  color: #333;
  white-space: pre-wrap;
}
.muted {
  color: #999;
  font-size: 12px;
}
.post-item {
  padding: 14px 0;
  border-bottom: 1px solid #f0f0f0;
}
.post-item:last-child {
  border-bottom: none;
}
.post-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.post-author {
  font-weight: 600;
}
.post-time {
  color: #999;
  font-size: 12px;
}
.post-content {
  margin: 8px 0 4px;
  color: #333;
  line-height: 1.7;
  white-space: pre-wrap;
}
.post-images {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.post-images img {
  width: 120px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
}
.post-reason {
  margin-top: 6px;
  color: #c0392b;
  font-size: 12px;
}
.log-item {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}
.log-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.log-body {
  margin: 6px 0;
  color: #333;
}
.art-upload {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.art-preview {
  width: 160px;
  height: 128px;
  border-radius: 8px;
  background: #f4eee6;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  flex-shrink: 0;
}
.art-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.art-actions {
  flex: 1;
  min-width: 0;
}
.card-preview-wrap {
  max-width: 420px;
}
.mp-card {
  position: relative;
  width: 100%;
  aspect-ratio: 5 / 4;
  border-radius: 12px;
  overflow: hidden;
  background: #f4eee6;
}
.mp-card-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mp-card-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
  padding: 20px;
  color: #fff;
  background: linear-gradient(180deg, rgba(20, 12, 6, 0) 30%, rgba(20, 12, 6, 0.74) 100%);
}
.mp-card-overlay.layout-center {
  align-items: center;
  text-align: center;
}
.mp-card-brand {
  font-size: 11px;
  letter-spacing: 0.14em;
  opacity: 0.85;
}
.mp-card-title {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.35;
}
.mp-card-sub {
  font-size: 13px;
  opacity: 0.9;
}
.card-meta {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.poster-preview {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.poster-card {
  width: 300px;
  height: 400px;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #3a2a1a;
  background: #f7f1e8;
  position: relative;
  overflow: hidden;
}
.poster-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  background: #8a6a45;
}
.poster-card.palette-sage::before {
  background: #6f7c62;
}
.poster-card.palette-ink::before {
  background: #2f2a26;
}
.poster-brand {
  font-size: 12px;
  letter-spacing: 0.12em;
  color: #8a6a45;
}
.poster-title {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.35;
}
.poster-title.layout-center {
  text-align: center;
}
.poster-sub {
  font-size: 13px;
  color: #6b5a49;
  line-height: 1.6;
}
.poster-qr {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 10px;
  padding: 10px;
}
.poster-qr img {
  width: 92px;
  height: 92px;
  display: block;
}
.poster-qr span {
  font-size: 12px;
  color: #6b5a49;
  line-height: 1.6;
}
.poster-side {
  flex: 1;
  min-width: 220px;
}
.invite-share {
  text-align: center;
}
.invite-qr {
  width: 220px;
  height: 220px;
  display: block;
  margin: 0 auto;
}
.invite-share-title {
  margin: 12px 0 4px;
  font-weight: 600;
  font-size: 16px;
}
</style>
