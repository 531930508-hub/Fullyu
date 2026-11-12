import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '../../common/decorators/public.decorator'
import { StorageService } from '../../common/storage/storage.service'
import { TrainerPortalService, type ProposalInput, type TrainerApplicationInput } from './trainer-portal.service'
import type { TrainerContext } from './trainer-jwt.strategy'

/** multer 内存文件最小类型（避免额外依赖 @types/multer） */
interface UploadedMulterFile {
  originalname: string
  mimetype: string
  buffer: Buffer
  size: number
}

/** 门户图片上传只放行这三种格式，与 OSS 图片处理规则一致 */
const IMAGE_MIME_RE = /^image\/(jpeg|png|webp)$/i
/** 门户图片用途白名单：决定 OSS 目录，避免前端随意指定路径 */
const UPLOAD_DIRS = ['avatar', 'cover', 'portfolio'] as const

/**
 * 导师门户接口。
 *
 * 除入驻申请与登录外全部要求导师令牌；req.user 由 TrainerJwtStrategy 从数据库解析，
 * 路由里没有任何 trainerId 参数，导师无法通过改 id 越权到别人的课程与学员。
 */
@ApiTags('导师门户')
@Controller('trainer-portal')
export class TrainerPortalController {
  constructor(
    private readonly service: TrainerPortalService,
    private readonly storage: StorageService,
  ) {}

  // ---------- 公开 ----------

  @Public()
  @Post('apply')
  @ApiOperation({ summary: '提交导师入驻申请（公开）' })
  async apply(@Body() body: TrainerApplicationInput) {
    return this.service.submitApplication(body)
  }

  @Public()
  @Get('options')
  @ApiOperation({ summary: '门户下拉项：场地、密码策略（公开）' })
  async options() {
    return this.service.options()
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: '导师门户登录（手机号 + 密码）' })
  async login(@Body() body: { phone: string; password: string }) {
    return this.service.login(body.phone, body.password)
  }

  // ---------- 需导师登录 ----------

  @Get('me')
  @UseGuards(AuthGuard('trainer-jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '门户首页：身份与本月概览' })
  async me(@Request() req: { user: TrainerContext }) {
    return this.service.me(req.user)
  }

  /**
   * 门户图片上传（头像 / 提案封面 / 作品）。
   *
   * 走服务端中转而不是前端直传：导师令牌与学员令牌隔离，直传签名需要额外
   * 一套公开接口；这里复用导师守卫，顺便用 magic-free 的 MIME 白名单兜底。
   */
  @Post('upload')
  @UseGuards(AuthGuard('trainer-jwt'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传门户图片，返回 OSS key 与可预览签名地址' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: UploadedMulterFile,
    @Body('dir') dir?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('缺少图片文件')
    if (!IMAGE_MIME_RE.test(file.mimetype || '')) {
      throw new BadRequestException('仅支持 JPG / PNG / WEBP 图片')
    }
    const scope = UPLOAD_DIRS.includes(dir as (typeof UPLOAD_DIRS)[number]) ? dir! : 'misc'
    const key = this.storage.buildObjectKey(`trainer/${scope}`, file.originalname || 'image.jpg')
    await this.storage.putBuffer(key, file.buffer, file.mimetype)
    return { key, url: this.storage.signedUrl(key) }
  }

  @Put('me')
  @UseGuards(AuthGuard('trainer-jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '维护对外资料（一句话介绍/城市/简介/作品）' })
  async updateMe(@Request() req: { user: TrainerContext }, @Body() body: Record<string, any>) {
    return this.service.updateMe(req.user, body)
  }

  @Post('password')
  @UseGuards(AuthGuard('trainer-jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改登录密码' })
  async changePassword(
    @Request() req: { user: TrainerContext },
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    return this.service.changePassword(req.user, body.oldPassword, body.newPassword)
  }

  @Get('courses')
  @UseGuards(AuthGuard('trainer-jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的课程（phase=upcoming|finished）' })
  async courses(@Request() req: { user: TrainerContext }, @Query('phase') phase?: string) {
    return this.service.myCourses(req.user, { phase })
  }

  @Get('courses/:id/roster')
  @UseGuards(AuthGuard('trainer-jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '课程学员名单（仅本人课程，开课前 3 小时开放）' })
  async roster(@Request() req: { user: TrainerContext }, @Param('id') id: string) {
    return this.service.courseRoster(req.user, id)
  }

  @Get('proposals')
  @UseGuards(AuthGuard('trainer-jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的课程提案' })
  async proposals(@Request() req: { user: TrainerContext }) {
    return this.service.listProposals(req.user)
  }

  @Get('proposals/:id')
  @UseGuards(AuthGuard('trainer-jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '提案详情' })
  async proposal(@Request() req: { user: TrainerContext }, @Param('id') id: string) {
    return this.service.getProposal(req.user, id)
  }

  @Post('proposals')
  @UseGuards(AuthGuard('trainer-jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '保存课程提案（submit=true 提交审核）' })
  async saveProposal(@Request() req: { user: TrainerContext }, @Body() body: ProposalInput) {
    return this.service.saveProposal(req.user, body)
  }

  @Post('proposals/:id/submit')
  @UseGuards(AuthGuard('trainer-jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交已有草稿' })
  async submitProposal(@Request() req: { user: TrainerContext }, @Param('id') id: string) {
    return this.service.submitProposal(req.user, id)
  }
}