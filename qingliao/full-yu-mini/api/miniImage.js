import http from '../utils/fetch'

export default {
    bannerList() {
        return http.get({
            url: '/miniImage/bannerList'
        })
    },
    splashScreenImageList() {
        return http.get({
            url: '/miniImage/splashScreenImageList'
        })
    },
    couponImageList() {
        return http.get({
            url: '/miniImage/couponImageList'
        })
    }
}
