import customerApi from "../api/customer"
import customerCouponApi from "../api/customerCoupon"
import shopApi from "../api/shop";
import cache from "./cache"
import productApi from "../api/product";

const tokenKey = 'fullyToken'
const nicknameKey = 'fullyNickname'
const phoneKey = 'fullyPhone'
const avatarKey = 'fullyAvatar'
const integrationKey = 'fullyIntegration'
const couponCountKey = 'fullyCouponCount'
const storeListKey = 'fullyStoreList'
const invitationCodeKey = 'fullyInvitationCode'
const projectListKey = 'fullyProjectList'
const vipLevelKey = 'fullyVipLevel'
const storeKey = 'fullyStore'

export function getToken() {
    return cache.get(tokenKey)
}

export function getNickname() {
    return cache.get(nicknameKey)
}

export function getVipLevel() {
    return cache.get(vipLevelKey)
}

export function getPhone() {
    return cache.get(phoneKey)
}

export function getAvatar() {
    return cache.get(avatarKey)
}

export function getIntegration() {
    return cache.get(integrationKey)
}

export function getCouponCount() {
    return cache.get(couponCountKey)
}

export function getStoreList() {
    return cache.get(storeListKey)
}

export function getStore() {
    return cache.get(storeKey)
}

export function getProjectList() {
    return cache.get(projectListKey)
}

export function getInvitationCode() {
    return cache.get(invitationCodeKey)
}

export function setCouponCount(couponCount) {
    return cache.put(couponCountKey, couponCount)
}

// 保存用户信息
function saveAuth(customer) {
    if (customer) {
        const {id, token, nickname, phone, avatar, integration, couponCount, invitationCode, vipLevel} = customer;
        cache.put(nicknameKey, nickname);
        cache.put(phoneKey, phone);
        cache.put(avatarKey, avatar ? avatar : '');
        cache.put(integrationKey, integration);
        cache.put(couponCountKey, couponCount);
        cache.put(invitationCodeKey, invitationCode);
        cache.put(vipLevelKey, vipLevel);
        if (token) {
            cache.put(tokenKey, token);
        }
    }
}

// 清除用户信息
function clearUser() {
    cache.remove(tokenKey);
    cache.remove(nicknameKey);
    cache.remove(phoneKey);
    cache.remove(avatarKey);
    cache.remove(integrationKey);
    cache.remove(couponCountKey);
    cache.remove(invitationCodeKey);
    cache.remove(vipLevelKey);

    cache.remove('userInfo')
    cache.remove('token')
}

// 获取积分
async function updIntegration() {
    const integration = await customerApi.getIntegration();
    cache.put(integrationKey, integration);
}

// 获取优惠券数量
async function updCouponCount() {
    const couponCount = await customerCouponApi.getCouponCount()
    cache.put(couponCountKey, couponCount);
}

//门店
async function updStoreList(reset = false) {
    const storeList = await shopApi.list({all: true}) || []
    cache.put(storeListKey, storeList);
    const store = cache.get(storeKey) || {}
    if (reset || (storeList.length && !store.id)) {
        setStore(storeList[0])
    }
}

export function setStore(store) {
    if (!store.id){
        return
    }
    cache.put(storeKey, store)
}

//项目
async function updProjectList() {
    const productList = await productApi.list({type: 0, state: 1, order: 'sequence'}) || []
    if (!(productList && productList.length)) {
        cache.remove(projectListKey);
        return
    }
    productList.forEach(s => {
        s.productId = s.id
        if (s.projectList && s.projectList.length) {
            s.projectId = s.projectList[0].id
            s.type = s.projectList[0].type
        }
    })
    cache.put(projectListKey, productList);
}

// 获取vip等级
async function updVipLevel() {
    const vipLevel = await customerApi.getCustomerVipLevel();
    cache.put(vipLevelKey, vipLevel)
}

export default {
    getNickname,
    getPhone,
    getAvatar,
    getIntegration,
    getCouponCount,
    setCouponCount,
    getStoreList,
    getStore,
    getToken,
    getInvitationCode,
    getProjectList,
    getVipLevel,
    updVipLevel,
    saveAuth,
    clearUser,
    updIntegration,
    updCouponCount,
    updStoreList,
    updProjectList,
    setStore
}
