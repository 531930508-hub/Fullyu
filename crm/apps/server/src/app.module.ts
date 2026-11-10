import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ApiModule } from './api/api.module';
import { jwtSecret } from './config';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: jwtSecret(),
      signOptions: { expiresIn: '12h' }
    }),
    AuthModule,
    ApiModule
  ]
})
export class AppModule {}
