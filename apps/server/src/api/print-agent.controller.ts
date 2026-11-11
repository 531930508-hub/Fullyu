import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException
} from '@nestjs/common';
import { PrintingService } from '../printing/printing.service';
import { printAgentTokens } from '../config/config';

/**
 * 门店打印代理接口（芯烨 XP-420B 专用）。
 *
 * 打印机的 USB 口在门店电脑上，云端服务器够不到，所以方向反过来：代理来取任务。
 * 鉴权用「门店 → 长随机令牌」，令牌即身份：
 *   - 没配 PRINT_AGENT_TOKENS 时一律 401，绝不匿名发杯贴内容（里面有顾客称呼）；
 *   - 同一个令牌只能领、只能回执自己门店的任务，跨店一律拒绝；
 *   - 领取是原子的，一家店开两个收银工位时不会重复出纸。
 */
@Controller('print-agent')
export class PrintAgentController {
  constructor(private readonly printing: PrintingService) {}

  /** 令牌 → 门店；比较哈希后定长时间比较，避免按字节泄漏令牌内容。 */
  private storeOfToken(token: string | undefined): string {
    const provided = (token || '').trim();
    if (!provided) throw new UnauthorizedException('缺少打印代理令牌');
    const providedHash = createHash('sha256').update(provided).digest();
    for (const [storeId, expected] of Object.entries(printAgentTokens())) {
      const expectedHash = createHash('sha256').update(expected).digest();
      if (providedHash.length === expectedHash.length && timingSafeEqual(providedHash, expectedHash)) {
        return storeId;
      }
    }
    throw new UnauthorizedException('打印代理令牌无效');
  }

  /** 自检：代理启动/排障时先打这个，确认网络、令牌与门店都对。 */
  @Get('health')
  health(@Headers('x-print-agent-token') token?: string) {
    const storeId = this.storeOfToken(token);
    return { ok: true, storeId, transport: this.printing.agentTransport, time: Date.now() };
  }

  /** 领一张待打杯贴：没有任务时返回 { job: null }，代理按轮询间隔继续等。 */
  @Post('claim')
  @HttpCode(200)
  async claim(@Headers('x-print-agent-token') token?: string) {
    const storeId = this.storeOfToken(token);
    const job = await this.printing.claimForAgent(storeId);
    return { job };
  }

  /** 回执：ok=true 才算真出纸；ok=false 会把失败原因记进任务并走退避重试。 */
  @Post('jobs/:id/result')
  @HttpCode(200)
  async result(
    @Param('id') jobId: string,
    @Body() body: { ok?: unknown; error?: unknown },
    @Headers('x-print-agent-token') token?: string
  ) {
    const storeId = this.storeOfToken(token);
    if (typeof body?.ok !== 'boolean') throw new BadRequestException('ok 必须是布尔值');
    if (body.ok) return this.printing.complete(jobId, storeId);
    const message = typeof body.error === 'string' && body.error.trim() ? body.error : '打印代理未说明失败原因';
    return this.printing.reject(jobId, message, storeId);
  }
}