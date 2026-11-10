// 小程序真机与体验版没有 localhost，无显式 VITE_API_BASE 时直接用线上域名，
// 避免一次默认构建就把顾客端指向本机（表现为「网络连接失败」且服务端无任何请求）。
// #ifdef MP-WEIXIN
// 开发构建仍可连本地；打包产物一律走线上，避免体验版/真机指向 localhost。
const DEFAULT_BASE = import.meta.env.PROD ? 'https://teahour.fullyu.cn/api' : 'http://localhost:8787/api';
// #endif
// #ifndef MP-WEIXIN
const DEFAULT_BASE = 'http://localhost:8787/api';
// #endif
export const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || DEFAULT_BASE;

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
