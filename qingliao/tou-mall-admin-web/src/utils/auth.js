import Cookies from 'js-cookie'

const TokenKey = 'loginToken'
const shopIdKey = 'shopId'

export function getToken() {
  return Cookies.get(TokenKey)
}

export function setToken(token) {
  return Cookies.set(TokenKey, token)
}

export function removeToken() {
  return Cookies.remove(TokenKey)
}

export function getShopId() {
  return Cookies.get(shopIdKey)
}

export function setShopId(shopId) {
  return Cookies.set(shopIdKey, shopId)
}

export function removeShopId() {
  return Cookies.remove(shopIdKey)
}
