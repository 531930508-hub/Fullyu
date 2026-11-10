'use strict'
// 默认指向生产 API；测试环境构建时可用 BASE_API=... npm run build 覆盖，
// 避免测试后台误连生产接口。
module.exports = {
  NODE_ENV: '"production"',
  BASE_API: JSON.stringify(process.env.BASE_API || 'https://manage.fullytherapy.com/api')
}
