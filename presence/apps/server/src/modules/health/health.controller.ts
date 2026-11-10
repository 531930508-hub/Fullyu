import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { Public } from '../../common/decorators/public.decorator'

@ApiTags('系统')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '健康检查' })
  async check() {
    const result: Record<string, string> = { status: 'ok' }

    try {
      await this.prisma.$queryRaw`SELECT 1`
      result.database = 'ok'
    } catch {
      result.database = 'down'
      result.status = 'degraded'
    }

    try {
      await this.redis.set('health:ping', '1', 5)
      result.redis = 'ok'
    } catch {
      result.redis = 'down'
      result.status = 'degraded'
    }

    return { ...result, timestamp: new Date().toISOString() }
  }
}
