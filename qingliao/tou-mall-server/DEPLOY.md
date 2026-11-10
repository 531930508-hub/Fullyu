# 轻疗商城（tou-mall）部署说明

> **最重要的一条：配置里的密钥已经不写在仓库里了。**
> 从 2026-11 起，数据库密码、RabbitMQ、OSS/SMS 的 AK/SK、微信 secret、汇付私钥、打印机与百度语音密钥
> 全部改成环境变量注入（`${VAR:}` 或 `Env.get(...)`）。**部署前必须先注入环境变量，否则支付、短信、
> OSS 上传、微信登录会因空密钥失效**——不会报配置错误，只会在调用第三方时才失败。
>
> 变量清单以 `tou-mall-server/.env.example` 为准；真实值在：
> - 本机：`~/.fullyu-secrets/qingliao-tou-mall-server.env`（600）
> - 服务器：`/etc/fullyu/qingliao-mall.env`（600，`chown root`）

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
sudo install -m 600 -o root -g root /dev/null /etc/fullyu/qingliao-mall.env
sudo vi /etc/fullyu/qingliao-mall.env        # 按 .env.example 填

# 3. 启动（环境变量必须显式加载，缺少会静默降级）
set -a; . /etc/fullyu/qingliao-mall.env; set +a
java -jar mall-admin-1.0-SNAPSHOT.jar  --spring.profiles.active=prod
java -jar mall-portal-1.0-SNAPSHOT.jar --spring.profiles.active=prod
```

PM2 / systemd 托管时，把 `EnvironmentFile=/etc/fullyu/qingliao-mall.env` 写进 unit 文件，不要用
`ecosystem.config.js` 里的 `env` 硬编码。

## 自检（部署后必做）

```bash
# 进程里是否真的拿到变量（不打印值，只看是否存在）
tr '\0' '\n' < /proc/$(pgrep -f mall-admin | head -1)/environ | cut -d= -f1 | grep -E 'DB_PASSWORD|PAY_SECRET|WX_|ALIYUN_' | sort
```

依次验四条链路：后台登录 → 上传一张图（OSS）→ 触发一条短信 → 发起一笔小额支付（汇付）。
任一失败先查环境变量，而不是查代码。

## 安全约定

- 任何新加的密钥只进 `.env.example` 的占位与服务器 env 文件，**不进 yml、不进 Java 常量**。
- 本地真实值统一放 `~/.fullyu-secrets/`（已 600，仓库已忽略）。
- 桌面 `~/Desktop/Full愈-轻疗/` 下的 `nXmkoES7gb.txt`、`汇付天下账号对应级秘钥.txt`、
  `副本full愈三方账号密码.xlsx` 属于未纳管的历史密钥文件，不要复制回仓库。