import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import { TrainerPortalService } from './trainer-portal.service'
import { TrainerPortalAdminService } from './trainer-portal-admin.service'
import { TrainerPortalController } from './trainer-portal.controller'
import { TrainerPortalAdminController } from './trainer-portal-admin.controller'
import { TrainerJwtStrategy } from './trainer-jwt.strategy'

@Module({
  imports: [
    PassportModule,
    // 导师令牌独立签发/校验：与后台管理员、小程序用户互不复用
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('TRAINER_JWT_SECRET') || config.get('JWT_SECRET'),
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  controllers: [TrainerPortalController, TrainerPortalAdminController],
  providers: [TrainerPortalService, TrainerPortalAdminService, TrainerJwtStrategy],
  exports: [TrainerPortalService],
})
export class TrainerPortalModule {}