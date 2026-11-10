import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ExternalGuard, type ExternalRequest } from './external.guard';
import { ExternalService, type PointChangeInput, type ResolveInput } from './external.service';

/**
 * 业务端（时叙 / 轻疗 / 在场）调用入口。
 * 路径含 /api 前缀，签名按完整 originalUrl 计算。
 */
@Controller('external')
@UseGuards(ExternalGuard)
export class ExternalController {
  constructor(private readonly external: ExternalService) {}

  @Post('members/resolve')
  @HttpCode(200)
  resolve(@Body() body: ResolveInput, @Req() req: ExternalRequest) {
    return this.external.resolve(body, req.external!);
  }

  @Get('members/:localUserId')
  get(@Param('localUserId') localUserId: string, @Req() req: ExternalRequest) {
    return this.external.getByLocalUser(localUserId, req.external!);
  }

  @Post('members/import')
  @HttpCode(200)
  importMembers(@Body() body: { members?: ResolveInput[] }, @Req() req: ExternalRequest) {
    return this.external.importMembers(body?.members || [], req.external!);
  }

  @Post('points/earn')
  @HttpCode(200)
  earn(@Body() body: PointChangeInput, @Req() req: ExternalRequest) {
    return this.external.earn(body, req.external!);
  }

  @Post('points/consume')
  @HttpCode(200)
  consume(@Body() body: PointChangeInput, @Req() req: ExternalRequest) {
    return this.external.consume(body, req.external!);
  }
}
