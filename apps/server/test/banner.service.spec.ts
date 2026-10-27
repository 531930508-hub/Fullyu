jest.mock('ali-oss', () => jest.fn())

import { BannerService } from '../src/modules/banner/banner.service'

describe('BannerService OSS 图片处理', () => {
  const expiredUrl =
    'https://presence.oss-cn-hangzhou.aliyuncs.com/banner/2026/09/03/example.png?OSSAccessKeyId=test&Expires=1&Signature=expired'
  const objectKey = 'banner/2026/09/03/example.png'
  const freshUrl = 'https://signed.example.com/banner/2026/09/03/example.png?fresh=1'

  it('返回 Banner 列表时为历史 OSS 签名 URL 重新签名', async () => {
    const prisma = {
      banner: {
        findMany: jest.fn().mockResolvedValue([{ id: 'banner-1', imageUrl: expiredUrl }]),
      },
    }
    const storage = {
      signedUrl: jest.fn().mockReturnValue(freshUrl),
    }
    const service = new (BannerService as any)(prisma, storage)

    await expect(service.listActive()).resolves.toEqual([{ id: 'banner-1', imageUrl: freshUrl }])
    expect(storage.signedUrl).toHaveBeenCalledWith(objectKey)
  })

  it('创建 Banner 时只持久化 OSS 对象 key', async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve(data))
    const prisma = { banner: { create } }
    const storage = { signedUrl: jest.fn() }
    const service = new (BannerService as any)(prisma, storage)

    await service.create({ title: '测试', imageUrl: expiredUrl })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: objectKey }),
      }),
    )
  })
})
