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
                url: 'https://manage.fullytherapy.com/static/version.json',
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
        if (!host.includes('manage.fullytherapy.com')) {
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
