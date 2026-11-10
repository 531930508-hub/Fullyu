<script>
	const onLaunch = function() {
    console.log('检测版本更新')
		//#ifdef MP-WEIXIN
		// 检测更新
		let options = wx.getLaunchOptionsSync()
		console.log(options)
		if (options && options.scene === 1037 && options.referrerInfo) {
			const {
				appId,
				extraData
			} = options.referrerInfo;
			console.log('来源小程序AppID:', appId, '附加数据:', extraData);
		}

		const updateManager = uni.getUpdateManager();

		updateManager.onCheckForUpdate(function(res) {
			// 请求完新版本信息的回调
			console.log("是否有新版本：" + res.hasUpdate);
			if (res.hasUpdate) {
				updateManager.onUpdateReady(function() {
					uni.showModal({
						title: '更新提示',
						content: '新版本已经准备好，是否重启应用？',
						showCancel: false,
						success(r) {
							if (r.confirm) {
								// 新的版本已经下载好，调用 applyUpdate 应用新版本并重启
								updateManager.applyUpdate();
							}
						}
					});
				});
			}
		});

		updateManager.onUpdateFailed(function(res) {
			uni.showModal({
				title: '已经有新版本了哟~',
				showCancel: false,
				content: '新版本已经上线啦~，请您删除当前小程序，重新搜索打开哟~'
			})
		})
		//#endif
	}
	const onShow = function() {}
	const onHide = function() {}
  export default {onLaunch,onShow,onHide}
</script>

<style lang="scss">
	@import 'tailwindcss/base';
	@import 'tailwindcss/utilities';
	@import 'tailwindcss/components';

	/* 全局样式 */
	page {
		font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Segoe UI, Arial, Roboto, 'PingFang SC', 'miui', 'Hiragino Sans GB', 'Microsoft Yahei', sans-serif;
		background-color: #F6F6F6;
		color: #333;
		font-size: 28rpx;
		line-height: 1.5;
		box-sizing: border-box;
	}

	/* 去除默认边距 */
	view,
	text,
	navigator,
	input,
	textarea {
		box-sizing: border-box;
		padding: 0;
		margin: 0;
	}

	/* 主题色 */
	.primary-color {
		color: #584219;
	}

	.primary-bg {
		background-color: #584219;
	}

	/* 通用边框 */
	.border-bottom {
		border-bottom: 1px solid #f5f5f5;
	}

	/* 通用间距 */
	.padding {
		padding: 30rpx;
	}

	.margin-top {
		margin-top: 20rpx;
	}

	.margin-bottom {
		margin-bottom: 20rpx;
	}

	/* 通用卡片样式 */
	.card {
		background-color: #fff;
		border-radius: 32upx;
		overflow: hidden;
		margin: 20rpx;
	}

	.uni-modal {
		.uni-modal__btn-area {
			flex-direction: column !important;
		}

		.uni-modal__btn {
			background-color: transparent !important;
			width: 100% !important;
			border-top: 1rpx solid #eee !important;
			border-right: none !important;
		}
	}

	button {
		line-height: initial !important;
	}

	button:after {
		border: 0 !important;
	}

	.action-buttons {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 24upx;
		margin-top: 32upx;
		padding-top: 32upx;
		border-top: 2upx dashed #0000000F;
	}

	.btn,
	button {
		padding: 12upx 32upx;
		border-radius: 16upx;
		font-size: 28upx;
		text-align: center;

		&.btn-cancel {
			background-color: #fff;
			color: #584219;
			border: 2upx solid #584219;


			&:active {
				background-color: #f5f5f5;
			}
		}

		&.btn-modify {
			border: 2upx solid #584219;
			background-color: #584219;
			color: #fff;

			&:active {
				background-color: #4a3617;
			}
		}

		&.btn-review {
			background-color: #fff;
			color: #584219;
			border: 2upx solid #584219;

			&:active {
				background-color: #f9f7f4;
			}
		}
	}
</style>
