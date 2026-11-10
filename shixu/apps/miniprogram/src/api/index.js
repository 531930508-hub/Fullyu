import { request, setToken, getToken, clearToken } from './request';

export { ApiError, API_BASE } from './request';

export const api = {
  /** 退出会员登录：只清本地令牌；订单、券与积分仍在服务端，重新登录即可恢复。 */
  clearSession() {
    clearToken();
  },
  /**
   * 恢复已有登录态：只有存过 token 且服务端仍认可时才返回顾客。
   * 手机号是会员唯一身份，这里不再自动创建匿名会话，未登录时返回 null，
   * 由页面在需要下单、查看订单或权益时引导微信手机号登录。
   */
  async ensureCustomerSession() {
    if (!getToken()) return null;
    try {
      const result = await request('/customer/me');
      // 手机号是会员唯一身份：历史上匿名会话留下的无手机号档案一律视为未登录。
      if (!result.customer || !result.customer.phone) {
        clearToken();
        return null;
      }
      return result.customer;
    } catch (error) {
      if (error && error.status === 401) {
        clearToken();
        return null;
      }
      throw error;
    }
  },
  /** 微信手机号登录：code 换 openId，phoneCode 换手机号；只在微信小程序内可用。 */
  async loginWithWechat(payload) {
    const session = await request('/customer/wechat/login', {
      method: 'POST',
      data: payload,
      auth: false
    });
    if (session && session.token) setToken(session.token);
    return session.customer;
  },
  bindPhone(payload) {
    return request('/customer/wechat/phone', { method: 'POST', data: payload });
  },
  updateProfile(payload) {
    return request('/customer/profile', { method: 'PUT', data: payload });
  },
  uploadAvatar(payload) {
    return request('/customer/avatar', { method: 'POST', data: payload });
  },
  prepay(orderId) {
    return request(`/customer/orders/${encodeURIComponent(orderId)}/prepay`, { method: 'POST' });
  },
  /** 支付结果查询：回调可能晚于 wx.requestPayment，前端以服务端状态为准。 */
  getOrderPayment(orderId) {
    return request(`/customer/orders/${encodeURIComponent(orderId)}/payment`);
  },
  /** 未支付订单取消：回补库存并释放优惠券，绝不取消已支付订单。 */
  cancelOrder(orderId) {
    return request(`/customer/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' });
  },
  bootstrap(storeId) {
    return request(`/customer/bootstrap${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`, { auth: false });
  },
  memberVerify(code) {
    return request('/customer/member/verify', { method: 'POST', data: { code }, auth: false });
  },
  createOrder(body) {
    return request('/customer/orders', { method: 'POST', data: body });
  },
  myOrders() {
    return request('/customer/orders');
  },
  myOrder(id) {
    return request(`/customer/orders/${encodeURIComponent(id)}`);
  },
  myCoupons() {
    return request('/customer/coupons');
  },
  retail() {
    return request('/customer/retail', { auth: false });
  },
  /** 分享海报用小程序码：服务端生成并缓存，返回可直接画进海报的 data URL。 */
  shareCode() {
    return request('/customer/share/code', { auth: false });
  }
};
