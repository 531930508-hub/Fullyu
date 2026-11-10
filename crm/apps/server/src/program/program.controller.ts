import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { BrandMemberGuard, type BrandMemberRequest } from '../brand-member/brand-member.guard';
import { RequirePerm, Staff } from '../auth/decorators';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import type { StaffContext } from '../common/auth.types';
import { ProgramService } from './program.service';
import { GiftQrService } from './gift-qr.service';

/** 三端调用：订单上报、会员码、反馈/故事、在场附赠与邀请、退款试算。 */
@Controller('v1/brand-member')
@UseGuards(BrandMemberGuard)
export class ProgramExternalController {
  constructor(private readonly program: ProgramService) {}

  @Post('orders/report')
  @HttpCode(200)
  reportOrder(@Body() body: unknown, @Req() req: BrandMemberRequest) {
    return this.program.reportOrder(body, req.fy!);
  }

  @Post('orders/refund')
  @HttpCode(200)
  refundOrder(@Body() body: unknown, @Req() req: BrandMemberRequest) {
    return this.program.refundOrder(body, req.fy!);
  }

  @Get('refund-quote')
  refundQuote(@Query() query: unknown, @Req() req: BrandMemberRequest) {
    return this.program.externalRefundQuote(query, req.fy!);
  }

  @Post('gift/claim')
  @HttpCode(201)
  claimGift(@Body() body: unknown, @Req() req: BrandMemberRequest) {
    return this.program.claimGift(body, req.fy!);
  }

  @Post('feedback')
  @HttpCode(201)
  feedback(@Body() body: unknown, @Req() req: BrandMemberRequest) {
    return this.program.submitFeedback(body, req.fy!);
  }

  @Get('stories')
  stories(@Query() query: unknown, @Req() req: BrandMemberRequest) {
    return this.program.memberStories(query, req.fy!);
  }

  @Post('bundle')
  @HttpCode(200)
  bundle(@Body() body: unknown, @Req() req: BrandMemberRequest) {
    return this.program.bundlePass(body, req.fy!);
  }

  @Post('bundle/revoke')
  @HttpCode(200)
  revokeBundle(@Body() body: unknown, @Req() req: BrandMemberRequest) {
    return this.program.revokeBundle(body, req.fy!);
  }

  @Get('invites')
  invites(@Query() query: unknown, @Req() req: BrandMemberRequest) {
    return this.program.listInvites(query, req.fy!);
  }

  @Post('invites/create')
  @HttpCode(201)
  createInvite(@Body() body: unknown, @Req() req: BrandMemberRequest) {
    return this.program.createInvite(body, req.fy!);
  }

  @Post('invites/claim')
  @HttpCode(200)
  claimInvite(@Body() body: unknown, @Req() req: BrandMemberRequest) {
    return this.program.claimInvite(body, req.fy!);
  }
}

/** CRM 后台：会员码、提货券核销、反馈与故事、退款试算与协商退款、会员净消费。 */
@Controller()
@UseGuards(StaffGuard, PermissionsGuard)
export class ProgramAdminController {
  constructor(
    private readonly program: ProgramService,
    private readonly giftQr: GiftQrService
  ) {}

  @Get('gift-campaigns')
  @RequirePerm('crm:card:view')
  campaigns(@Query() query: unknown) {
    return this.program.listCampaigns(query);
  }

  @Get('gift-campaigns/:id')
  @RequirePerm('crm:card:view')
  campaign(@Param('id') id: string) {
    return this.program.campaignDetail(id);
  }

  @Post('gift-campaigns')
  @RequirePerm('crm:gift:edit')
  createCampaign(@Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.createCampaign(body, staff);
  }

  @Post('gift-campaigns/:id/approve')
  @HttpCode(200)
  @RequirePerm('crm:gift:approve')
  approve(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.decideCampaign(id, 'approve', body, staff);
  }

  @Post('gift-campaigns/:id/reject')
  @HttpCode(200)
  @RequirePerm('crm:gift:approve')
  reject(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.decideCampaign(id, 'reject', body, staff);
  }

  @Post('gift-campaigns/:id/pause')
  @HttpCode(200)
  @RequirePerm('crm:gift:edit')
  pause(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.program.toggleCampaign(id, 'pause', staff);
  }

  @Post('gift-campaigns/:id/resume')
  @HttpCode(200)
  @RequirePerm('crm:gift:edit')
  resume(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.program.toggleCampaign(id, 'resume', staff);
  }

  @Post('gift-campaigns/:id/target')
  @HttpCode(200)
  @RequirePerm('crm:gift:edit')
  updateTarget(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.updateCampaignTarget(id, body, staff);
  }

  /** 微信小程序码（PNG）。env=release|trial|develop，缺省读环境配置。 */
  @Get('gift-campaigns/:id/qrcode')
  @RequirePerm('crm:card:view')
  async qrcode(
    @Param('id') id: string,
    @Query() query: unknown,
    @Res() res: Response
  ): Promise<void> {
    const env = (query as { env?: unknown } | null)?.env;
    const qr = await this.giftQr.generate(id, env);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${qr.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(qr.buffer);
  }

  @Get('vouchers/:code')
  @RequirePerm('crm:voucher:redeem')
  voucher(@Param('code') code: string) {
    return this.program.lookupVoucher(code);
  }

  @Post('vouchers/:code/redeem')
  @HttpCode(200)
  @RequirePerm('crm:voucher:redeem')
  redeem(@Param('code') code: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.redeemVoucher(code, body, staff);
  }

  @Get('feedback')
  @RequirePerm('crm:feedback:handle')
  feedback(@Query() query: unknown) {
    return this.program.listFeedback(query);
  }

  @Post('feedback/:id')
  @HttpCode(200)
  @RequirePerm('crm:feedback:handle')
  updateFeedback(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.updateFeedback(id, body, staff);
  }

  @Get('stories')
  @RequirePerm('crm:feedback:handle')
  stories() {
    return this.program.listStories();
  }

  @Post('stories')
  @RequirePerm('crm:feedback:handle')
  createStory(@Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.saveStory(null, body, staff);
  }

  @Post('stories/:id')
  @HttpCode(200)
  @RequirePerm('crm:feedback:handle')
  updateStory(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.saveStory(id, body, staff);
  }

  @Post('stories/:id/publish')
  @HttpCode(200)
  @RequirePerm('crm:feedback:handle')
  publish(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.program.setStoryStatus(id, 'PUBLISHED', staff);
  }

  @Post('stories/:id/archive')
  @HttpCode(200)
  @RequirePerm('crm:feedback:handle')
  archive(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.program.setStoryStatus(id, 'ARCHIVED', staff);
  }

  @Get('notices')
  @RequirePerm('crm:feedback:handle')
  notices() {
    return this.program.listNotices();
  }

  @Post('notices')
  @RequirePerm('crm:feedback:handle')
  createNotice(@Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.saveNotice(null, body, staff);
  }

  @Post('notices/:id')
  @HttpCode(200)
  @RequirePerm('crm:feedback:handle')
  updateNotice(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.saveNotice(id, body, staff);
  }

  @Post('notices/:id/publish')
  @HttpCode(200)
  @RequirePerm('crm:feedback:handle')
  publishNotice(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.program.setNoticeStatus(id, 'PUBLISHED', staff);
  }

  @Post('notices/:id/archive')
  @HttpCode(200)
  @RequirePerm('crm:feedback:handle')
  archiveNotice(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.program.setNoticeStatus(id, 'ARCHIVED', staff);
  }

  @Get('issued-cards')
  @RequirePerm('crm:card:view')
  issuedCards(@Query() query: unknown) {
    return this.program.adminCards(query);
  }

  @Get('issued-cards/:id')
  @RequirePerm('crm:card:view')
  issuedCard(@Param('id') id: string) {
    return this.program.adminCardDetail(id);
  }

  @Post('issued-cards')
  @HttpCode(201)
  @RequirePerm('crm:card:edit')
  issueCard(@Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.manualIssue(body, staff);
  }

  @Post('issued-cards/:id/refund')
  @HttpCode(200)
  @RequirePerm('crm:refund:force')
  refundIssuedCard(
    @Param('id') id: string,
    @Body() body: unknown,
    @Staff() staff: StaffContext
  ) {
    return this.program.adminRefundCard(id, body, staff);
  }

  @Post('issued-cards/:id/retry')
  @HttpCode(200)
  @RequirePerm('crm:card:edit')
  retryIssuedCard(
    @Param('id') id: string,
    @Body() body: unknown,
    @Staff() staff: StaffContext
  ) {
    return this.program.adminRetryCard(id, body, staff);
  }

  @Post('members/:id/unlock')
  @HttpCode(200)
  @RequirePerm('crm:refund:force')
  unlockMember(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.program.adminUnlockMember(id, staff);
  }

  @Get('member-cards/:id/refund-quote')
  @RequirePerm('crm:member:view')
  refundQuote(@Param('id') id: string) {
    return this.program.adminRefundQuote(id);
  }

  @Post('member-cards/:id/force-refund')
  @HttpCode(200)
  @RequirePerm('crm:refund:force')
  forceRefund(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    return this.program.forceRefund(id, body, staff);
  }

  @Get('members/:id/program')
  @RequirePerm('crm:member:view')
  memberProgram(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.program.memberProgram(id, staff);
  }
}
