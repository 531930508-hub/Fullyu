# 前端项目配置说明

## 项目概述

### 项目定位
基于 Vue.js 2.x + Element UI 构建的后台管理系统前端，提供完整的后台管理界面，涵盖产品、订单、用户、数据统计等核心业务功能。

### 目录结构
```
mall-admin-web/
├── build/               # Webpack 构建配置
├── config/              # 环境配置文件
├── src/                 # 源代码目录
│   ├── api/             # 接口请求模块
│   ├── assets/          # 静态资源目录
│   ├── components/      # 公共组件库
│   ├── const/           # 常量定义
│   ├── filter/          # 过滤器模块
│   ├── icons/           # 图标资源
│   ├── router/          # 路由配置
│   ├── styles/          # 样式文件
│   ├── store/           # 状态管理
│   ├── utils/           # 工具函数
│   ├── views/           # 页面组件
│   └── main.js          # 应用入口
├── static/              # 静态资源
└── package.json         # 项目配置
```

## 技术架构

### 核心技术栈

| 技术框架 | 版本 | 功能说明 | 官方地址 |
|---------|------|----------|----------|
| Vue.js | ^2.7.2 | 核心前端框架 | https://vuejs.org/ |
| Element UI | ^2.15.14 | UI组件库 | https://element.eleme.io/ |
| Vue Router | ^3.0.1 | 路由管理 | https://router.vuejs.org/ |
| Vuex | ^3.0.1 | 状态管理 | https://vuex.vuejs.org/ |
| Axios | ^0.18.0 | HTTP请求库 | https://github.com/axios/axios |
| ECharts | ^4.2.0-rc.2 | 数据可视化 | https://echarts.apache.org/ |
| v-charts | ^1.19.0 | Vue图表组件 | https://v-charts.js.org/ |

### 开发环境要求

| 环境工具 | 版本要求 | 官方地址 |
|----------|----------|----------|
| Node.js | >= 6.0.0 | https://nodejs.org/ |
| npm | >= 3.0.0 | 内置Node.js |

### 开发工具

| 开发工具 | 类型 | 官方地址 |
|----------|------|----------|
| WebStorm | IDE | https://www.jetbrains.com/webstorm/ |
| Chrome | 浏览器 | https://www.google.com/chrome/ |

## 环境配置

### 环境搭建流程

1. **源码获取与导入**
    - 环境验证
    ```bash
    node --version    # 验证Node.js版本
    npm --version     # 验证npm版本
    ```
   - 依赖安装
    ```bash
    npm install       # 安装项目依赖
    ```

  - 修改配置文件设置后端API地址

2. **环境变量配置**
    - 开发环境
    ```javascript
    module.exports = merge(prodEnv, {
      NODE_ENV: '"development"',
      BASE_API: '"http://localhost:9929"'
    })
    ```

    - 生产环境
    ```javascript
    module.exports = {
      NODE_ENV: '"production"',
      BASE_API: '"https://xxx.com/api"'
    }
    ```

3. **构建脚本配置**
    ```json
    {
      "scripts": {
        "dev": "webpack-dev-server --inline --progress --config build/webpack.dev.conf.js",
        "start": "npm run dev",
        "build": "node build/build.js",
        "deploy": "node versionUpdate.js && node build/build.js && scp -r dist/ root@xx.xx.xx.xx:/server/www/fully"
      }
    }
    ```
## Webpack构建体系

### 基础配置 (webpack.base.conf.js)
- 统一入口文件配置
- 模块解析规则定义
- 文件加载器配置

### 开发环境配置 (webpack.dev.conf.js)
- 热重载开发服务器
- 模块热替换支持
- 友好错误提示界面
- 完整源代码映射

### 生产环境配置 (webpack.prod.conf.js)
- 代码压缩优化
- CSS资源分离
- 哈希命名策略
- 代码分割优化

## 构建与部署

### 运行管理

#### 开发环境运行
```bash
npm run dev    # 启动开发服务器(端口8090)
```
访问地址：http://localhost:8090

#### 生产构建部署
```bash
npm run deploy  # 构建并部署生产版本，导报成功后输入服务器密码上传
```

#### Nginx部署配置

nginx配置文件位于主服务器/ext/nginx目录下

```nginx
server {
    listen 80;
    listen 443 ssl;

    # SSL证书配置
    ssl_certificate /etc/nginx/cert/xxx.com.pem;
    ssl_certificate_key /etc/nginx/cert/xxx.com.key;
	ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;

    # API代理配置
    location /api/ {
      proxy_pass http://localhost:9929/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Host $http_host;
      proxy_set_header X-Forwarded-Port $server_port;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_redirect http:// https://;
    }

    # 静态资源服务
    location / {
      root   /server/www/fully/dist/;
      try_files $uri $uri/ /index.html;
      index  index.html index.htm;
    }
}
```

## 功能模块

### 核心业务模块
- **首页管理** - 预约接待管理
- **产品管理** - 项目卡券产品管理
- **订单管理** - 服务订单审批管理
- **活动管理** - 营销活动管理
- **门店管理** - 门店信息管理
- **技师管理** - 技师信息管理
- **数据统计** - 业务数据可视化
- **客户管理** - 用户信息管理
- **系统设置** - 权限角色配置

### 系统特色功能
- **自适应布局** - 响应式界面设计
- **权限管理** - 角色权限控制
- **数据可视化** - 列表数据展示
- **文件管理** - 多格式文件上传

## 注意事项

### 版本兼容性
- 基于Vue 2.x框架开发
- Element UI版本锁定2.15.x
- Node.js要求6.0.0以上版本

### 开发规范
- 遵循Vue官方代码规范
- 使用PascalCase组件命名
- Vuex状态管理模式
- 支持现代浏览器环境

---
