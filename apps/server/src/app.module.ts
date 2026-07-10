import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core'
import { AuthModule } from './modules/auth/auth.module'
import { UserModule } from './modules/user/user.module'
import { CourseModule } from './modules/course/course.module'
import { OrderModule } from './modules/order/order.module'
import { PaymentModule } from './modules/payment/payment.module'
import { WaitlistModule } from './modules/waitlist/waitlist.module'
import { MemberModule } from './modules/member/member.module'
import { HealthModule } from './modules/health/health.module'
import { TrainerModule } from './modules/trainer/trainer.module'
import { VenueModule } from './modules/venue/venue.module'
import { VoucherModule } from './modules/voucher/voucher.module'
import { TaskModule } from './modules/task/task.module'
import { MaterialModule } from './modules/material/material.module'
import { CheckinModule } from './modules/checkin/checkin.module'
import { ReviewModule } from './modules/review/review.module'
import { SettlementModule } from './modules/settlement/settlement.module'
import { AnalyticsModule } from './modules/analytics/analytics.module'
import { RbacModule } from './modules/rbac/rbac.module'
import { DictModule } from './modules/dict/dict.module'
import { PrismaModule } from './common/prisma.module'
import { RedisModule } from './common/redis.module'
import { WechatModule } from './common/wechat/wechat.module'
import { StorageModule } from './common/storage/storage.module'
import { NotificationModule } from './common/notification/notification.module'
import { SmsModule } from './common/sms/sms.module'
import { PricingModule } from './modules/pricing/pricing.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'

@Module({
  imports: [
    // 全局配置
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // 定时任务
    ScheduleModule.forRoot(),
    // 限流：默认 60 秒内单 IP 最多 100 次
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 100 },
    ]),
    // 基础服务
    PrismaModule,
    RedisModule,
    WechatModule,
    StorageModule,
    NotificationModule,
    SmsModule,
    PricingModule,
    // 业务模块
    AuthModule,
    UserModule,
    CourseModule,
    OrderModule,
    PaymentModule,
    WaitlistModule,
    MemberModule,
    HealthModule,
    TrainerModule,
    VenueModule,
    VoucherModule,
    TaskModule,
    MaterialModule,
    CheckinModule,
    ReviewModule,
    SettlementModule,
    AnalyticsModule,
    RbacModule,
    DictModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
