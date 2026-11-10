<template>
	<view class="st-page">
		<view class="st-head">
			<text class="st-eyebrow">FULL YU MEMBER</text>
			<view class="st-title-row">
				<text class="st-title serif">{{ tt('会员故事', 'Member stories') }}</text>
				<button class="st-lang" @click="toggleLocale">{{ lang === 'en' ? '中' : 'EN' }}</button>
			</view>
			<text class="st-lead">{{ tt('从会员的建议开始，一点一点把轻疗、时叙、在场变成大家想要的样子。', 'Starting from member feedback, we are shaping Light Heal, Teahour and Presence into the places you want them to be.') }}</text>
		</view>

		<view v-if="loading" class="st-state">{{ tt('正在读会员故事…', 'Loading member stories…') }}</view>
		<view v-else-if="error" class="st-state">
			<text>{{ error }}</text>
			<button class="st-btn" @click="load">{{ tt('重新加载', 'Reload') }}</button>
		</view>
		<view v-else-if="!stories.length" class="st-state">{{ tt('第一批会员故事正在整理中。', 'The first member stories are being prepared.') }}</view>

		<template v-else>
			<view v-for="item in stories" :key="item.id" class="st-card">
				<view class="st-card-head">
					<text class="st-card-title serif">{{ item.title }}</text>
					<text v-if="businessLabel(item.business)" class="st-tag">{{ businessLabel(item.business) }}</text>
				</view>
				<text v-if="item.quote" class="st-quote">
					“{{ item.quote }}”<text v-if="item.quoteBy" class="st-by"> —— {{ item.quoteBy }}</text>
				</text>
				<text class="st-body">{{ item.story }}</text>
				<text v-if="item.publishedAt" class="st-date">{{ formatDate(item.publishedAt) }}</text>
			</view>
		</template>

		<view class="st-foot">
			<text>{{ tt('放松有道　自在生活', 'Relax with intention. Live at ease.') }}</text>
			<text class="st-foot-sub">{{ tt('Full愈 · 轻疗', 'Full Yu · Light Heal') }}</text>
		</view>
	</view>
</template>

<script setup>
	import {
		ref
	} from 'vue'
	import {
		onLoad
	} from '@dcloudio/uni-app'
	import {
		formatDate,
		loadStories
	} from '../../../api/brandMember'
	import { useLocale } from '../../../utils/locale'

	const { lang, tt, toggleLocale, syncLocale } = useLocale()

	const loading = ref(true)
	const error = ref('')
	const stories = ref([])

	/** CRM 故事可能带内部键或对外键，这里都映射成门店名。 */
	function businessLabel(business) {
		const labels = lang.value === 'en' ? {
			retreat: 'Light Heal',
			ql: 'Light Heal',
			teahour: 'Teahour',
			sx: 'Teahour',
			presence: 'Presence',
			zc: 'Presence'
		} : {
			retreat: '轻疗',
			ql: '轻疗',
			teahour: '时叙',
			sx: '时叙',
			presence: '在场',
			zc: '在场'
		}
		return (business && labels[business]) || ''
	}

	async function load() {
		loading.value = true
		error.value = ''
		try {
			const res = await loadStories()
			stories.value = res && Array.isArray(res.stories) ? res.stories : []
		} catch (e) {
			stories.value = []
			// 接口只对有效会员开放；网络失败与权限失败不再细分，同一句可重试提示。
			error.value = tt('会员故事暂时没读到。会员故事仅对有效会员开放，稍后可以再试。', 'Member stories are unavailable. They are open to active members only. Please try again later.')
		} finally {
			loading.value = false
		}
	}

	onLoad(() => {
		load()
	})
</script>

<style lang="less" scoped>
	.st-page {
		min-height: 100vh;
		background: #F6F4F2;
		color: #3B3128;
		padding: 24rpx 40rpx 96rpx;
		box-sizing: border-box;
	}

	.st-head {
		padding: 24rpx 0 8rpx;
	}

	.st-eyebrow {
		display: block;
		font-size: 20rpx;
		letter-spacing: 4rpx;
		color: #8A6A40;
	}

	.st-title-row { display: flex; align-items: center; justify-content: space-between; }
	.st-lang { min-width: 64rpx; height: 48rpx; line-height: 48rpx; padding: 0 16rpx; border: none; border-radius: 999rpx; background: #EDE4D2; color: #584219; font-size: 22rpx; }
	.st-lang::after { border: none; }

	.st-title {
		display: block;
		margin-top: 12rpx;
		font-family: SourceHanSerifSC, 'Songti SC', serif;
		font-size: 44rpx;
		line-height: 1.4;
		letter-spacing: 0.06em;
	}

	.st-lead {
		display: block;
		margin-top: 20rpx;
		font-size: 26rpx;
		line-height: 1.9;
		color: #5A4B3C;
		letter-spacing: 0.05em;
	}

	.st-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20rpx;
		margin-top: 60rpx;
		padding: 60rpx 24rpx;
		font-size: 25rpx;
		line-height: 1.8;
		color: #8A6A40;
		text-align: center;
		letter-spacing: 0.05em;
	}

	.st-btn {
		padding: 0 36rpx;
		height: 72rpx;
		line-height: 72rpx;
		font-size: 24rpx;
		color: #3B3128;
		border: 1rpx solid #E3DBCC;
		border-radius: 999rpx;
		background: #FFFFFF;
	}

	.st-card {
		margin-top: 28rpx;
		padding: 32rpx 30rpx;
		border-radius: 20rpx;
		background: #FFFFFF;
	}

	.st-card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16rpx;
	}

	.st-card-title {
		font-size: 30rpx;
		line-height: 1.5;
		color: #584219;
		letter-spacing: 0.06em;
	}

	.st-tag {
		flex: none;
		margin-top: 4rpx;
		padding: 2rpx 14rpx;
		font-size: 19rpx;
		letter-spacing: 0.08em;
		color: #A5742F;
		border: 1rpx solid #E4C892;
		border-radius: 999rpx;
	}

	.st-quote {
		display: block;
		margin-top: 18rpx;
		padding-left: 18rpx;
		border-left: 4rpx solid #E4C892;
		font-size: 24rpx;
		line-height: 1.8;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.st-by {
		font-size: 20rpx;
		color: #B7A88F;
	}

	.st-body {
		display: block;
		margin-top: 18rpx;
		font-size: 24rpx;
		line-height: 1.9;
		color: #3B3128;
		letter-spacing: 0.05em;
		white-space: pre-wrap;
	}

	.st-date {
		display: block;
		margin-top: 18rpx;
		font-size: 19rpx;
		color: #B7A88F;
	}

	.st-foot {
		margin-top: 56rpx;
		padding-top: 24rpx;
		border-top: 1rpx solid #E3DBCC;
		text-align: center;
		font-family: SourceHanSerifSC, 'Songti SC', serif;
		font-size: 24rpx;
		letter-spacing: 0.06em;
		color: #8A6A40;
	}

	.st-foot-sub {
		display: block;
		margin-top: 8rpx;
		font-family: inherit;
		font-size: 19rpx;
		letter-spacing: 0.12em;
		color: #B7A88F;
	}
</style>
