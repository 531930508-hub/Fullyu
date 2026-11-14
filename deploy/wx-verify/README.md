# 微信小程序「业务域名」校验文件

愈行之旅由 CRM 托管在 `https://crm.fullyu.cn/game/`，三端小程序用 `web-view` 打开它，
所以 `crm.fullyu.cn` 必须登记为**各小程序自己的**业务域名，并且该域名根目录要能返回
每个小程序后台下载的那份 `<随机串>.txt`。

## 现状

| 小程序 | 校验文件 | 线上状态 |
|---|---|---|
| 在场（presence） | `W1Q2vlQdT5.txt` | 已放到服务器，2026-11-13 起可访问（`07c54020018c80147d7d44795f2c22cb`） |
| 时叙（teahour） | `tSw8RyOofT.txt` | 已放到服务器，2026-11-13 起可访问（`4ad226a9294e1853e6d7d4762892f3d3`） |
| 轻疗 | `nXmkoES7gb.txt` | 已放到服务器，2026-11-13 起可访问（`4e61c2efb059ee54d04d69be67c87fc4`） |

注意文件名：微信后台下载的文件名就是 `<8 位随机串>.txt`。从浏览器/微信重复下载会带上
` (1)` 之类的后缀（如 `tSw8RyOofT (1).txt`），**必须去掉**再传——带空格和括号的名字既不会被
nginx 的校验文件规则匹配，也不是微信要访问的路径。

文件内容必须逐字节一致（32 字节、无换行），`https://crm.fullyu.cn/<文件名>` 返回 200 与同样内容。

## 服务器落点

- 目录：`/var/www/wx-verify/`（121.40.119.57）
- nginx：`/etc/nginx/sites-enabled/crm.fullyu.cn.conf` 内一条正则 location

```nginx
# 微信小程序「业务域名」校验文件：把 <随机串>.txt 放进 /var/www/wx-verify/ 即可，无需再改 nginx。
location ~ "^/[A-Za-z0-9]{8,32}[.]txt$" {
    root /var/www/wx-verify;
    default_type text/plain;
    add_header Cache-Control "no-store";
}
```

正则里的 `{}` 必须用引号包住，否则 nginx 会把它当成配置块起始并报 `unknown directive`。

## 新增一份校验文件

```bash
scp <随机串>.txt mall-test:/var/www/wx-verify/
curl -sS -o /dev/null -w '%{http_code}\n' https://crm.fullyu.cn/<随机串>.txt   # 期望 200
```

不用动 nginx、不用 reload、不用重启 CRM。