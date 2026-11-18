<script>
	import { initUpdateCheck } from './utils/updateCheck'
	import { initTracking } from './utils/tracking'

	const onLaunch = function() {
		// 埋点会话初始化 + 失败队列补发（静默，不阻塞启动）
		initTracking()
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

		// 版本更新提示（文案走 utils/locale，随语言切换）
		initUpdateCheck()
		//#endif
	}
	const onShow = function() {}
	const onHide = function() {}
	const globalData={
		indexBanner:0,//首页弹出框0第一次，1标识谈过了
		indexLocation:0,//定位初始值0,1标识手动选择了
		indexLocationCity:'',//手动选择的城市,
		orderShowIndex:0,//订单页面返回时不自动现在第一项
	}
  export default {onLaunch,onShow,onHide,globalData}
</script>

<style lang="scss">
	@import 'tailwindcss/base';
	@import 'tailwindcss/utilities';
	@import 'tailwindcss/components';
	/* 引用特殊字体 */
	/* @font-face {
	  font-family: 'SourceHanSerifSC';
	  src: url('/static/fonts/0ouwJLuzK0mb.woff');
	} */

	/* 全局样式 */
	page {
		font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue',Helvetica, Segoe UI, Arial, Roboto, 'PingFang SC', 'miui', 'Hiragino Sans GB', 'Microsoft Yahei', sans-serif;
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

	/* 去掉微信 button 默认的 2.5555 行高；!important 会覆盖页面里的 line-height，
	   所以固定高度的 button 一律用 flex + align-items:center 居中，不要靠 line-height。 */
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
	.locale-en {
		--en-tracking: 0.05em;
		--en-title-tracking: 0.06em;
		--en-label-tracking: 0.12em;
		font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
		letter-spacing: var(--en-tracking);
		word-break: normal;
		overflow-wrap: break-word;
	}

	.locale-en view,
	.locale-en text,
	.locale-en button,
	.locale-en input,
	.locale-en textarea {
		letter-spacing: var(--en-tracking) !important;
		word-break: normal;
		overflow-wrap: break-word;
	}

	.locale-en .modal-title,
	.locale-en .treatment-name,
	.locale-en .booking-service-name,
	.locale-en .bm-title,
	.locale-en .st-title,
	.locale-en .rules-title {
		letter-spacing: var(--en-title-tracking) !important;
		line-height: 1.4;
	}

	.locale-en .st-eyebrow,
	.locale-en .rules-eyebrow,
	.locale-en .year-card-eyebrow,
	.locale-en .bmc-eyebrow {
		letter-spacing: var(--en-label-tracking) !important;
	}

	.locale-en button {
		min-width: 0;
		max-width: 100%;
		font-size: 26rpx;
		white-space: normal;
		line-height: 1.4 !important;
	}

	.locale-en .tab-nav {
		height: auto;
		min-height: 88rpx;
	}

	.locale-en .tab-item {
		min-width: 0;
		padding: 20rpx 8rpx;
		white-space: normal;
		text-align: center;
		line-height: 1.35;
	}

	.locale-en .action-buttons {
		flex-wrap: wrap;
		gap: 16rpx;
	}

	.locale-en .action-buttons button,
	.locale-en .action-buttons > .btn,
	.locale-en .action-buttons > .review-button-container {
		flex: 1 1 160rpx;
		height: auto;
		min-height: 80rpx;
		padding: 16rpx 20rpx;
	}

	.locale-en .modal-title {
		min-width: 0;
		flex: 1;
		padding-right: 20rpx;
	}

	.locale-en .treatment-types {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12rpx;
	}

	.locale-en .treatment-type {
		width: auto;
		min-width: 0;
		min-height: 88rpx;
		padding: 12rpx 8rpx;
		justify-content: center;
	}

	.locale-en .treatment-name {
		font-size: 26rpx;
		white-space: normal;
		text-align: center;
	}

	.locale-en .form-label,
	.locale-en .date-name,
	.locale-en .duration-description {
		line-height: 1.5;
	}

	.locale-en .booking-footer > view:first-child {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 16rpx;
		font-size: 24rpx;
	}

	.locale-en .booking-footer > view:first-child > view {
		width: auto;
	}

	.locale-en .booking-footer > view:nth-child(2) {
		height: auto;
		min-height: 80rpx;
		padding: 12rpx 0;
		margin-top: 0 !important;
		gap: 16rpx;
		align-items: flex-start;
	}

	.locale-en .payment-footer {
		align-items: center;
		padding-left: 32rpx;
		padding-right: 32rpx;
	}

	.locale-en .payment-footer > view:first-child {
		flex: 1;
		min-width: 0;
	}

	.locale-en .payment-footer > view:last-child {
		flex: 0 0 42%;
	}

	.locale-en .payment-footer .btn-modify {
		gap: 12rpx;
		flex-wrap: wrap;
		padding: 22rpx 12rpx;
	}

	.locale-en .payment-footer .countdown-timer {
		position: static;
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}

	.locale-en .renew-title,
	.locale-en .early-bird-head {
		flex-wrap: wrap;
		gap: 8rpx;
	}

	.locale-en .points-notice-action {
		max-width: 160rpx;
		text-align: center;
	}

	.locale-en .booking-service-name {
		font-size: 26rpx;
	}
</style>
