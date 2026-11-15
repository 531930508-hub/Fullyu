/**
 * 图片地址优化
 *
 * 阿里云 OSS 原图直出是首页/购卡页变慢的主因（单张 200KB ~ 19MB）。
 * 这里统一把 OSS 地址改写成「按显示宽度等比缩放 + webp + 质量压缩」的地址，
 * 实测同图可小 6 ~ 2000 倍。
 *
 * 注意：
 * 1. 只处理 OSS 域名，/static 本地图、data: 图、其他域名原样返回；
 * 2. 后端会存出两种 OSS 地址：带域名的完整地址，和只存 object key 的相对地址
 *    （上传接口返回的就是 key，如 fully/file/avatars/xxx.jpg）。相对地址必须先补域名，
 *    否则 H5 会当成本站路径请求、小程序则直接加载失败；
 * 3. 地址里的中文/括号/空格可能已被 %XX 转义，也可能没有。encodeURI 会把已转义的
 *    % 再转成 %25（二次编码），OSS 上就找不到对象，所以统一先 decode 再 encode 一次；
 * 4. 会丢弃原有 query（数据库里存的是带 Expires/Signature 的预签名地址，
 *    移除签名后仍可访问，因为该 bucket 为公共读；带签名时追加参数会导致签名失效）；
 * 5. resize 带 limit_1，避免小图被放大反而变大；
 * 6. 输出 webp 需要配合 image 组件的 :webp="true"，否则部分安卓机型不解码。
 */

const OSS_HOST_PATTERN = /^https?:\/\/[^/]*\.aliyuncs\.com\//i
const OSS_ORIGIN = 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/'
const DEFAULT_WIDTH = 750
const DEFAULT_QUALITY = 80

export function isOssImage(url) {
    return typeof url === 'string' && OSS_HOST_PATTERN.test(url)
}

/** 补全只存了 object key 的历史数据（fully/...、/fully/...、upload/...） */
function absoluteUrl(url) {
    if (url.startsWith('//')) return 'https:' + url
    if (url.startsWith('/static') || url.startsWith('data:') || url.startsWith('blob:')) return url
    if (/^https?:\/\//i.test(url)) return url
    if (/^\/?(fully|upload)\//i.test(url)) return OSS_ORIGIN + url.replace(/^\/+/, '')
    return url
}

/** 保留已有的 %XX，只把还没转义的字符（空格、中文、# 等）编码一次 */
function encodeOnce(path) {
    return path.replace(/%(?![0-9A-Fa-f]{2})|[^A-Za-z0-9\-._~!$&'()*+,;=:@\/%]/gu, (ch) => {
        if (ch === '%') return '%25'
        try {
            return encodeURIComponent(ch)
        } catch (e) {
            return ch
        }
    })
}

/**
 * @param {string} url 原始图片地址
 * @param {number} width 展示宽度（px，748 约等于整屏；传 0 表示只去签名不压缩）
 * @param {number} quality 压缩质量 1-100
 * @returns {string}
 */
export function img(url, width = DEFAULT_WIDTH, quality = DEFAULT_QUALITY) {
    if (!url || typeof url !== 'string') return ''
    const abs = absoluteUrl(url.trim())
    if (abs.startsWith('data:') || abs.startsWith('blob:') || abs.startsWith('/static')) return abs
    if (!isOssImage(abs)) return abs

    const base = encodeOnce(abs.split('?')[0].split('#')[0])
    if (!width || width <= 0) return base

    const w = Math.round(width)
    const q = Math.round(quality)
    return `${base}?x-oss-process=image/resize,w_${w},limit_1/format,webp/quality,q_${q}`
}

export default img

/**
 * 分享卡片缩略图：微信要求 5:4 左右、体积尽量小，这里统一补白到 500x400 的 jpg。
 * 商城/分享场景用，避免把几 MB 的原图塞给微信。
 */
export function shareImg(url, width = 500, height = 400) {
    if (!url || typeof url !== 'string') return ''
    const abs = absoluteUrl(url.trim())
    if (!isOssImage(abs)) return abs
    const base = encodeOnce(abs.split('?')[0].split('#')[0])
    return `${base}?x-oss-process=image/resize,m_pad,w_${Math.round(width)},h_${Math.round(height)},color_FFFFFF/format,jpg/quality,q_80`
}