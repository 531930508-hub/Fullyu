import { Controller, Get, Post, Body, Query, Res } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import type { Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { ShareService, ShareType, ShareArtwork } from './share.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('分享')
@Controller('share')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Get('target')
  @ApiOperation({ summary: '分享目标描述（卡片/海报共用数据）' })
  async target(@Query('type') type: ShareType, @Query('id') id: string) {
    return this.shareService.getPayload(type, id)
  }

  @Get('resolve')
  @ApiOperation({ summary: '扫码 scene 落地解析' })
  async resolve(@Query('scene') scene: string) {
    return this.shareService.resolveScene(scene)
  }

  @Get('qrcode')
  @ApiOperation({ summary: '分享二维码（小程序码优先，未配置微信凭据时回退 H5 链接码）' })
  async qrcode(@Query('scene') scene: string, @Res() res: Response) {
    const { buffer, engine } = await this.shareService.getQrBuffer(scene)
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('X-QR-Engine', engine)
    res.send(buffer)
  }

  @Get('art/default-5x4.jpg')
  @ApiOperation({ summary: '默认 5:4 品牌分享图' })
  async defaultArt(@Res() res: Response) {
    const file = path.join(process.cwd(), 'assets', 'share-default-5x4.jpg')
    if (!fs.existsSync(file)) {
      res.status(404).send('not found')
      return
    }
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=604800')
    res.send(await fs.promises.readFile(file))
  }

  @Post('artwork')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '保存社群/活动分享视觉配置' })
  async saveArtwork(
    @Body() body: {
      communityId?: string
      eventId?: string
      artwork?: Partial<ShareArtwork>
    },
  ) {
    return this.shareService.saveArtwork({
      communityId: body.communityId,
      eventId: body.eventId,
      artwork: body.artwork || {},
    })
  }

  @Get('preview-targets')
  @AdminAuth('community:view')
  @ApiOperation({ summary: '后台分享预览可选目标' })
  async previewTargets(@Query('communityId') communityId: string) {
    return this.shareService.previewTargets(communityId)
  }
}
