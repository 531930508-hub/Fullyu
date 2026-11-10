import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisService } from './redis.service'

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const Redis = require('ioredis')
        const client = new Redis({
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD', ''),
          db: configService.get('REDIS_DB', 0),
          // 连不上时命令快速失败，避免请求挂起；重连退避拉长至最长 30s，减少后台尝试频率
          enableOfflineQueue: false,
          maxRetriesPerRequest: 2,
          retryStrategy: (times: number) => Math.min(times * 1000, 30000),
        })
        // 只在首次异常时提示一次，之后彻底静默，避免刷屏；重连成功（ready）后重置，
        // 以便下次真断开时再提示一次。Redis 仅用于报名/支付/候补并发锁，
        // 登录/浏览/签到等功能不受影响。
        let errorLogged = false
        client.on('error', (err: Error) => {
          if (!errorLogged) {
            errorLogged = true
            console.warn(
              `[Redis] 连接失败，已静默后续同类错误（本地无 Redis 时属正常，仅影响报名/支付/候补并发锁）：${err.message}`,
            )
          }
        })
        client.on('ready', () => {
          errorLogged = false
        })
        return client
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
