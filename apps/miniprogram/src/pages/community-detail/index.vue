<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <text class="nav-title serif">{{ tr('社群', 'Community') }}</text>
      <view class="nav-actions">
        <button v-if="community" class="icon-button" :aria-label="tr('分享社群', 'Share community')" @tap="shareVisible = true">
          <PresenceIcon name="arrow" :size="30" />
        </button>
        <button v-if="managed" class="text-button" @tap="goWorkspace">{{ tr('工作台', 'Studio') }}</button>
      </view>
    </view>

    <PageState v-if="loading" state="loading" :title="tr('正在打开社群', 'Opening community')" />
    <PageState v-else-if="loadError" state="error" :title="tr('社群暂时无法打开', 'Community is unavailable')" :message="loadError" :action="tr('重试', 'Retry')" @action="load" />

    <template v-else-if="community">
      <view class="hero">
        <image v-if="community.cover && !failedImages[community.cover]" class="hero-image" :src="community.cover" mode="aspectFill" @error="failedImages[community.cover] = true" />
        <BrandCover v-else :label="community.name" height="360rpx" icon="leaf" />
      </view>

      <view class="content">
        <view class="card info-card">
          <view class="title-row">
            <text class="community-name serif">{{ community.name }}</text>
            <text v-if="community.isOfficial" class="badge">{{ tr('官方社群', 'Official') }}</text>
            <text v-if="managed" class="badge gold">{{ membership?.hostRole || tr('主理人', 'Host') }}</text>
          </view>
          <text v-if="community.slogan" class="slogan">{{ community.slogan }}</text>
          <view v-if="community.tags.length" class="tags">
            <text v-for="tag in community.tags" :key="tag" class="tag">{{ communityTagLabel(tag) }}</text>
          </view>
          <view v-if="!community.restricted" class="stats">
            <view class="stat"><text class="stat-value latin">{{ community.memberCount }}</text><text class="muted">{{ tr('成员', 'Members') }}</text></view>
            <view class="stat"><text class="stat-value latin">{{ community.activeToday }}</text><text class="muted">{{ tr('今日活跃', 'Active today') }}</text></view>
            <view class="stat"><text class="stat-value latin fee">{{ feeLabel }}</text><text class="muted">{{ community.yearlyFee ? tr('年费', 'Yearly') : tr('加入', 'Join') }}</text></view>
          </view>
          <view class="owner-row">
            <image v-if="community.owner.avatar && !failedImages[community.owner.avatar]" class="avatar" :src="community.owner.avatar" mode="aspectFill" @error="failedImages[community.owner.avatar] = true" />
            <view v-else class="avatar avatar-fallback"><PresenceIcon name="user" :size="30" /></view>
            <view class="grow">
              <text>{{ tr('主理人', 'Host') }} · {{ community.owner.name || tr('社群主理人', 'Community host') }}</text>
              <text v-if="community.owner.title" class="muted block">{{ community.owner.title }}</text>
            </view>
            <text v-if="joined" class="badge">{{ tr('已加入', 'Joined') }}</text>
          </view>
        </view>

        <view v-if="community.restricted" class="notice restricted">
          <PresenceIcon name="lock" :size="32" />
          <text>{{ tr('这是仅限受邀的社群。公开页只展示社群名称与主理人，加入后可查看简介、动态与成员。', 'This is an invite-only community. Only its name and host are public; join to see the intro, posts and members.') }}</text>
        </view>

        <PageState v-if="membershipError" state="error" :title="tr('加入状态暂不可用', 'Membership status unavailable')" :message="membershipError" :action="tr('重新确认', 'Check again')" @action="loadMembership" />

        <view v-if="requestNotice" class="notice" :class="{ warn: membership?.requestStatus === 'REJECTED' }">
          <PresenceIcon :name="membership?.requestStatus === 'REJECTED' ? 'info' : 'clock'" :size="32" />
          <text>{{ requestNotice }}</text>
        </view>

        <button v-if="joined" class="card privacy-row" @tap="openPrivacy">
          <PresenceIcon name="lock" :size="32" />
          <view class="grow">
            <text>{{ tr('我的活动可见范围', 'Who sees my activity') }}</text>
            <text class="muted block">{{ privacyLabel(membership?.privacy || 'NONE') }}{{ membership?.interests?.length ? tr(` · 兴趣：${membership.interests.join('、')}`, ` · Interests: ${membership.interests.join(', ')}`) : '' }}</text>
          </view>
          <PresenceIcon name="arrow" :size="28" />
        </button>

        <view class="tabs">
          <button v-for="tab in tabs" :key="tab.key" class="tab" :class="{ active: currentTab === tab.key }" @tap="currentTab = tab.key">{{ tab.label }}</button>
        </view>

        <!-- 动态 -->
        <view v-if="currentTab === 'feed'" class="tab-content">
          <view v-if="community.description" class="card about">
            <text class="section-title">{{ tr('关于社群', 'About') }}</text>
            <text class="long-text">{{ community.description }}</text>
          </view>

          <view v-if="joined || managed" class="card compose-card">
            <button class="compose-trigger" @tap="openCompose">
              <PresenceIcon name="edit" :size="30" />
              <text>{{ tr('分享此刻的感受…', 'Share how you feel right now…') }}</text>
              <PresenceIcon name="arrow" :size="26" />
            </button>
            <text class="compose-hint muted">{{ tr('发布后立即对社群成员可见；不适内容由主理人或平台后续处理。', 'Posts are visible to members right away. The host or platform can moderate later.') }}</text>
          </view>

          <PageState v-if="!joined && !managed" state="guest" :title="tr('加入后可查看社群动态', 'Join to see community posts')" :message="tr('动态仅对成员开放；公开活动仍可在「活动」中浏览。', 'Posts are members-only. Public events are still listed under Events.')" />

          <template v-else>
            <PageState v-if="sectionLoading.feed" state="loading" :title="tr('正在加载动态', 'Loading posts')" />
            <PageState v-else-if="sectionErrors.feed" state="error" :title="tr('动态加载失败', 'Failed to load posts')" :message="sectionErrors.feed" :action="tr('重试', 'Retry')" @action="loadFeed" />
            <PageState v-else-if="!posts.length" state="empty" :title="tr('还没有动态', 'No posts yet')" :message="tr('成为第一个分享练习感受的人。', 'Be the first to share your practice.')" />
            <view v-else class="card posts-card">
              <view v-for="post in posts" :key="post.id" class="post">
                <view class="post-head">
                  <button class="avatar-button" @tap="openMemberCard(post.author.id)">
                    <image v-if="post.author.avatar && !failedImages[post.author.avatar]" class="avatar" :src="post.author.avatar" mode="aspectFill" @error="failedImages[post.author.avatar] = true" />
                    <view v-else class="avatar avatar-fallback"><PresenceIcon name="user" :size="30" /></view>
                  </button>
                  <view class="grow">
                    <text class="post-name">{{ post.author.name }}<text v-if="post.author.role === '主理人'"> · {{ tr('主理人', 'Host') }}</text></text>
                    <text class="muted block">{{ timeAgo(post.time) }}</text>
                  </view>
                  <button v-if="managed" class="moderate-button" @tap="openModeration('POST', post.id, post.content)">{{ tr('管理', 'Manage') }}</button>
                </view>
                <text class="long-text post-text">{{ post.content }}</text>
                <view v-if="post.images?.length" class="post-images">
                  <view v-for="(img, i) in post.images" :key="i" class="post-image-tile" @tap="previewImage(img, post.images)">
                    <image v-if="img && !failedImages[img]" class="post-image" :src="img" mode="aspectFill" @error="failedImages[img] = true" />
                    <BrandCover v-else :label="tr('在场时刻', 'Presence moment')" height="184rpx" icon="leaf" />
                  </view>
                </view>

                <view v-if="commentsOf(post).length" class="comments">
                  <view v-for="comment in visibleComments(post)" :key="comment.id" class="comment-row">
                    <text class="comment-name">{{ comment.author.name }}</text>
                    <text class="comment-text">{{ comment.content }}</text>
                    <button v-if="managed" class="moderate-inline" @tap="openModeration('COMMENT', comment.id, comment.content)">{{ tr('处理', 'Moderate') }}</button>
                  </view>
                  <button v-if="commentsOf(post).length > 3 && !expandedPosts[post.id]" class="expand-comments" @tap="expandedPosts[post.id] = true">
                    {{ tr(`查看全部 ${commentsOf(post).length} 条留言`, `View all ${commentsOf(post).length} comments`) }}
                  </button>
                </view>

                <view class="post-actions">
                  <text class="muted">{{ tr(`点赞 ${post.likes}`, `Likes ${post.likes}`) }}</text>
                  <button class="comment-trigger" @tap="openComment(post)"><PresenceIcon name="edit" :size="26" /><text>{{ tr('留言', 'Comment') }}</text></button>
                </view>
              </view>
            </view>
          </template>
        </view>

        <!-- 活动 -->
        <view v-else-if="currentTab === 'events'" class="tab-content">
          <view class="event-header">
            <text class="section-title">{{ eventScope === 'upcoming' ? tr('近期活动', 'Upcoming') : tr('往期活动', 'Past') }}</text>
            <button class="text-button" @tap="eventScope = eventScope === 'upcoming' ? 'past' : 'upcoming'">
              {{ eventScope === 'upcoming' ? tr('查看往期', 'View past') : tr('查看近期', 'View upcoming') }}
            </button>
          </view>
          <view class="notice">
            <PresenceIcon name="info" :size="30" />
            <text>{{ tr('活动按实际日期与结束时间排序。公开活动可直接查看；仅成员活动需加入后可见。', 'Events are ordered by real date and end time. Public events are open to all; members-only events require joining.') }}</text>
          </view>
          <PageState v-if="sectionLoading.events" state="loading" :title="tr('正在加载活动', 'Loading events')" />
          <PageState v-else-if="sectionErrors.events" state="error" :title="tr('活动加载失败', 'Failed to load events')" :message="sectionErrors.events" :action="tr('重试', 'Retry')" @action="loadEvents" />
          <PageState v-else-if="!visibleEvents.length" state="empty" :title="eventScope === 'upcoming' ? tr('近期暂无活动', 'No upcoming events') : tr('暂无往期活动', 'No past events')" :message="tr('新的安排会展示在这里。', 'New events will appear here.')" />
          <view v-else class="event-list">
            <button v-for="ev in visibleEvents" :key="ev.id" class="card event-card" @tap="goEvent(ev)">
              <view class="date-block">
                <text class="date-day latin">{{ ev.date.slice(8, 10) }}</text>
                <text class="date-month">{{ eventMonth(ev.date) }}</text>
              </view>
              <view class="grow">
                <view class="event-title-row">
                  <text class="event-title">{{ ev.title }}</text>
                  <text v-if="ev.ended" class="tag muted">{{ tr('已结束', 'Ended') }}</text>
                  <text v-else-if="ev.signed" class="tag gold">{{ tr('已报名', 'Registered') }}</text>
                  <text v-else-if="ev.scope === 'INTERNAL'" class="tag">{{ tr('仅成员', 'Members') }}</text>
                </view>
                <text class="muted block">{{ ev.time }}{{ ev.endTime ? `–${ev.endTime}` : '' }} · {{ eventTypeName(ev.type) }}</text>
                <text v-if="ev.venue" class="muted block">{{ ev.venue }}</text>
                <text class="muted block">{{ tr(`已报名 ${ev.joined}`, `${ev.joined} registered`) }}{{ ev.capacity ? ` / ${ev.capacity}` : '' }}</text>
              </view>
              <PresenceIcon name="arrow" :size="28" />
            </button>
          </view>
        </view>

        <!-- 成员 -->
        <view v-else class="tab-content">
          <PageState v-if="!joined && !managed" state="guest" :title="tr('加入后可查看成员', 'Join to see members')" :message="tr('成员名单仅对社群成员开放。', 'The member list is available to members only.')" />
          <template v-else>
            <view v-if="membership?.interests?.length" class="member-filter">
              <button class="filter-chip" :class="{ active: memberFilter === 'all' }" @tap="memberFilter = 'all'">{{ tr('全部成员', 'All members') }}</button>
              <button class="filter-chip" :class="{ active: memberFilter === 'shared' }" @tap="memberFilter = 'shared'">{{ tr('共同兴趣', 'Shared interests') }}</button>
            </view>
            <PageState v-if="sectionLoading.members" state="loading" :title="tr('正在加载成员', 'Loading members')" />
            <PageState v-else-if="sectionErrors.members" state="error" :title="tr('成员加载失败', 'Failed to load members')" :message="sectionErrors.members" :action="tr('重试', 'Retry')" @action="loadMembers" />
            <PageState v-else-if="!filteredMembers.length" state="empty" :title="tr('暂无匹配成员', 'No members match')" :message="memberFilter === 'shared' ? tr('还没有与你兴趣相同的成员。', 'No members share your interests yet.') : tr('成员加入后会展示在这里。', 'Members will appear here after joining.')" />
            <view v-else class="card members-card">
              <button v-for="member in filteredMembers" :key="member.id" class="member-row" @tap="openMemberCard(member.id)">
                <image v-if="member.avatar && !failedImages[member.avatar]" class="avatar" :src="member.avatar" mode="aspectFill" @error="failedImages[member.avatar] = true" />
                <view v-else class="avatar avatar-fallback"><PresenceIcon name="user" :size="30" /></view>
                <view class="grow">
                  <text class="post-name">{{ member.name }}</text>
                  <text class="muted block">{{ member.joinedAt ? tr(`${member.joinedAt.slice(0, 10)} 加入`, `Joined ${formatMemberDate(member.joinedAt)}`) : tr('社群成员', 'Community member') }}</text>
                  <view v-if="member.interests?.length" class="mini-tags">
                    <text v-for="item in member.interests" :key="item" class="mini-tag">{{ item }}</text>
                  </view>
                </view>
                <PresenceIcon name="arrow" :size="26" />
              </button>
            </view>
            <text v-if="!sectionLoading.members && !sectionErrors.members" class="member-total muted">{{ tr(`共 ${community.memberCount} 位成员`, `${community.memberCount} members in total`) }}</text>
          </template>
        </view>
      </view>

      <view v-if="showJoinBar" class="bottom-action">
        <view class="grow">
          <text class="fee">{{ feeLabel }}{{ community.yearlyFee ? tr('/年', '/year') : '' }}</text>
          <text class="muted block">{{ joinHint }}</text>
        </view>
        <button class="primary-button" :disabled="joinDisabled" @tap="onJoin">{{ ctaLabel }}</button>
      </view>
    </template>

    <!-- 加入确认 -->
    <BottomSheet :show="joinVisible" :title="tr('确认加入社群', 'Confirm joining')" :busy="joinBusy" @close="joinVisible = false">
      <text class="section-title">{{ community?.name }}</text>
      <text class="long-text">{{ joinCopy }}</text>
      <view v-if="membership?.claimedInvite" class="claim-line">
        <PresenceIcon name="ticket" :size="30" />
        <text>{{ claimLabel(membership.claimedInvite) }}</text>
      </view>
      <text v-if="joinError" class="error-text">{{ joinError }}</text>
      <template #actions>
        <button class="primary-button full-width" :disabled="joinBusy" @tap="confirmJoin">
          {{ joinBusy ? tr('处理中…', 'Processing…') : payLabel }}
        </button>
      </template>
    </BottomSheet>

    <!-- 入群申请 -->
    <BottomSheet :show="applyVisible" :title="tr('申请加入', 'Request to join')" :busy="applyBusy" @close="applyVisible = false">
      <text class="muted block">{{ tr('主理人审核通过后即可加入。可以简单说明你的练习背景或期待。', 'The host reviews requests. You can briefly share your practice background or what you hope to find.') }}</text>
      <textarea v-model="applyNote" class="sheet-textarea" :maxlength="200" :disabled="applyBusy" :placeholder="tr('选填，最多 200 字', 'Optional, up to 200 characters')" />
      <text v-if="applyError" class="error-text">{{ applyError }}</text>
      <template #actions>
        <button class="primary-button full-width" :disabled="applyBusy || applyNote.length > 200" @tap="submitApply">{{ applyBusy ? tr('提交中…', 'Submitting…') : tr('提交申请', 'Submit request') }}</button>
      </template>
    </BottomSheet>

    <!-- 隐私与兴趣 -->
    <BottomSheet :show="privacyVisible" :title="tr('隐私与兴趣', 'Privacy & interests')" :busy="privacyBusy" @close="privacyVisible = false">
      <text class="sheet-label">{{ tr('活动可见范围', 'Who can see my activity') }}</text>
      <view class="option-list">
        <button v-for="option in privacyOptions" :key="option.value" class="option" :class="{ active: privacyDraft === option.value }" @tap="privacyDraft = option.value">
          <text class="option-title">{{ option.label }}</text>
          <text class="option-desc">{{ option.desc }}</text>
        </button>
      </view>
      <template v-if="community?.interestPool?.length">
        <text class="sheet-label spacing">{{ tr('兴趣标签（最多 3 个）', 'Interests (up to 3)') }}</text>
        <view class="interest-grid">
          <button
            v-for="item in community.interestPool"
            :key="item"
            class="interest-chip"
            :class="{ active: interestsDraft.includes(item) }"
            @tap="toggleInterest(item)"
          >{{ item }}</button>
        </view>
      </template>
      <text v-if="privacyError" class="error-text">{{ privacyError }}</text>
      <template #actions>
        <button class="primary-button full-width" :disabled="privacyBusy" @tap="savePrivacy">{{ privacyBusy ? tr('保存中…', 'Saving…') : tr('保存设置', 'Save settings') }}</button>
      </template>
    </BottomSheet>

    <!-- 发布动态 -->
    <BottomSheet :show="composeVisible" :title="tr('发布动态', 'Create post')" :busy="postBusy" @close="composeVisible = false">
      <text class="muted block">{{ tr('发布后立即对成员可见，请分享真实的练习感受。', 'Visible to members immediately. Share your genuine practice experience.') }}</text>
      <textarea v-model="composeText" class="sheet-textarea" :placeholder="tr('分享此刻的感受…', 'Share how you feel right now…')" :maxlength="1000" :disabled="postBusy" />
      <text class="counter muted">{{ composeText.length }} / 1000</text>
      <text v-if="postError" class="error-text">{{ postError }}</text>
      <template #actions>
        <button class="primary-button full-width" :disabled="postBusy || !composeText.trim()" @tap="submitPostNow">{{ postBusy ? tr('发布中…', 'Publishing…') : tr('立即发布', 'Publish now') }}</button>
      </template>
    </BottomSheet>

    <!-- 留言 -->
    <BottomSheet :show="commentVisible" :title="tr('留言', 'Comment')" :busy="commentBusy" @close="commentVisible = false">
      <text class="muted block">{{ tr('即时可见；主理人可后续隐藏或删除。', 'Visible immediately. The host can hide or delete later.') }}</text>
      <text v-if="commentPost" class="quote">{{ commentPost.content }}</text>
      <textarea v-model="commentText" class="sheet-textarea" :maxlength="300" :disabled="commentBusy" :placeholder="tr('写下你的回应…', 'Write a response…')" />
      <text v-if="commentError" class="error-text">{{ commentError }}</text>
      <template #actions>
        <button class="primary-button full-width" :disabled="commentBusy || !commentText.trim()" @tap="submitComment">{{ commentBusy ? tr('发送中…', 'Sending…') : tr('发送留言', 'Send') }}</button>
      </template>
    </BottomSheet>

    <!-- 内容治理 -->
    <BottomSheet :show="modVisible" :title="tr('内容处理', 'Moderate content')" :busy="modBusy" @close="modVisible = false">
      <text class="muted block">{{ modTarget.type === 'POST' ? tr('动态', 'Post') : tr('留言', 'Comment') }} · {{ modTarget.label }}</text>
      <view class="option-list">
        <button class="option" :class="{ active: modAction === 'HIDE' }" @tap="modAction = 'HIDE'">
          <text class="option-title">{{ tr('隐藏', 'Hide') }}</text>
          <text class="option-desc">{{ tr('成员不可见，可在后台恢复。', 'Hidden from members. Can be restored in admin.') }}</text>
        </button>
        <button class="option" :class="{ active: modAction === 'DELETE' }" @tap="modAction = 'DELETE'">
          <text class="option-title">{{ tr('删除', 'Delete') }}</text>
          <text class="option-desc">{{ tr('仅后台可恢复；请谨慎操作。', 'Only admins can restore. Use with care.') }}</text>
        </button>
      </view>
      <textarea v-model="modReason" class="sheet-textarea" :maxlength="200" :disabled="modBusy" :placeholder="tr('处理原因（必填，成员不可见）', 'Reason (required, not shown to members)')" />
      <text v-if="modError" class="error-text">{{ modError }}</text>
      <template #actions>
        <button class="primary-button full-width" :disabled="modBusy || !modReason.trim()" @tap="submitModeration">{{ modBusy ? tr('处理中…', 'Processing…') : tr('确认处理', 'Confirm') }}</button>
      </template>
    </BottomSheet>

    <!-- 成员名片 -->
    <BottomSheet :show="cardVisible" :title="tr('成员名片', 'Member card')" @close="cardVisible = false">
      <PageState v-if="cardBusy" state="loading" :title="tr('正在加载名片', 'Loading member card')" />
      <PageState v-else-if="cardError" state="error" :title="tr('名片暂不可用', 'Member card unavailable')" :message="cardError" :action="tr('重试', 'Retry')" @action="reloadCard" />
      <template v-else-if="card">
        <view class="card-head">
          <image v-if="card.avatar" class="avatar avatar-lg" :src="card.avatar" mode="aspectFill" />
          <view v-else class="avatar avatar-lg avatar-fallback"><PresenceIcon name="user" :size="42" /></view>
          <view class="grow">
            <text class="section-title">{{ card.name }}</text>
            <text class="muted block">{{ card.joinedAt ? tr(`${card.joinedAt.slice(0, 10)} 加入`, `Joined ${formatMemberDate(card.joinedAt)}`) : '' }}</text>
          </view>
        </view>
        <view v-if="card.interests.length" class="interested">
          <text class="sheet-label">{{ tr('兴趣', 'Interests') }}</text>
          <view class="mini-tags"><text v-for="item in card.interests" :key="item" class="mini-tag">{{ item }}</text></view>
        </view>
        <text class="sheet-label spacing">{{ tr('活动记录', 'Activity') }}</text>
        <text v-if="card.privacy === 'NONE'" class="muted block">{{ tr('该成员选择不展示活动。', 'This member does not share activity.') }}</text>
        <text v-else-if="!card.activities.length" class="muted block">{{ tr('暂无可展示的活动。', 'No activity to show yet.') }}</text>
        <view v-else class="activity-list">
          <view v-for="item in card.activities" :key="item.id" class="activity-row">
            <text>{{ item.title }}</text>
            <text class="muted">{{ item.date }} {{ item.time }}{{ item.ended ? tr(' · 已完成', ' · Done') : '' }}</text>
          </view>
        </view>
      </template>
    </BottomSheet>

    <ShareSheet :show="shareVisible" :targets="shareTargets" @close="shareVisible = false" @payload="sharePayload = $event" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import {
  fetchCommunity, fetchMembership, fetchEvents, fetchPosts, fetchMembers, fetchMemberCard,
  joinCommunity, submitPost, postComment, moderateContent, applyJoin, updatePrivacy,
  type Community, type CommunityEvent, type CommunityPost, type CommunityMember, type CommunityMembership,
  type MemberCard,
} from '@/api/skool'
import { payOrder } from '@/utils/wechat'
import { tr, isEnglish } from '@/locale'
import { communityTagLabel } from '@/utils/community-labels'
import { readCapsuleLayout } from '@/utils/capsule'
import { goLoginFor, type ShareTargetOption } from '@/utils/share'
import PresenceIcon from '@/components/PresenceIcon.vue'
import BrandCover from '@/components/BrandCover.vue'
import PageState from '@/components/PageState.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import FloatingBack from '@/components/FloatingBack.vue'
import ShareSheet from '@/components/ShareSheet.vue'

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop

const communityId = ref('')
const community = ref<Community | null>(null)
const loading = ref(true)
const loadError = ref('')
const guest = ref(!uni.getStorageSync('token'))
const membership = ref<CommunityMembership | null>(null)
const membershipBusy = ref(false)
const membershipError = ref('')
const failedImages = ref<Record<string, boolean>>({})

const joined = computed(() => Boolean(membership.value?.joined))
const managed = computed(() => Boolean(membership.value?.managed))

const tabs = computed<{ key: 'feed' | 'events' | 'members'; label: string }[]>(() => [
  { key: 'feed', label: tr('动态', 'Posts') },
  { key: 'events', label: tr('活动', 'Events') },
  { key: 'members', label: tr('成员', 'Members') },
])
type Tab = 'feed' | 'events' | 'members'
const currentTab = ref<Tab>('feed')

const posts = ref<(CommunityPost & { commentsList?: { id: string; author: { name: string; avatar: string }; content: string; time: string }[] })[]>([])
const events = ref<CommunityEvent[]>([])
const members = ref<CommunityMember[]>([])
const sectionLoading = ref<Record<Tab, boolean>>({ feed: false, events: false, members: false })
const sectionErrors = ref<Record<Tab, string>>({ feed: '', events: '', members: '' })
const eventScope = ref<'upcoming' | 'past'>('upcoming')
const memberFilter = ref<'all' | 'shared'>('all')
const expandedPosts = ref<Record<string, boolean>>({})

let refreshBusy = false

onLoad((options) => {
  communityId.value = options?.id || ''
  if (tabs.value.some(tab => tab.key === options?.tab)) currentTab.value = options?.tab as Tab
  // 主理人主页分享落地：没有 id 但有 host 时，提示从分享页进入
  if (!communityId.value && options?.host) {
    loadError.value = tr('请通过主理人分享卡片进入对应社群。', 'Open the host card to reach the right community.')
  }
})

onShow(load)

onShareAppMessage(() => ({
  title: sharePayload.value?.title || community.value?.name || tr('Full愈 · 社群', 'Full愈 · Community'),
  path: sharePayload.value?.path || `/pages/community-detail/index?id=${encodeURIComponent(communityId.value)}`,
  imageUrl: sharePayload.value?.imageUrl,
}))

// #ifdef MP-WEIXIN
onShareTimeline(() => ({
  title: sharePayload.value?.title || community.value?.name || tr('Full愈 · 社群', 'Full愈 · Community'),
  query: `id=${encodeURIComponent(communityId.value)}`,
  imageUrl: sharePayload.value?.imageUrl,
}))
// #endif

async function load() {
  if (refreshBusy) return
  if (!communityId.value) {
    loading.value = false
    if (!loadError.value) loadError.value = tr('缺少社群信息，请返回广场重新选择。', 'Community information is missing. Return to the hub and choose again.')
    return
  }
  refreshBusy = true
  loading.value = true
  loadError.value = ''
  guest.value = !uni.getStorageSync('token')
  try {
    const result = await fetchCommunity(communityId.value)
    if (!result?.id) throw new Error(tr('社群不存在或暂不可见。', 'The community does not exist or is not visible yet.'))
    community.value = result
    await loadMembership()
    await loadEvents()
    if (joined.value || managed.value) {
      await Promise.all([loadFeed(), loadMembers()])
    } else {
      posts.value = []
      members.value = []
    }
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
    refreshBusy = false
  }
}

async function loadMembership() {
  guest.value = !uni.getStorageSync('token')
  membershipError.value = ''
  membership.value = null
  if (guest.value) return
  membershipBusy.value = true
  try {
    const result = await fetchMembership(communityId.value)
    if (!result || typeof result.joined !== 'boolean') throw new Error(tr('暂时无法确认身份，请重试。', 'Could not confirm your membership. Please retry.'))
    membership.value = result
  } catch (error) {
    if (uni.getStorageSync('token')) membershipError.value = errorMessage(error)
  } finally {
    membershipBusy.value = false
  }
}

async function loadEvents() {
  sectionLoading.value.events = true
  sectionErrors.value.events = ''
  try {
    const result = await fetchEvents(communityId.value)
    if (!Array.isArray(result)) throw new Error(tr('活动数据暂不可用。', 'Event data is unavailable.'))
    events.value = result
  } catch (error) {
    sectionErrors.value.events = errorMessage(error)
  } finally {
    sectionLoading.value.events = false
  }
}

async function loadFeed() {
  if (!uni.getStorageSync('token')) return
  sectionLoading.value.feed = true
  sectionErrors.value.feed = ''
  try {
    const result = await fetchPosts(communityId.value)
    if (!Array.isArray(result)) throw new Error(tr('动态数据暂不可用。', 'Post data is unavailable.'))
    posts.value = result
  } catch (error) {
    sectionErrors.value.feed = errorMessage(error)
  } finally {
    sectionLoading.value.feed = false
  }
}

async function loadMembers() {
  if (!uni.getStorageSync('token')) return
  sectionLoading.value.members = true
  sectionErrors.value.members = ''
  try {
    const result = await fetchMembers(communityId.value)
    if (!Array.isArray(result)) throw new Error(tr('成员数据暂不可用。', 'Member data is unavailable.'))
    members.value = result
  } catch (error) {
    sectionErrors.value.members = errorMessage(error)
  } finally {
    sectionLoading.value.members = false
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : tr('网络暂不可用，请稍后重试。', 'Network unavailable. Please retry later.')
}

// ==================== 加入 / 申请 ====================

const joinVisible = ref(false)
const joinBusy = ref(false)
const joinError = ref('')

const feeLabel = computed(() => community.value?.yearlyFee ? `¥${(community.value.yearlyFee / 100).toFixed(2)}` : tr('免费', 'Free'))
const showJoinBar = computed(() => Boolean(community.value) && !community.value!.restricted && !joined.value && !managed.value)
const joinDisabled = computed(() => {
  if (membershipBusy.value || joinBusy.value) return true
  const m = membership.value
  if (!m) return false
  if (m.joinMode === 'INVITE' && !m.inviteAccess) return true
  if (m.joinMode === 'APPROVAL' && m.requestStatus === 'PENDING') return true
  return false
})
const ctaLabel = computed(() => {
  if (guest.value) return tr('登录后加入', 'Log in to join')
  const m = membership.value
  if (!m) return tr('确认加入', 'Join')
  if (m.joinMode === 'APPROVAL' && m.requestStatus === 'PENDING') return tr('等待审核', 'Awaiting review')
  if (m.joinMode === 'APPROVAL' && m.requestStatus === 'REJECTED') return tr('重新申请', 'Request again')
  if (m.joinMode === 'INVITE' && !m.inviteAccess) return tr('仅限受邀加入', 'Invite only')
  if (m.expired) return m.yearlyFee > 0 ? tr(`续费加入`, 'Renew') : tr('重新加入', 'Rejoin')
  if (m.claimedInvite) return tr('使用邀请加入', 'Join with invitation')
  if (community.value?.yearlyFee) return tr('付费加入', 'Join with payment')
  if (m.joinMode === 'APPROVAL') return tr('申请加入', 'Request to join')
  return tr('免费加入', 'Join free')
})
const joinHint = computed(() => {
  const m = membership.value
  if (guest.value) return tr('登录后按社群规则加入', 'Log in and follow the community rules')
  if (!m) return tr('加入状态以服务端确认为准', 'Membership is confirmed by the server')
  if (m.joinMode === 'INVITE' && !m.inviteAccess) return tr('需要主理人发出的邀请', 'An invitation from the host is required')
  if (m.joinMode === 'APPROVAL' && m.requestStatus === 'PENDING') return tr('主理人审核通过后即可加入', 'You can join once the host approves')
  if (m.expired) return tr('年费已到期，续费后恢复成员权益', 'Your yearly membership expired')
  return community.value?.yearlyFee ? tr('支付成功后有效期一年', 'Valid for one year after payment') : tr('直接加入，可随时退出', 'Join instantly, leave anytime')
})
const payLabel = computed(() => {
  if (!community.value) return tr('确认加入', 'Confirm')
  if (membership.value?.claimedInvite?.kind === 'WAIVER') return tr('使用免年费礼遇加入', 'Join with fee waived')
  if (community.value.yearlyFee > 0) {
    const reduce = membership.value?.claimedInvite?.kind === 'REDUCE' ? membership.value.claimedInvite.amount : 0
    return tr(`支付 ¥${(Math.max(0, community.value.yearlyFee - reduce) / 100).toFixed(2)} 并加入`, `Pay ¥${(Math.max(0, community.value.yearlyFee - reduce) / 100).toFixed(2)} and join`)
  }
  return tr('确认加入', 'Confirm join')
})
const joinCopy = computed(() => {
  if (!community.value) return ''
  const m = membership.value
  if (m?.claimedInvite) {
    return tr('本次将使用已领取的邀请权益，实际抵扣以确认后的订单为准。领取邀请不替代入群审核。', 'Your claimed invitation applies here. The final amount follows the created order. An invitation does not replace approval.')
  }
  if (m?.expired) {
    return tr('你的成员有效期已过，续费后重新获得成员权益与成员内容访问。', 'Your membership has expired. Renew to regain access to member content.')
  }
  if (community.value.yearlyFee > 0) {
    return tr(`社群年费 ${feeLabel.value}，有效期一年。确认后将调起微信支付，支付成功才算加入。`, `Annual fee ${feeLabel.value}, valid for one year. WeChat Pay opens next; membership starts after payment.`)
  }
  return tr('确认加入这个社群，与同频的人一起练习。', 'Join this community and practice with like-minded people.')
})

function onJoin() {
  if (joinBusy.value) return
  if (!uni.getStorageSync('token')) {
    goLoginFor(`/pages/community-detail/index?id=${encodeURIComponent(communityId.value)}`)
    return
  }
  const m = membership.value
  if (m?.joinMode === 'APPROVAL' && m.requestStatus !== 'APPROVED') {
    openApply()
    return
  }
  if (m?.joinMode === 'INVITE' && !m.inviteAccess) {
    uni.showToast({ title: tr('需要有效的社群邀请', 'A valid invitation is required'), icon: 'none' })
    return
  }
  joinError.value = ''
  joinVisible.value = true
}

async function confirmJoin() {
  if (joinBusy.value || !community.value) return
  joinBusy.value = true
  joinError.value = ''
  try {
    const result = await joinCommunity(communityId.value)
    if (result?.joined) {
      joinVisible.value = false
      uni.showToast({ title: tr('已加入社群', 'Joined'), icon: 'success' })
      await load()
      return
    }
    if (result?.requiresApproval) {
      joinVisible.value = false
      await loadMembership()
      uni.showToast({ title: tr('已提交申请，等待主理人审核', 'Request submitted'), icon: 'none' })
      return
    }
    if (result?.requiresInvite) {
      joinError.value = tr('该社群仅限邀请加入，请先领取有效邀请。', 'This community is invite-only. Claim a valid invitation first.')
      return
    }
    if (result?.requiresPayment && result.orderId) {
      await payOrder(result.orderId)
      joinVisible.value = false
      await waitForJoin()
      return
    }
    throw new Error(tr('加入未完成，请重试。', 'Joining did not complete. Please retry.'))
  } catch (error) {
    joinError.value = errorMessage(error)
  } finally {
    joinBusy.value = false
  }
}

async function waitForJoin() {
  uni.showLoading({ title: tr('确认支付结果…', 'Confirming payment…'), mask: true })
  try {
    for (let i = 0; i < 8; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await loadMembership()
      if (joined.value) {
        uni.hideLoading()
        uni.showToast({ title: tr('支付成功，已加入', 'Payment received. Joined.'), icon: 'success' })
        await load()
        return
      }
    }
    uni.hideLoading()
    uni.showToast({ title: tr('支付结果确认中，请稍后刷新', 'Payment is being confirmed. Refresh later.'), icon: 'none' })
    await load()
  } catch {
    uni.hideLoading()
  }
}

// ==================== 入群申请 ====================
const applyVisible = ref(false)
const applyNote = ref('')
const applyBusy = ref(false)
const applyError = ref('')

function openApply() {
  applyError.value = ''
  applyNote.value = ''
  applyVisible.value = true
}

async function submitApply() {
  if (applyBusy.value) return
  applyBusy.value = true
  applyError.value = ''
  try {
    await applyJoin(communityId.value, applyNote.value.trim() || undefined)
    applyVisible.value = false
    await loadMembership()
    uni.showToast({ title: tr('申请已提交', 'Request submitted'), icon: 'success' })
  } catch (error) {
    applyError.value = errorMessage(error)
  } finally {
    applyBusy.value = false
  }
}

const requestNotice = computed(() => {
  const m = membership.value
  if (!m || joined.value || managed.value) return ''
  if (m.joinMode === 'APPROVAL' && m.requestStatus === 'PENDING') return tr('入群申请审核中。通过后会收到通知。', 'Your join request is under review. You will be notified once approved.')
  if (m.joinMode === 'APPROVAL' && m.requestStatus === 'REJECTED') {
    return m.requestNote ? tr(`申请未通过：${m.requestNote}`, `Request declined: ${m.requestNote}`) : tr('申请未通过，可补充说明后重新申请。', 'Your request was declined. You can add a note and request again.')
  }
  if (m.joinMode === 'INVITE' && !m.inviteAccess) return tr('该社群仅限受邀加入。请向主理人索取邀请链接。', 'This community is invite-only. Ask the host for an invitation.')
  return ''
})

// ==================== 隐私与兴趣 ====================
const privacyVisible = ref(false)
const privacyDraft = ref<'NONE' | 'COMPLETED' | 'ALL'>('NONE')
const interestsDraft = ref<string[]>([])
const privacyBusy = ref(false)
const privacyError = ref('')

const privacyOptions = computed(() => [
  { value: 'NONE' as const, label: tr('不展示活动', 'Do not show activity'), desc: tr('名片与成员列表都不展示你的活动记录。', 'No activity is shown on your card or the member list.') },
  { value: 'COMPLETED' as const, label: tr('只展示已完成的活动', 'Completed events only'), desc: tr('可展示你已参加并结束的活动，不展示未开始的安排。', 'Only events you attended and that have ended.') },
  { value: 'ALL' as const, label: tr('展示全部活动', 'All events'), desc: tr('包括已报名与未开始的活动。', 'Includes registered and upcoming events.') },
])

function openPrivacy() {
  if (!membership.value) return
  privacyDraft.value = (membership.value.privacy || 'NONE') as 'NONE' | 'COMPLETED' | 'ALL'
  interestsDraft.value = [...(membership.value.interests || [])]
  privacyError.value = ''
  privacyVisible.value = true
}

function toggleInterest(item: string) {
  const index = interestsDraft.value.indexOf(item)
  if (index >= 0) {
    interestsDraft.value.splice(index, 1)
    return
  }
  if (interestsDraft.value.length >= 3) {
    uni.showToast({ title: tr('最多选择 3 个兴趣', 'Choose up to 3 interests'), icon: 'none' })
    return
  }
  interestsDraft.value.push(item)
}

async function savePrivacy() {
  const current = membership.value
  if (privacyBusy.value || !current) return
  privacyBusy.value = true
  privacyError.value = ''
  try {
    const result = await updatePrivacy(communityId.value, privacyDraft.value, interestsDraft.value)
    const latest = membership.value
    if (latest) {
      latest.privacy = result.privacy as 'NONE' | 'COMPLETED' | 'ALL'
      latest.interests = result.interests || []
    }
    privacyVisible.value = false
    uni.showToast({ title: tr('已保存', 'Saved'), icon: 'success' })
  } catch (error) {
    privacyError.value = errorMessage(error)
  } finally {
    privacyBusy.value = false
  }
}

function privacyLabel(value: string) {
  if (value === 'ALL') return tr('展示全部活动', 'All events')
  if (value === 'COMPLETED') return tr('只展示已完成的活动', 'Completed events only')
  return tr('不展示活动', 'Activity hidden')
}

// ==================== 动态 / 留言 / 治理 ====================
const composeVisible = ref(false)
const composeText = ref('')
const postBusy = ref(false)
const postError = ref('')

function openCompose() {
  postError.value = ''
  composeText.value = ''
  composeVisible.value = true
}

async function submitPostNow() {
  if (postBusy.value || !composeText.value.trim()) return
  postBusy.value = true
  postError.value = ''
  try {
    const result = await submitPost(communityId.value, composeText.value.trim())
    if (result?.success !== true) throw new Error(tr('发布未成功，请重试。', 'The post was not published. Please retry.'))
    composeVisible.value = false
    composeText.value = ''
    await loadFeed()
    uni.showToast({ title: tr('已发布', 'Published'), icon: 'success' })
  } catch (error) {
    postError.value = errorMessage(error)
  } finally {
    postBusy.value = false
  }
}

const commentVisible = ref(false)
const commentText = ref('')
const commentBusy = ref(false)
const commentError = ref('')
const commentTarget = ref<CommunityPost | null>(null)
const commentPost = computed(() => commentTarget.value)

function openComment(post: CommunityPost) {
  commentTarget.value = post
  commentText.value = ''
  commentError.value = ''
  commentVisible.value = true
}

async function submitComment() {
  if (commentBusy.value || !commentTarget.value || !commentText.value.trim()) return
  commentBusy.value = true
  commentError.value = ''
  try {
    await postComment(communityId.value, commentTarget.value.id, commentText.value.trim())
    commentVisible.value = false
    commentText.value = ''
    await loadFeed()
  } catch (error) {
    commentError.value = errorMessage(error)
  } finally {
    commentBusy.value = false
  }
}

const modVisible = ref(false)
const modTarget = ref<{ type: 'POST' | 'COMMENT'; id: string; label: string }>({ type: 'POST', id: '', label: '' })
const modAction = ref<'HIDE' | 'DELETE'>('HIDE')
const modReason = ref('')
const modBusy = ref(false)
const modError = ref('')

function openModeration(type: 'POST' | 'COMMENT', id: string, content: string) {
  modTarget.value = { type, id, label: content.length > 36 ? `${content.slice(0, 36)}…` : content }
  modAction.value = 'HIDE'
  modReason.value = ''
  modError.value = ''
  modVisible.value = true
}

async function submitModeration() {
  if (modBusy.value || !modReason.value.trim()) return
  modBusy.value = true
  modError.value = ''
  try {
    await moderateContent(communityId.value, {
      targetType: modTarget.value.type,
      targetId: modTarget.value.id,
      action: modAction.value,
      reason: modReason.value.trim(),
    })
    modVisible.value = false
    await loadFeed()
    uni.showToast({ title: tr('已处理', 'Done'), icon: 'success' })
  } catch (error) {
    modError.value = errorMessage(error)
  } finally {
    modBusy.value = false
  }
}

function commentsOf(post: CommunityPost & { commentsList?: { id: string }[] }) {
  return post.commentsList || []
}

function visibleComments(post: CommunityPost & { commentsList?: { id: string }[] }) {
  const list = commentsOf(post)
  return expandedPosts.value[post.id] ? list : list.slice(0, 3)
}

// ==================== 成员名片 ====================
const cardVisible = ref(false)
const cardBusy = ref(false)
const cardError = ref('')
const card = ref<MemberCard | null>(null)
const cardUserId = ref('')

async function openMemberCard(userId?: string) {
  if (!userId) return
  cardUserId.value = userId
  cardVisible.value = true
  card.value = null
  await reloadCard()
}

async function reloadCard() {
  if (!cardUserId.value) return
  cardBusy.value = true
  cardError.value = ''
  try {
    card.value = await fetchMemberCard(communityId.value, cardUserId.value)
  } catch (error) {
    cardError.value = errorMessage(error)
  } finally {
    cardBusy.value = false
  }
}

// ==================== 活动 ====================
const visibleEvents = computed(() => {
  const upcoming = events.value.filter(event => !event.ended).slice().sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
  const past = events.value.filter(event => event.ended).slice().sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
  return eventScope.value === 'upcoming' ? upcoming : past
})

const filteredMembers = computed(() => {
  if (memberFilter.value !== 'shared') return members.value
  const mine = membership.value?.interests || []
  if (!mine.length) return members.value
  return members.value.filter(member => (member.interests || []).some(item => mine.includes(item)))
})

function eventTypeName(type: string) {
  if (type === 'OFFLINE') return tr('线下', 'Offline')
  if (type === 'LIVE') return tr('直播', 'Live')
  return tr('线上', 'Online')
}

function eventMonth(value: string) {
  if (!isEnglish()) return value.slice(0, 7)
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value.slice(0, 7) : date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function formatMemberDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function goEvent(event: CommunityEvent) {
  uni.navigateTo({ url: `/pages/community-event-detail/index?id=${encodeURIComponent(event.id)}&cid=${encodeURIComponent(communityId.value)}` })
}

function goWorkspace() {
  uni.navigateTo({ url: `/pages/community-workspace/index?id=${encodeURIComponent(communityId.value)}` })
}

function previewImage(image: string, images: string[]) {
  if (!image || failedImages.value[image]) return
  uni.previewImage({ current: image, urls: images.filter(src => src && !failedImages.value[src]) })
}

function timeAgo(iso: string) {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000))
  if (isEnglish()) {
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes} min ago`
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`
    return iso.slice(0, 10)
  }
  return minutes < 1 ? '刚刚' : minutes < 60 ? `${minutes} 分钟前` : minutes < 1440 ? `${Math.floor(minutes / 60)} 小时前` : iso.slice(0, 10)
}

function claimLabel(value: { kind: string; name: string; amount: number }) {
  if (value.kind === 'WAIVER') return tr(`${value.name} · 免年费`, `${value.name} · Fee waived`)
  if (value.kind === 'REDUCE') return tr(`${value.name} · 立减 ¥${(value.amount / 100).toFixed(2)}`, `${value.name} · ¥${(value.amount / 100).toFixed(2)} off`)
  return value.name
}

// ==================== 分享 ====================
const shareVisible = ref(false)
const sharePayload = ref<any>(null)
const shareTargets = computed<ShareTargetOption[]>(() => {
  if (!community.value) return []
  const targets: ShareTargetOption[] = [{ type: 'community', id: community.value.id, label: tr('社群', 'Community') }]
  if (community.value.ownerUserId) targets.push({ type: 'host', id: community.value.ownerUserId, label: tr('主理人', 'Host') })
  return targets
})
</script>

<style scoped>
.nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 12rpx 32rpx 16rpx; gap: 12rpx; }
.back-spacer { width: 120rpx; }
.nav-title { font-size: 34rpx; color: var(--c-ink); }
.nav-actions { display: flex; align-items: center; gap: 12rpx; }
.icon-button { width: 68rpx; height: 68rpx; padding: 0; display: flex; align-items: center; justify-content: center; background: var(--c-card-2); border-radius: 50%; transform: rotate(45deg); }
.text-button { background: transparent; color: var(--c-brown); font-size: 26rpx; padding: 8rpx 4rpx; }
.hero { width: 100%; }
.hero-image { width: 100%; height: 360rpx; display: block; }
.content { padding: 24rpx 32rpx calc(200rpx + env(safe-area-inset-bottom)); }
.info-card { display: flex; flex-direction: column; gap: 12rpx; }
.title-row { display: flex; align-items: center; gap: 12rpx; flex-wrap: wrap; }
.community-name { font-size: 44rpx; line-height: 1.35; color: var(--c-ink); }
.badge { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 14rpx; background: var(--c-card-2); color: var(--c-primary); }
.badge.gold { background: #fbf1df; color: #8a5a17; }
.slogan { font-size: 26rpx; line-height: 1.7; color: var(--c-muted); }
.tags { display: flex; flex-wrap: wrap; gap: 10rpx; }
.tag { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 16rpx; background: var(--c-card-2); color: var(--c-primary); }
.tag.gold { background: #fbf1df; color: #8a5a17; }
.tag.muted { background: #eee9dc; color: var(--c-muted); }
.stats { display: flex; gap: 16rpx; margin-top: 8rpx; }
.stat { flex: 1; background: var(--c-card-2); border-radius: 20rpx; padding: 16rpx; display: flex; flex-direction: column; gap: 2rpx; }
.stat-value { font-size: 32rpx; color: var(--c-ink); }
.stat-value.fee { color: var(--c-brown); }
.muted { color: var(--c-muted); }
.block { display: block; }
.owner-row { display: flex; align-items: center; gap: 16rpx; padding-top: 16rpx; border-top: 1rpx solid var(--line-soft); margin-top: 8rpx; }
.avatar { width: 76rpx; height: 76rpx; border-radius: 50%; flex-shrink: 0; }
.avatar-fallback { display: flex; align-items: center; justify-content: center; background: var(--c-card-2); }
.avatar-lg { width: 112rpx; height: 112rpx; }
.grow { flex: 1; min-width: 0; }
.notice { display: flex; gap: 12rpx; align-items: flex-start; background: var(--c-card-2); border-radius: 24rpx; padding: 22rpx 26rpx; margin-bottom: 20rpx; font-size: 24rpx; line-height: 1.7; color: var(--c-muted); }
.notice.restricted { background: #fbf1df; color: #7a4c12; }
.notice.warn { background: #f7e9e4; color: var(--c-error); }
.privacy-row { width: 100%; display: flex; align-items: center; gap: 14rpx; text-align: left; }
.tabs { display: flex; gap: 8rpx; background: var(--c-card-2); border-radius: 24rpx; padding: 6rpx; margin-bottom: 20rpx; }
.tab { flex: 1; min-height: 68rpx; border-radius: 20rpx; background: transparent; color: var(--c-muted); font-size: 26rpx; }
.tab.active { background: var(--c-card); color: var(--c-primary); font-weight: 600; }
.tab-content { display: flex; flex-direction: column; }
.about { display: flex; flex-direction: column; gap: 10rpx; }
.long-text { font-size: 27rpx; line-height: 1.9; color: var(--c-ink); white-space: pre-wrap; }
.compose-card { display: flex; flex-direction: column; gap: 8rpx; }
.compose-trigger { display: flex; align-items: center; gap: 14rpx; background: var(--c-card-2); border-radius: 24rpx; padding: 22rpx 26rpx; color: var(--c-muted); text-align: left; }
.compose-trigger text { flex: 1; }
.compose-hint { font-size: 22rpx; line-height: 1.6; }
.posts-card { padding: 28rpx 30rpx; }
.post { padding-bottom: 22rpx; border-bottom: 1rpx solid var(--line-soft); }
.post:last-child { border-bottom: none; padding-bottom: 0; }
.post + .post { padding-top: 24rpx; }
.post-head { display: flex; align-items: center; gap: 16rpx; }
.avatar-button { padding: 0; background: transparent; width: 76rpx; height: 76rpx; border-radius: 50%; }
.post-name { font-size: 28rpx; color: var(--c-ink); }
.post-text { display: block; margin-top: 14rpx; }
.post-images { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 14rpx; }
.post-image-tile { width: calc(33.33% - 7rpx); border-radius: 16rpx; overflow: hidden; }
.post-image { width: 100%; height: 184rpx; display: block; }
.comments { margin-top: 14rpx; background: var(--c-card-2); border-radius: 18rpx; padding: 14rpx 18rpx; display: flex; flex-direction: column; gap: 8rpx; }
.comment-row { display: flex; align-items: baseline; gap: 8rpx; flex-wrap: wrap; font-size: 24rpx; line-height: 1.7; }
.comment-name { color: var(--c-brown); font-weight: 500; }
.comment-text { color: var(--c-ink); flex: 1; min-width: 0; }
.moderate-inline { background: transparent; font-size: 22rpx; color: var(--c-error); padding: 0 4rpx; }
.expand-comments { background: transparent; color: var(--c-brown); font-size: 23rpx; padding: 6rpx 0; text-align: left; }
.post-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 12rpx; font-size: 23rpx; }
.comment-trigger { display: flex; align-items: center; gap: 6rpx; background: transparent; color: var(--c-brown); font-size: 23rpx; padding: 4rpx 8rpx; }
.moderate-button { background: transparent; color: var(--c-muted); font-size: 22rpx; padding: 4rpx 8rpx; }
.event-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12rpx; }
.event-list { display: flex; flex-direction: column; gap: 16rpx; }
.event-card { display: flex; align-items: center; gap: 18rpx; width: 100%; text-align: left; margin-bottom: 0; }
.date-block { width: 96rpx; flex-shrink: 0; text-align: center; background: var(--c-card-2); border-radius: 20rpx; padding: 12rpx 0; }
.date-day { display: block; font-size: 40rpx; color: var(--c-primary); line-height: 1.2; }
.date-month { display: block; font-size: 20rpx; color: var(--c-muted); }
.event-title-row { display: flex; align-items: center; gap: 8rpx; flex-wrap: wrap; }
.event-title { font-size: 30rpx; color: var(--c-ink); }
.member-filter { display: flex; gap: 12rpx; margin-bottom: 16rpx; }
.filter-chip { padding: 10rpx 24rpx; border-radius: 30rpx; background: var(--c-card-2); color: var(--c-muted); font-size: 24rpx; }
.filter-chip.active { background: var(--c-primary); color: var(--c-rice); }
.members-card { padding: 8rpx 30rpx; }
.member-row { display: flex; align-items: center; gap: 16rpx; width: 100%; text-align: left; padding: 20rpx 0; border-bottom: 1rpx solid var(--line-soft); background: transparent; }
.member-row:last-child { border-bottom: none; }
.mini-tags { display: flex; flex-wrap: wrap; gap: 8rpx; margin-top: 6rpx; }
.mini-tag { font-size: 21rpx; padding: 2rpx 12rpx; border-radius: 12rpx; background: var(--c-card-2); color: var(--c-brown); }
.member-total { display: block; text-align: center; font-size: 23rpx; margin-top: 8rpx; }
.bottom-action { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: var(--c-card); border-top: 1rpx solid var(--line-soft); display: flex; align-items: center; gap: 20rpx; z-index: 50; }
.fee { font-size: 34rpx; color: var(--c-brown); }
.primary-button { min-height: 84rpx; padding: 0 36rpx; border-radius: var(--radius-button); background: var(--c-primary); color: var(--c-rice); font-size: 27rpx; display: flex; align-items: center; justify-content: center; }
.primary-button[disabled] { background: #e9e4d4; color: var(--c-muted); }
.full-width { width: 100%; }
.claim-line { display: flex; align-items: center; gap: 10rpx; background: #fbf1df; color: #7a4c12; border-radius: 18rpx; padding: 16rpx 20rpx; font-size: 24rpx; margin-top: 12rpx; }
.sheet-label { display: block; font-size: 26rpx; color: var(--c-ink); margin-bottom: 10rpx; }
.sheet-label.spacing { margin-top: 20rpx; }
.option-list { display: flex; flex-direction: column; gap: 12rpx; }
.option { width: 100%; text-align: left; background: var(--c-card-2); border: 2rpx solid transparent; border-radius: 20rpx; padding: 18rpx 22rpx; display: flex; flex-direction: column; gap: 4rpx; }
.option.active { border-color: var(--c-primary); background: #fbf1df; }
.option-title { font-size: 28rpx; color: var(--c-ink); }
.option-desc { font-size: 22rpx; line-height: 1.6; color: var(--c-muted); }
.interest-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.interest-chip { padding: 10rpx 22rpx; border-radius: 26rpx; background: var(--c-card-2); color: var(--c-muted); font-size: 24rpx; }
.interest-chip.active { background: var(--c-primary); color: var(--c-rice); }
.sheet-textarea { width: 100%; min-height: 180rpx; margin-top: 16rpx; padding: 20rpx 24rpx; border-radius: 20rpx; background: var(--c-card-2); font-size: 27rpx; line-height: 1.7; color: var(--c-ink); }
.counter { display: block; text-align: right; font-size: 22rpx; margin-top: 6rpx; }
.error-text { display: block; margin-top: 12rpx; font-size: 24rpx; color: var(--c-error); }
.quote { display: block; margin-top: 12rpx; padding: 16rpx 20rpx; border-left: 4rpx solid var(--line-soft); background: var(--c-card-2); border-radius: 12rpx; font-size: 24rpx; color: var(--c-muted); }
.card-head { display: flex; align-items: center; gap: 20rpx; }
.interested { margin-top: 20rpx; }
.activity-list { display: flex; flex-direction: column; gap: 14rpx; margin-top: 10rpx; }
.activity-row { display: flex; flex-direction: column; gap: 2rpx; padding: 14rpx 18rpx; background: var(--c-card-2); border-radius: 16rpx; font-size: 25rpx; }
</style>
