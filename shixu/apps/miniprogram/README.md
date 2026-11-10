# 顾客端小程序（uni-app · Vue 3）

Full愈·时叙 的顾客端：选店、点单、会员优惠、零售自提、订单进度。
门店在平板营业台接单出餐，总部在管理后台看经营，三端共用 `apps/server` 的同一套接口。

## 本地开发

```bash
# 1. 先启动后端（另一个终端）
pnpm --filter @teahour/server dev        # http://localhost:8787

# 2. 微信小程序构建（产物在 dist/dev/mp-weixin）
pnpm --filter @teahour/miniprogram dev:mp-weixin

# 或先看 H5 预览
pnpm --filter @teahour/miniprogram dev:h5
```

微信开发者工具导入 `apps/miniprogram/dist/dev/mp-weixin`，详情里勾选
**不校验合法域名**（本地 http 接口）。

## 接口地址

默认 `http://localhost:8787/api`。真机预览或换服务器时，在项目根目录建 `.env`：

```
VITE_API_BASE=http://192.168.x.x:8787/api
```

## 微信 AppID

`src/manifest.json` 里 `mp-weixin.appid` 已填正式 AppID `wxd9e4e4568d1bc8bb`。
上线前在微信公众平台把后端域名加入 request 合法域名白名单。

## 目录

```
src/
  pages/index    单页壳：首页点单、购物袋、订单、订单详情、我的（内部切页）
  components     AppIcon / BottomSheet / ProductArt / QrImage / SeriesMotif
  api            请求封装（request.js）与顾客接口（index.js）
  store          会话、门店、目录与购物袋状态
  lib/catalog    系列、状态与金额格式化
  lib/locale     中英文案
  lib/svg        内联 SVG 图形与二维码渲染
  lib/wechat     微信能力适配层（登录、手机号、支付、扫码）
```

支付、云打印、会员体系与外卖平台都经由 `apps/server/src/hardware` 适配层调用，
目前尚未接入各家服务商，不会产生真实扣款、打印或设备动作；接口契约已按正式字段预留。
