import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { HardwareModule } from './hardware/hardware.module';
import { PrismaModule } from './common/prisma.module';
import { ApiModule } from './api/api.module';
import { jwtSecret } from './config/config';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: jwtSecret(),
      signOptions: { expiresIn: '12h' }
    }),
    // 顾客微信登录等无需身份的入口单独限流；后台登录走失败计数（只统计错误密码）。
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    AuthModule,
    HardwareModule,
    ApiModule
  ]
})
export class AppModule {}
