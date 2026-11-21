'use strict'
// 默认指向生产 API；测试环境构建时可用 BASE_API=... npm run build 覆盖，
// 避免测试后台误连生产接口。
module.exports = {
  NODE_ENV: '"production"',
  // 默认指向 cityretreat（2026-11 起正式名）。manage.fullytherapy.com 是待下线的旧名，
  // 依赖它会让后台每次接口调用都跨域绕道老域名，下线即全挂。
  BASE_API: JSON.stringify(process.env.BASE_API || 'https://cityretreat.fullyu.cn/api')
}
