import axios from 'axios'
import {MessageBox} from 'element-ui'

const versionKey = 'fullyManageWebVersion'
export default {
    isRun: false,
    interval: null,
    _runner() {
        let vm = this
        if (vm.isRun) {
            axios({
                url: 'https://cityretreat.fullyu.cn/static/version.json',
                method: 'get',
            }).then(res => {
                let obj = res.data || {}
                let version = obj.version
                let oldVersion = localStorage.getItem(versionKey)
                if (!oldVersion) {
                    localStorage.setItem(versionKey, version)
                } else {
                    if (version != oldVersion) {
                        localStorage.setItem(versionKey, version)
                        MessageBox.confirm('系统已更新，请刷新网页获取最新版本', '系统更新提醒', {
                            confirmButtonText: '马上刷新',
                            cancelButtonText: '稍后刷新',
                            type: 'warning'
                        }).then(() => {
                            window.location.reload()
                        }).catch(() => {

                        })
                    }
                }
            }).catch(err => {
                console.error(err)
            })
        } else {
            clearInterval(this.interval)
            vm.interval = null
        }
    },
    start() {
        let host = window.location.host
        // 过渡期两个域名并存：老后台书签仍走 manage.fullytherapy.com。
        // 老域名摘除（301 生效）后，把第二项删掉即可。
        const allowedHosts = ['cityretreat.fullyu.cn', 'manage.fullytherapy.com']
        if (!allowedHosts.some(h => host.includes(h))) {
            return
        }
        this.isRun = true
        if (this.interval) {
            clearInterval(this.interval)
        }
        this._runner()
        let vm = this
        // 20分钟检查一次
        this.interval = setInterval(() => {
            vm._runner()
        }, 20 * 60 * 1000)
    },
    stop() {
        this.isRun = false
    }
}
