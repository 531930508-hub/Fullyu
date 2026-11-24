import { t } from './locale'

export const SHARE_CARD_IMAGE = '/static/share/share-card.jpg'

export function defaultShareMessage() {
  return {
    title: t('邀请好友共同Full愈'),
    path: '/pages/index/index',
    imageUrl: SHARE_CARD_IMAGE,
  }
}

export function defaultShareTimeline() {
  return {
    title: t('邀请好友共同Full愈'),
    query: '',
    imageUrl: SHARE_CARD_IMAGE,
  }
}

type ShareHandler = (res: any) => ReturnType<typeof defaultShareMessage> | Promise<ReturnType<typeof defaultShareMessage>>

const pageShareHandlers = new WeakMap<object, ShareHandler>()

export function registerShareHandler(handler: ShareHandler) {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  if (page) pageShareHandlers.set(page, handler)
}

export function resolveShareMessage(res: any) {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  const handler = page && pageShareHandlers.get(page)
  return handler ? handler(res) : defaultShareMessage()
}
