import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Staff } from './decorators';
import { StaffGuard } from './staff.guard';
import type { StaffContext } from '../common/auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { username?: string; password?: string }) {
    return this.auth.login(body.username || '', body.password || '');
  }

  @Get('me')
  @UseGuards(StaffGuard)
  me(@Staff() staff: StaffContext) {
    return { staff: this.auth.serialize(staff) };
  }
}
