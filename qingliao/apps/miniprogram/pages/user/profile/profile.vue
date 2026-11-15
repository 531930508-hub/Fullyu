<template>
	<view class="pf-page">
		<!-- 导航高度 = 状态栏 + 导航条（导航条由胶囊位置算出），body 按总高度让位，避免白框压到标题 -->
		<view class="pf-nav" :style="{ paddingTop: statusBar + 'px' }">
			<view class="pf-nav-row" :style="{ height: navBar + 'px' }">
				<image class="pf-back" src="/static/icons/leftjiantou.png" mode="aspectFit" @click="goBack"></image>
				<text class="pf-nav-title">{{ tt('个人资料', 'My profile') }}</text>
			</view>
		</view>

		<view class="pf-body" :style="{ paddingTop: (statusBar + navBar + 12) + 'px' }">
			<view v-if="loading" class="pf-state">{{ tt('正在读取资料', 'Loading your profile') }}</view>

			<template v-else>
				<view class="pf-card">
					<view class="pf-row">
						<text class="pf-label">{{ tt('头像', 'Photo') }}</text>
						<button class="pf-avatar-btn" open-type="chooseAvatar" @chooseavatar="chooseAvatar">
							<image class="pf-avatar" :src="avatarPreview" mode="aspectFill"></image>
							<view class="pf-avatar-side">
								<text class="pf-avatar-tip">{{ tt('点击更换头像', 'Tap to change') }}</text>
							</view>
						</button>
					</view>

					<view class="pf-row">
						<text class="pf-label">{{ tt('昵称', 'Nickname') }}</text>
						<input class="pf-input" type="nickname" v-model="form.nickname" :maxlength="20"
							:placeholder="tt('请输入昵称', 'Enter a nickname')" />
					</view>

					<view class="pf-row">
						<text class="pf-label">{{ tt('性别', 'Gender') }}</text>
						<view class="pf-gender">
							<view class="pf-gender-opt" :class="{ on: form.gender === '1' }"
								@click="form.gender = '1'">{{ tt('男', 'Male') }}</view>
							<view class="pf-gender-opt" :class="{ on: form.gender === '2' }"
								@click="form.gender = '2'">{{ tt('女', 'Female') }}</view>
						</view>
					</view>

					<view class="pf-row last">
						<text class="pf-label">{{ tt('生日', 'Birthday') }}</text>
						<picker mode="date" :value="form.birthday || todayText" start="1920-01-01" :end="todayText"
							@change="onBirthday">
							<view class="pf-picker" :class="{ empty: !form.birthday }">
								{{ form.birthday || tt('请选择生日，用于生日礼遇', 'Select your birthday for perks') }}
							</view>
						</picker>
					</view>
				</view>

				<button class="pf-save" :disabled="saving" @click="save">
					{{ saving ? tt('保存中...', 'Saving...') : tt('保存', 'Save') }}
				</button>
			</template>
		</view>
	</view>
</template>

<script setup>
	import { ref, computed } from 'vue'
	import { onLoad, onShow } from '@dcloudio/uni-app'
	import customerApi from '../../../api/customer'
	import cookie from '../../../utils/cookieUtil'
	import { uploadAvatar } from '../../../api/upload'
	import { img } from '../../../utils/image'
	import { useLocale } from '../../../utils/locale'

	const { tt } = useLocale()

	const statusBar = ref(0)
	// 导航条高度：H5 没有胶囊，按 44px 常规导航给值；小程序用胶囊位置换算，避免状态栏被重复计算
	const navBar = ref(44)
	const loading = ref(true)
	const saving = ref(false)

	const form = ref({ nickname: '', avatarValue: '', gender: '', birthday: '' })
	// 选完头像先用本地临时路径做预览，上传成功再把 key 记下来
	const preview = ref('')
	const DEFAULT_AVATAR = '/static/icons/morenlogo.png'
	const pad = (n) => (n < 10 ? '0' + n : '' + n)
	const now = new Date()
	const todayText = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

	/**
	 * 头像地址有三种形态：本地临时文件、会员中心/OSS 直出地址、历史遗留的 OSS key。
	 * 前两种直接展示；key 在端上拼不出地址，先落默认头像，避免 image 组件报错。
	 */
	const toDisplay = (value) => {
		if (!value) {
			return DEFAULT_AVATAR
		}
		if (value.startsWith('wxfile://') || value.startsWith('http') || value.startsWith('/static')) {
			return img(value, 160) || DEFAULT_AVATAR
		}
		return DEFAULT_AVATAR
	}

	const avatarPreview = computed(() => {
		if (preview.value) {
			return preview.value
		}
		return toDisplay(form.value.avatarValue || cookie.getAvatar())
	})

	onLoad(() => {
		// #ifdef MP-WEIXIN
		const custom = wx.getMenuButtonBoundingClientRect()
		const systemInfo = uni.getSystemInfoSync()
		const statusBarHeight = systemInfo.statusBarHeight || 0
		statusBar.value = statusBarHeight
		if (custom && custom.height) {
			navBar.value = (custom.top - statusBarHeight) * 2 + custom.height
		}
		// #endif
	})

	onShow(() => {
		load()
	})

	/** 读取资料：优先走会员中心，CRM 不可用时后端回落本地库，页面总能打开 */
	const load = async () => {
		loading.value = true
		try {
			const customer = await customerApi.getProfile()
			applyCustomer(customer)
			preview.value = ''
		} catch (error) {
			// 请求层已经弹过提示，这里只落回本地缓存，避免空白页
			applyCustomer({
				nickname: cookie.getNickname(),
				avatar: cookie.getAvatar(),
				gender: cookie.getGender()
			})
		} finally {
			loading.value = false
		}
	}

	const applyCustomer = (customer) => {
		const raw = customer || {}
		const birthday = raw.birthday ? String(raw.birthday).slice(0, 10) : ''
		form.value = {
			nickname: raw.nickname || '',
			avatarValue: raw.avatar || '',
			gender: raw.gender === 1 || raw.gender === '1' ? '1' : raw.gender === 2 || raw.gender === '2' ? '2' : '',
			birthday
		}
	}

	const onBirthday = (e) => {
		form.value.birthday = e.detail.value
	}

	const chooseAvatar = async (e) => {
		const tempPath = e.detail && e.detail.avatarUrl
		if (!tempPath) {
			return
		}
		preview.value = tempPath
		try {
			form.value.avatarValue = await uploadAvatar(tempPath)
		} catch (error) {
			// 上传失败：退回原来的头像，保住之前已经保存的资料
			preview.value = ''
			form.value.avatarValue = cookie.getAvatar() || ''
		}
	}

	const save = async () => {
		if (saving.value) {
			return
		}
		const nickname = (form.value.nickname || '').trim()
		if (!nickname) {
			uni.showToast({ title: tt('请填写昵称', 'Please enter a nickname'), icon: 'none' });
			return
		}
		saving.value = true
		try {
			const payload = {
				nickname,
				gender: form.value.gender || null,
				birthday: form.value.birthday || null
			}
			if (form.value.avatarValue) {
				payload.avatar = form.value.avatarValue
			}
			const customer = await customerApi.updateProfile(payload)
			cookie.saveAuth(customer)
			applyCustomer(customer)
			preview.value = ''
			uni.showToast({ title: tt('已保存', 'Saved'), duration: 2000 });
		} catch (error) {
			// 版本冲突（会员中心刚被改过）或服务不可用：重新读一遍，让顾客看到当前真实资料
			await load()
		} finally {
			saving.value = false
		}
	}

	const goBack = () => {
		uni.navigateBack({ delta: 1 })
	}
</script>

<style lang="less" scoped>
	.pf-page {
		min-height: 100vh;
		background: #EAE0D7;
		color: #584219;
	}

	.pf-nav {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 99;
		background: #EAE0D7;
	}

	.pf-nav-row {
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.pf-back {
		position: absolute;
		left: 24rpx;
		width: 64rpx;
		height: 64rpx;
	}

	.pf-nav-title {
		font-size: 32rpx;
		font-weight: 600;
	}

	.pf-body {
		padding: 24rpx 32rpx 200rpx;
		box-sizing: border-box;
	}

	.pf-state {
		padding: 120rpx 0;
		text-align: center;
		font-size: 28rpx;
		color: #8A6A40;
	}

	.pf-card {
		background: #fff;
		border-radius: 24rpx;
		padding: 8rpx 28rpx;
	}

	.pf-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 112rpx;
		padding: 20rpx 0;
		border-bottom: 1rpx solid #E6E2DC;
	}

	.pf-row.last {
		border-bottom: none;
	}

	.pf-label {
		width: 120rpx;
		font-size: 28rpx;
		flex-shrink: 0;
	}

	.pf-input {
		flex: 1;
		padding-left: 32rpx;
		text-align: right;
		font-size: 28rpx;
		color: #584219;
	}

	.pf-avatar-btn {
		display: flex;
		align-items: center;
		flex: 1;
		justify-content: flex-end;
		padding: 0;
		margin: 0;
		background: transparent;
		line-height: 1.2;
	}

	.pf-avatar-btn::after {
		border: none;
	}

	.pf-avatar {
		width: 96rpx;
		height: 96rpx;
		border-radius: 50%;
		background: #F6F4F2;
	}

	.pf-avatar-side {
		margin-left: 20rpx;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: flex-end;
	}

	.pf-avatar-tip {
		font-size: 26rpx;
		color: #8A6A40;
	}

	.pf-gender {
		display: flex;
		justify-content: flex-end;
		flex: 1;
	}

	.pf-gender-opt {
		min-width: 120rpx;
		margin-left: 20rpx;
		padding: 12rpx 0;
		text-align: center;
		font-size: 26rpx;
		border-radius: 999rpx;
		border: 1rpx solid #E6E2DC;
		color: #8A6A40;
		background: #fff;
	}

	.pf-gender-opt.on {
		background: #8A6A40;
		border-color: #8A6A40;
		color: #fff;
	}

	.pf-picker {
		flex: 1;
		text-align: right;
		font-size: 28rpx;
	}

	.pf-picker.empty {
		color: #B3A28C;
	}

	.pf-save {
		position: fixed;
		left: 32rpx;
		right: 32rpx;
		bottom: calc(40rpx + env(safe-area-inset-bottom));
		display: flex;
		align-items: center;
		justify-content: center;
		height: 96rpx;
		padding: 0;
		line-height: 1;
		box-sizing: border-box;
		border-radius: 999rpx;
		background: #8A6A40;
		color: #fff;
		font-size: 30rpx;
	}

	.pf-save::after {
		border: none;
	}

	.pf-save[disabled] {
		opacity: 0.6;
	}
</style>