const dayjs = require('dayjs')
const fs = require('fs')

// 从静态文件读取已有版本号
const versionJsonPath = './static/version.json'
const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'))

// 自动递增版本号
const currentVersion = versionJson.version
const newVersion = incrementalVersion(currentVersion)

// 更新静态文件版本号
versionJson.version = newVersion
versionJson.time = dayjs().format('YYYY-MM-DD HH:mm:ss')

// 将更新后的内容写入 version.json 文件
fs.writeFileSync(versionJsonPath, JSON.stringify(versionJson, null, 2), 'utf8')

/**
 * 增加版本号xx.xx.xx
 * @param version
 * @returns {string}
 */
function incrementalVersion(version) {
    const versionParts = version.split('.')
    let major = parseInt(versionParts[0])
    let minor = parseInt(versionParts[1])
    let patch = parseInt(versionParts[2])
    if (patch < 99) {
        patch += 1
    } else {
        patch = 0
        minor += 1
    }
    if (minor > 99) {
        major += 1
        minor = 0
    }
    return `${major}.${minor}.${patch}`
}
