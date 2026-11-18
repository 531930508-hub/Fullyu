# 轻疗商城（tou-mall）部署说明

> **最重要的一条：配置里的密钥已经不写在仓库里了。**
> 从 2026-11 起，数据库密码、RabbitMQ、OSS/SMS 的 AK/SK、微信 secret、汇付私钥、打印机与百度语音密钥
> 全部改成环境变量注入（`${VAR:}` 或 `Env.get(...)`）。**部署前必须先注入环境变量，否则支付、短信、
> OSS 上传、微信登录会因空密钥失效**——不会报配置错误，只会在调用第三方时才失败。
>
> 变量清单以 `tou-mall-server/scripts/env-keys.txt` 为准（只列代码真的会读、缺了会静默降级的键）；
> 真实值在：
> - 本机：`~/.fullyu-secrets/qingliao-tou-mall-server.env`（600）
> - 服务器：`/etc/fullyu/qingliao.env`（600，`chown root`）——文件名以 `start-120.sh` 里 `.` 的那份为准
 
> **2026-11-19 事故复盘**：换上的 jar 把 `PayCert` 从硬编码改成 `Env.get()`，但生产 `/etc/fullyu/qingliao.env`
> 只有 OSS/JWT/微信 7 个键，`PAY_*` 一个没有。`Env.get()` 缺省返回空串，初始化不报错，
> 直到用户点支付才在签名阶段抛 `Sign error. Please check your privateKey.`，又被 `PayService`
> 包装成"支付失败: 支付平台异常"。**这类缺口不会在启动日志里露头，只能靠发布前的键校验拦住。**

## 组成

| 模块 | 说明 | 端口 |
|---|---|---|
| `mall-admin` | 管理后台 API（Spring Boot） | 9929 |
| `mall-portal` | 小程序/H5 前台 API（Spring Boot） | 9930 |
| `tou-mall-admin-web` | Vue2 管理后台前端 | 由 Nginx 托管 |

## 构建

```bash
cd qingliao/tou-mall-server
mvn -DskipTests clean package          # 产物：mall-admin/target/mall-admin-1.0-SNAPSHOT.jar 等

cd ../tou-mall-admin-web
npm install
BASE_API=https://manage.fullytherapy.com/api npm run build   # 产物：dist/
```

## 部署（手工，尚未接入 CI workflow）

```bash
# 1. 上传 jar 与前端 dist 到服务器
# 2. 服务器上准备环境变量文件（首次或变更时）
sudo install -m 600 -o root -g root /dev/null /etc/fullyu/qingliao.env
sudo vi /etc/fullyu/qingliao.env            # 按 scripts/env-keys.txt 的键逐个填
sudo bash scripts/check-env-keys.sh scripts/env-keys.txt /etc/fullyu/qingliao.env   # 必须 ok

# 3. 启动（环境变量必须显式加载，缺少会静默降级）
set -a; . /etc/fullyu/qingliao.env; set +a
java -jar mall-admin-1.0-SNAPSHOT.jar  --spring.profiles.active=prod
java -jar mall-portal-1.0-SNAPSHOT.jar --spring.profiles.active=prod
```

PM2 / systemd 托管时，把 `EnvironmentFile=/etc/fullyu/qingliao-mall.env` 写进 unit 文件，不要用
`ecosystem.config.js` 里的 `env` 硬编码。

## 自检（部署后必做）

`scripts/deploy-prod.sh` 已内置两处硬门禁：发布前校验服务器 env 文件、启动后校验进程 environ。
手工部署时照做：

```bash
# 进程里是否真的拿到变量（不打印值，只看缺哪个键）
bash scripts/check-env-keys.sh scripts/env-keys.txt --pid $(pgrep -f mall-admin-1.0-SNAPSHOT.jar | head -1)

# 排查细项（可选，只看键名）
tr '\0' '\n' < /proc/$(pgrep -f mall-admin-1.0-SNAPSHOT.jar | head -1)/environ | cut -d= -f1 | grep -E 'PAY_|WX_|ALIYUN_' | sort
```

依次验四条链路：后台登录 → 上传一张图（OSS）→ 触发一条短信 → 发起一笔小额支付（汇付）。
任一失败先查环境变量，而不是查代码。

## 品牌会员卡（CRM）开通

两步走，**接通 ≠ 开售**：

1. 接通（客户能看到卡、会员价按 CRM 下发）：
   服务器 env 把 `BRAND_CRM_ENABLED` 改为 `1`（`BASE_URL/KEY_ID/SECRET` 已在 env 里），重启 mall。
   CRM 侧客户端 `ql-mall` 已配置在 `/etc/fullyu-crm/crm.env` 的 `CRM_EXT_KEYS`。
2. 开售（用户能真的下单买卡）：
   `BRAND_CRM_PURCHASE_ENABLED=1`，**同时**把 `BRAND_ORDER_REPORT_ENABLED=1`
   （否则 CRM 退款试算缺轻疗优惠记录），重启 mall。

   两个环境的口径不同，别把测试的开售开关抄到生产：

   - 测试（`/opt/fullyu-mall-test/crm.env`）：`BRAND_CRM_PURCHASE_ENABLED=1` +
     `BRAND_ORDER_REPORT_ENABLED=1` 常开，下单/退款（含退款试算的已享优惠）都要能测；
     2026-11-19 已配好并重启 `mall-test`，日志可见"品牌会员订单上报：新增 N"。
   - 生产（`/etc/fullyu/qingliao.env`）：正式开售前**不配**这两个键，接口保持 503「暂未开售」；
     开售当天再一起加并重启，生产不要默认打开。

未开售时 `/brandMember/purchase` 与合并支付里的卡单返回 503——前端藏入口不等于接口买不到，
所以不要靠"页面没有按钮"来当作关闭开关。

> `.env.example` 里的 `RABBITMQ_PASSWORD`、`MINIO_*` 目前没有代码读取（MQ 密码写在
> `application-prod.yml`，MinIO 未接入）。`PRINT_*`、`BAIDU_VOICE_*` 已改为读环境变量，
> 与 `application-prod.yml` 的 `print.*`、`baidu.voice.*` 对应，缺了打印/语音会不可用。

## 安全约定

- 任何新加的密钥只进 `.env.example` 的占位与服务器 env 文件，**不进 yml、不进 Java 常量**。
- `application-prod.yml` 里仍有两处未迁移：`spring.datasource.password`、`spring.rabbitmq.password`
  （迁移要与两台机器的启动 env 同步改，单独安排；轮换密码时一并处理）。
- 本地真实值统一放 `~/.fullyu-secrets/`（已 600，仓库已忽略）。
- 桌面 `~/Desktop/Full愈-轻疗/` 下的 `nXmkoES7gb.txt`、`汇付天下账号对应级秘钥.txt`、
  `副本full愈三方账号密码.xlsx` 属于未纳管的历史密钥文件，不要复制回仓库。