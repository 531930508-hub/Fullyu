import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { StaffService } from './staff.service';
import { unauthorized } from '../common/errors';
import { audit } from '../common/audit';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly staffService: StaffService
  ) {}

  async login(username: string, password: string) {
    const row = await this.prisma.staff.findUnique({ where: { username: (username || '').trim() } });
    if (!row || !bcrypt.compareSync(password || '', row.passwordHash)) {
      throw unauthorized('账号或密码不正确');
    }
    if (!row.active) throw unauthorized('账号已停用，请联系管理员');
    const staff = await this.staffService.load(row.id);
    if (!staff) throw unauthorized('账号不存在');
    const token = await this.jwt.signAsync(
      { kind: 'staff', sub: staff.id, ver: row.tokenVersion },
      { expiresIn: '12h' }
    );
    await audit(this.prisma, {
      actor: staff,
      action: '登录后台',
      target: staff.username,
      detail: staff.name
    });
    return { token, staff: this.serialize(staff) };
  }

  serialize(staff: { id: string; name: string; username: string; perms: Set<string> }) {
    return {
      id: staff.id,
      name: staff.name,
      username: staff.username,
      perms: [...staff.perms].sort()
    };
  }
}
