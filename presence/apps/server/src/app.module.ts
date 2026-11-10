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
import { OrgModule } from './modules/org/org.module'
import { DictModule } from './modules/dict/dict.module'
import { ApprovalModule } from './modules/approval/approval.module'
import { TodoModule } from './modules/todo/todo.module'
import { ScmModule } from './modules/scm/scm.module'
import { FinanceModule } from './modules/finance/finance.module'
import { BannerModule } from './modules/banner/banner.module'
import { TimeDiscountModule } from './modules/time-discount/time-discount.module'
import { CommunityModule } from './modules/community/community.module'
import { ShareModule } from './modules/share/share.module'
import { PrismaModule } from './common/prisma.module'
import { RedisModule } from './common/redis.module'
import { PasswordPolicyModule } from './common/password-policy.service'
import { WechatModule } from './common/wechat/wechat.module'
import { StorageModule } from './common/storage/storage.module'
import { NotificationModule } from './common/notification/notification.module'
import { SmsModule } from './common/sms/sms.module'
import { PricingModule } from './modules/pricing/pricing.module'
import { CrmModule } from './common/crm/crm.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'
import { ImageUrlInterceptor } from './common/interceptors/image-url.interceptor'

// 仅本地开发开关：启动时传入 DISABLE_SCHEDULER=true 可关掉所有 @Cron 定时任务（order-tasks / waitlist-tasks 等）。
// 开关只通过启动命令传入（不写入 .env.local / git / 镜像），生产启动时天然无此变量，cron 照常运行。
const SCHEDULER_DISABLED = process.env.DISABLE_SCHEDULER === 'true'
if (SCHEDULER_DISABLED) {
  // eslint-disable-next-line no-console
  console.warn(
    '⚠️  [SCHEDULER] 已禁用所有定时任务（DISABLE_SCHEDULER=true）——仅限本地开发！',
  )
}

@Module({
  imports: [
    // 全局配置
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // 定时任务（本地 DISABLE_SCHEDULER=true 时不注册，避免 cron 刷错日志）
    ...(SCHEDULER_DISABLED ? [] : [ScheduleModule.forRoot()]),
    // 限流：默认 60 秒内单 IP 最多 100 次
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 100 },
    ]),
    // 基础服务
    PrismaModule,
    RedisModule,
    PasswordPolicyModule,
    WechatModule,
    StorageModule,
    NotificationModule,
    SmsModule,
    PricingModule,
    CrmModule,
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
    OrgModule,
    DictModule,
    ApprovalModule,
    TodoModule,
    ScmModule,
    FinanceModule,
    BannerModule,
    TimeDiscountModule,
    CommunityModule,
    ShareModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    // 放在 Transform 之后：让原始业务数据先完成图片签名，再统一包 { code, data }
    { provide: APP_INTERCEPTOR, useClass: ImageUrlInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
