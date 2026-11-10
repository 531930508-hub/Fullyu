import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { CustomerGuard } from './customer.guard';
import { StaffGuard } from './staff.guard';
import { Customer, Staff } from './decorators';
import { parseInput } from '../common/zod';
import type { CustomerContext, StaffContext } from '../common/auth.types';
import { mapStaffSummary } from '../common/mappers';

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

const sessionSchema = z.object({
  // SEC-01：会员码不再参与建会话。这里不声明该字段，zod 会直接剥离旧客户端
  // 带来的 memberCode，避免任何「凭会员码恢复他人会话」的路径复活。
  name: z.string().trim().max(30).optional(),
  phone: z.string().trim().max(20).optional()
});

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/login')
  async login(@Body() body: unknown, @Req() req: Request) {
    const input = parseInput(loginSchema, body);
    return this.authService.login(input.username, input.password, req.ip);
  }

  @Get('auth/me')
  @UseGuards(StaffGuard)
  async me(@Staff() staff: StaffContext) {
    return { staff: mapStaffSummary(staff) };
  }

  @Post('customer/session')
  async customerSession(@Body() body: unknown) {
    const input = parseInput(sessionSchema, body ?? {});
    const { token, customer } = await this.authService.createCustomerSession(input);
    return { token, customer };
  }

  @Get('customer/me')
  @UseGuards(CustomerGuard)
  async customerMe(@Customer() customer: CustomerContext) {
    // 守卫只带轻量身份字段，资料（头像/性别/生日）需要回库取完整档案。
    return { customer: await this.authService.customerMe(customer.id) };
  }
}
