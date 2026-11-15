import { t } from './locale'

/**
 * 小程序版本更新提示。
 * 文案统一走 t()：更新弹窗会在冷启动首屏弹出，写死中文会让英文用户在这里看到中文。
 * 非微信端 uni.getUpdateManager 不存在，直接跳过，不影响冷启动。
 */
export function initUpdateCheck() {
	let updateManager = null
	try {
		updateManager = uni.getUpdateManager()
	} catch (error) {
		return
	}
	if (!updateManager) return

	updateManager.onCheckForUpdate((res) => {
		if (!res || !res.hasUpdate) return
		updateManager.onUpdateReady(() => {
			uni.showModal({
				title: t('更新提示'),
				content: t('新版本已经准备好，是否重启应用？'),
				showCancel: false,
				success(r) {
					if (r.confirm) {
						// 新版本已下载完成，重启应用生效
						updateManager.applyUpdate()
					}
				}
			})
		})
	})

	updateManager.onUpdateFailed(() => {
		uni.showModal({
			title: t('已经有新版本了哟~'),
			content: t('新版本已经上线啦~，请您删除当前小程序，重新搜索打开哟~'),
			showCancel: false
		})
	})
}