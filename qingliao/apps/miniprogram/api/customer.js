import http from '../utils/fetch'

export default {
    login(phone, openId, invitationCode, activityCode) {
        return http.post({
            url: '/customer/login',
            data: {phone, openId, invitationCode, activityCode}
        })
    },
    updateAvatar(avatar) {
        return http.put({
            url: '/customer/update/avatar',
            params: {avatar}
        })
    },
    updateNickname(nickname) {
        return http.put({
            url: '/customer/update/nickname',
            params: {nickname}
        })
    },
    // 个人资料（昵称/头像/性别/生日）统一入口：以品牌会员中心为唯一归档。
    // 只传要改的字段，后端推 CRM 成功才落库；版本冲突会报错，需重新读取后再改。
    getProfile() {
        return http.get({
            url: '/customer/profile'
        })
    },
    updateProfile(data) {
        return http.put({
            url: '/customer/update/profile',
            data
        })
    },
    getIntegration() {
        return http.get({
            url: '/customer/getIntegration',
        })
    },
    generatePosterWithQRCode(id) {
        return http.get({
            url: '/customer/invitationQrImage',
            params: {id}
        })
    },
    saveCustomerTagByActivityCode(activityCode) {
        return http.post({
            url: '/customer/saveCustomerTagByActivityCode',
            params: {activityCode}
        })
    },
    getCustomerVipLevel() {
        return http.get({
            url: '/customer/getCustomerVipLevel'
        })
    },//获取用户即将失效的积分
	getInvalidIntegration(){
		return http.get({
		    url: '/customer/getInvalidIntegration',
		})
	},
}
