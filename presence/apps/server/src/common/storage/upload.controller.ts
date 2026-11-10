import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger'
import { StorageService } from './storage.service'
import { AdminAuth } from '../decorators/admin-auth.decorator'
import { JwtAuthGuard } from '../guards/jwt-auth.guard'
import { UseGuards } from '@nestjs/common'
import { ApiBearerAuth } from '@nestjs/swagger'

/** multer 上传文件最小类型（避免依赖 @types/multer） */
interface UploadedMulterFile {
  originalname: string
  mimetype: string
  buffer: Buffer
  size: number
}

@ApiTags('文件上传')
@Controller('upload')
export class UploadController {
  constructor(private readonly storage: StorageService) {}

  /** 后台代传上传（图片/文档） */
  @Post('server')
  @AdminAuth('upload:create')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '服务端代传文件' })
  @UseInterceptors(FileInterceptor('file'))
  async serverUpload(
    @UploadedFile() file: UploadedMulterFile,
    @Body('dir') dir = 'common',
  ) {
    if (!file) throw new BadRequestException('缺少文件')
    const key = this.storage.buildObjectKey(dir, file.originalname)
    await this.storage.putBuffer(key, file.buffer, file.mimetype)
    return { key, url: this.storage.signedUrl(key) }
  }

  /** 获取前端直传签名（后台） */
  @Post('policy')
  @AdminAuth('upload:create')
  @ApiOperation({ summary: '获取 OSS 直传签名' })
  async policy(@Body() body: { dir?: string; filename: string; maxSizeMB?: number }) {
    return this.storage.directUploadPolicy(body.dir ?? 'common', body.filename, body.maxSizeMB)
  }

  /** 小程序端直传签名（用户登录态） */
  @Post('client-policy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '小程序获取 OSS 直传签名' })
  async clientPolicy(@Body() body: { dir?: string; filename: string }) {
    return this.storage.directUploadPolicy(body.dir ?? 'user', body.filename, 10)
  }
}
