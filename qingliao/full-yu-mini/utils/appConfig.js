//配置API请求的基础路径
let API_BASE_URL = ''

// 获取当前环境
const getEnv = () => {
    try {
        // 微信小程序环境判断
        if (typeof wx !== 'undefined' && wx.getAccountInfoSync) {
            const accountInfo = wx.getAccountInfoSync()
            console.log("微信小程序环境判断",accountInfo.miniProgram.envVersion);
            return accountInfo.miniProgram.envVersion || 'release'
        }
        return 'release'
    } catch (error) {
        console.warn('获取环境失败:', error)
        return 'release'
    }
}

// 配置不同环境的API地址
const configs = {
    develop: 'http://localhost:9929',   // 开发环境
    trial: 'https://manage.fullytherapy.com/api',    // 体验版环境
    release: 'https://manage.fullytherapy.com/api'     // 正式环境
}

// 根据当前环境设置API地址
const env = getEnv()
API_BASE_URL = configs[env] || configs.release

export { API_BASE_URL }
