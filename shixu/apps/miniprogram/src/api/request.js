// 小程序真机与体验版没有 localhost，无显式 VITE_API_BASE 时直接用线上域名，
// 避免一次默认构建就把顾客端指向本机（表现为「网络连接失败」且服务端无任何请求）。
//
// 环境判定（运行时，不是编译期）：同一份代码包按微信用途自动选后端
//   release（正式版 / 提审中的版本）      → 生产 teahour.fullyu.cn
//   trial（体验版） / develop（预览码）  → 测试 test-teahour.fullyu.cn
// 判定依据 wx.getAccountInfoSync().miniProgram.envVersion。
// 公众平台需把两个域名都加进 request / uploadFile 合法域名（白名单不分版本，一份配置对所有版本生效）。
// VITE_API_BASE 仍是最高优先级的显式注入（本地联调、临时指向某环境）。
// #ifdef MP-WEIXIN
const PROD_API_BASE = 'https://teahour.fullyu.cn/api';
const TEST_API_BASE = 'https://test-teahour.fullyu.cn/api';
const DEV_API_BASE = 'http://localhost:8787/api';
// 微信运行环境：release | trial | develop；取不到时按 develop（测试）处理，避免误写生产数据
const ENV_VERSION = (() => {
  try {
    return uni.getAccountInfoSync().miniProgram.envVersion || 'develop';
  } catch (error) {
    return 'develop';
  }
})();
// 开发构建（开发者工具 dev）连本地；打包产物 release 走生产、trial/develop 走测试。
const DEFAULT_BASE = !import.meta.env.PROD
  ? DEV_API_BASE
  : ENV_VERSION === 'release' ? PROD_API_BASE : TEST_API_BASE;
// #endif
// #ifndef MP-WEIXIN
const DEFAULT_BASE = 'http://localhost:8787/api';
const ENV_VERSION = 'h5';
// #endif
export { ENV_VERSION };
export const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || DEFAULT_BASE;
console.info(`[env] envVersion=${ENV_VERSION} api=${API_BASE}`);

const TOKEN_KEY = 'teahour.customer.token';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getToken() {
  try {
    return uni.getStorageSync(TOKEN_KEY) || '';
  } catch (error) {
    return '';
  }
}

export function setToken(token) {
  try {
    uni.setStorageSync(TOKEN_KEY, token);
  } catch (error) {
    /* storage unavailable */
  }
}

export function clearToken() {
  try {
    uni.removeStorageSync(TOKEN_KEY);
  } catch (error) {
    /* storage unavailable */
  }
}

export function request(path, options = {}) {
  const { method = 'GET', data, auth = true } = options;
  const token = auth ? getToken() : '';
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${API_BASE}${path}`,
      method,
      data,
      timeout: 15000,
      header: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success(response) {
        const body = response.data || null;
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(body);
          return;
        }
        if (response.statusCode === 401 && auth) clearToken();
        const message =
          (body && (body.message || body.error)) || `请求失败（${response.statusCode}）`;
        reject(new ApiError(response.statusCode, message));
      },
      fail() {
        reject(new ApiError(0, '网络连接失败，请稍后重试'));
      }
    });
  });
}
