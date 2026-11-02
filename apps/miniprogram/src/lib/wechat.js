/**
 * 微信原生能力适配层。
 *
 * 设计原则：页面只调用这里的函数，不直接写 uni.login / uni.requestPayment / uni.scanCode。
 * - 编译到 mp-weixin 时走真实微信 API（登录态、手机号授权、JSAPI 支付、扫码）。
 * - H5 预览只用于浏览与核对版式：没有微信登录、手机号授权、支付与扫码运行时，
 *   相关能力一律如实提示到小程序内完成，不模拟成功。
 *
 * 后端对应的是 apps/server/src/hardware 里的 MiniProgramAuthProvider：
 * 登录与手机号已走真实微信接口（jscode2session + getuserphonenumber），
 * 支付、打印、会员、平台仍为 mock，未接入的渠道不会产生真实扣款。
 */

// 平台判定必须走 uni-app 条件编译：
// 小程序运行时没有 Node 的 process 对象，用 process.env.UNI_PLATFORM 判断会在真机恒为 false，
// 导致微信原生登录、扫码、支付、头像授权全部降级成 H5 分支。
// #ifdef MP-WEIXIN
export const IS_WEIXIN_MP = true;
// #endif
// #ifndef MP-WEIXIN
export const IS_WEIXIN_MP = false;
// #endif

const promisify = (fn, options = {}) =>
  new Promise((resolve, reject) => {
    fn({
      ...options,
      success: resolve,
      fail: (error) => reject(new Error((error && (error.errMsg || error.message)) || '微信接口调用失败'))
    });
  });

/** wx.login：返回一次性 code，交给后端换 openId。H5 返回 null，页面只提示在小程序内登录。 */
export async function login() {
  if (!IS_WEIXIN_MP || typeof uni.login !== 'function') return null;
  const result = await promisify(uni.login, { provider: 'weixin' });
  return (result && result.code) || null;
}

/**
 * getPhoneNumber 的回调数据整理。
 * 小程序侧必须由 <button open-type="getPhoneNumber"> 触发，拿到事件后调用本函数再交给后端。
 */
export function phonePayload(event) {
  const detail = (event && (event.detail || event)) || {};
  if (detail.errMsg && String(detail.errMsg).indexOf('ok') === -1) return null;
  if (!detail.code && !detail.encryptedData) return null;
  return { code: detail.code, encryptedData: detail.encryptedData, iv: detail.iv };
}

/**
 * 把 getPhoneNumber 的失败原因归一到可执行提示。
 * 微信原生手机号面板不会因为页面里没勾选复选框而失败：立即失败通常是
 * 隐私保护指引未声明手机号、手机号快速验证未开通，或用户主动取消。
 */
export function phoneAuthFailure(event) {
  const detail = (event && (event.detail || event)) || {};
  const raw = String(detail.errMsg || '');
  if (!raw || raw.indexOf(':ok') !== -1) return null;
  if (/deny|cancel/i.test(raw)) return { reason: 'cancelled', raw };
  if (/api scope is not declared|privacy|banned/i.test(raw)) return { reason: 'privacy', raw };
  if (/no permission|access denied|not authorized|permission/i.test(raw)) return { reason: 'permission', raw };
  return { reason: 'unknown', raw };
}

/**
 * wx.requestPayment：参数由后端 prepay 接口下发（UI-01）。
 * 真实小程序内缺支付参数必须如实失败，不得兜底成功；H5 没有微信支付运行时，同样如实失败，
 * 不返回任何“模拟支付成功”的回执。
 */
export async function requestPayment(payment) {
  if (!IS_WEIXIN_MP || typeof uni.requestPayment !== 'function') {
    return { ok: false, simulated: false, error: '请在微信小程序内完成支付' };
  }
  if (!payment || !payment.paySign) return { ok: false, error: '未获取到支付参数，请稍后重试' };
  try {
    await promisify(uni.requestPayment, {
      provider: 'wxpay',
      timeStamp: payment.timeStamp,
      nonceStr: payment.nonceStr,
      package: payment.package,
      signType: payment.signType,
      paySign: payment.paySign
    });
    return { ok: true, simulated: false };
  } catch (error) {
    return { ok: false, simulated: false, error: error.message || '支付未完成' };
  }
}

/** wx.scanCode：用于扫桌签二维码。H5 无摄像头，返回 null 让页面回退到手动选择。 */
export async function scanCode(hint = '扫描桌签二维码') {
  if (!IS_WEIXIN_MP || typeof uni.scanCode !== 'function') return null;
  const result = await promisify(uni.scanCode, { onlyFromCamera: false, scanType: ['qrCode'], hint });
  return (result && (result.result || result.rawData)) || null;
}

const guessContentType = (path) => (/\.png($|\?)/i.test(String(path)) ? 'image/png' : 'image/jpeg');

/**
 * 相册/拍照选一张头像。小程序内使用 <button open-type="chooseAvatar">，
 * 这条 uni.chooseImage 路径只服务 H5；条件编译掉，避免小程序包内出现
 * 未实际使用的“相册选择”隐私接口，导致隐私指引被要求多声明一项。
 */
export async function chooseImageFile() {
  // #ifdef MP-WEIXIN
  return null;
  // #endif
  // #ifndef MP-WEIXIN
  if (typeof uni.chooseImage !== 'function') return null;
  const result = await promisify(uni.chooseImage, { count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
  const path = result && result.tempFilePaths && result.tempFilePaths[0];
  return path || null;
  // #endif
}

/** 把本地临时文件读成 base64，用于头像直传。小程序走文件系统，H5 走 FileReader。 */
export async function readFileAsBase64(filePath) {
  if (!filePath) return null;
  if (IS_WEIXIN_MP && typeof uni.getFileSystemManager === 'function') {
    const fs = uni.getFileSystemManager();
    const base64 = await new Promise((resolve, reject) => {
      fs.readFile({
        filePath,
        encoding: 'base64',
        success: (res) => resolve(res.data),
        fail: (error) => reject(new Error((error && error.errMsg) || '读取图片失败'))
      });
    });
    return { base64, contentType: guessContentType(filePath) };
  }
  const blob = await fetch(filePath).then((res) => res.blob());
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
  const matched = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!matched) throw new Error('读取图片失败');
  const contentType = matched[1] === 'image/png' ? 'image/png' : 'image/jpeg';
  return { base64: matched[2], contentType };
}

export const wechat = {
  IS_WEIXIN_MP,
  login,
  phonePayload,
  phoneAuthFailure,
  requestPayment,
  scanCode,
  chooseImageFile,
  readFileAsBase64
};
export default wechat;
