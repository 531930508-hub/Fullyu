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
    }
}
