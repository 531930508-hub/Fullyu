import payApi from "@/api/pay";
import orderApi from "@/api/order.js";
import debounce from "./debounce";
import { t } from "./locale";

export default {
    getOpenId() {
        return new Promise((resolve, reject) => {
            uni.login({
                provider: 'weixin',
                success: function (loginRes) {
                    console.log("loginRes", loginRes);
                    let wxCode = loginRes.code;
                    let param = {
                        "wxCode": wxCode,
                    }
                    console.log(param)
                    payApi.getOpenId(param).then(res => {
                        resolve(res.openId)
                    })
                }
            });
        })
    },

    getPhone(phoneDetail, wxCode) {
        return new Promise((resolve, reject) => {
            const {encryptedData, iv, code} = phoneDetail;
            if (code != null) {
                payApi.getPhone({code}).then(res => {
                    resolve(res.phoneNumber)
                })
            } else {
                if (wxCode == null) {
                    return uni.showToast({
                        title: t('获取手机号失败'),
                        icon: 'none'
                    })
                }
                payApi.getPhone({code: wxCode, encryptedData, iv}).then(res => {
                    resolve(res.phoneNumber)
                })
            }
        })
    },

    genPayInfo(orderId, cbFunc = {}) {
        return new Promise(async (resolve, reject) => {
            debounce(async () => {
                let openId = await this.getOpenId()
				
                let {payOrderId, orderSn, payParams, payType} = await payApi.genPayInfo(orderId, openId)
							
                console.log(payParams)

                let payInfo = {orderId, ...payParams}

                let queryResultCall = async () => {
                    return await orderApi.checkPaid(orderSn)
                }

                const defaultSuccess = (res) => {
                    uni.showToast({
                        title: t('支付成功'),
                        icon: 'none',
                        duration: 3000,
                    })
                }
                const payFunc = (res) => {
                    /* global uni */
                    uni.showLoading({
                        title: t('等待支付结果'),
                        mask: false,
                    })

                    let tryCount = 0;
                    this.timer = setInterval(async () => {
                        tryCount++
                        if (tryCount > 30) {
                            clearInterval(this.timer)
                            this.timer = null
                            uni.hideLoading();
                            uni.showModal({
                                showCancel: false,
                                confirmText: t('确定'),
                                title: t('提示'),
                                content: t('未获取到支付结果, 请联系客服人员'),
                                success: function (res) {
                                }
                            });
                            reject.call(e)
                            return
                        }

                        try {
                            let queryResult = await queryResultCall();
                            if (queryResult) {
                                clearInterval(this.timer)
                                this.timer = null
                                uni.hideLoading();
                                resolve.call()
                                if (cbFunc.success) {
                                    cbFunc.success.call()
                                } else {
                                    defaultSuccess()
                                }
                            }
                        } catch (e) {
                            clearInterval(this.timer)
                            this.timer = null
                            uni.hideLoading();
                            uni.showModal({
                                showCancel: false,
                                confirmText: t('确定'),
                                title: t('提示'),
                                content: t('未知原因失败，找客服沟通'),
                                success: function (res) {
                                    reject.call(e)
                                }
                            });
                            reject.call(e)
                        }
                    }, 500)
                }

                const defaultFail = (res) => {
                    console.log(res)
                    uni.hideLoading();

                    if (res.errMsg.includes("requestPayment:fail cancel")) {
                        uni.showModal({
                            title: t('提示'),
                            showCancel: false,
                            confirmText: t('确定'),
                            content: t('取消支付'),
                            success: function (res) {
                                reject.call(res)
                            }
                        });
                    } else {
                        uni.showModal({
                            title: t('提示'),
                            showCancel: false,
                            confirmText: t('确定'),
                            content: t('支付失败'),
                            success: function (res) {
                                reject.call(res)
                            }
                        });
                    }
                }

                const defaultComplete = (res) => {
                    console.log(res)
                }

                payInfo.success = payFunc

                payInfo.fail = cbFunc.fail || defaultFail

                payInfo.complete = cbFunc.complete || defaultComplete

                uni.requestPayment({
                    ...payInfo,
                    provider: 'wxpay',
                })
            })
        })
    }
}
