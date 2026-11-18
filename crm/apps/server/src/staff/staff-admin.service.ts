import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { audit } from '../common/audit';
import { ApiError, badRequest, conflict, notFound } from '../common/errors';
import { newId } from '../common/ids';
import type { StaffContext } from '../common/auth.types';

/** CRM 管理员角色固定 id；用于「最后一名管理员」保护。 */
const ADMIN_ROLE_ID = 'crm-admin';
const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const PASSWORD_MIN = 8;
const NAME_MAX = 20;

type RoleLink = { roleId: string; role: { id: string; name: string } };
type StaffRow = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  createdAt: Date;
  tokenVersion: number;
  roles: RoleLink[];
};

type StaffInput = {
  name?: unknown;
  username?: unknown;
  password?: unknown;
  roleIds?: unknown;
  active?: unknown;
};

@Injectable()
export class StaffAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.staff.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { roles: { include: { role: true } } }
    });
    return { staff: rows.map((row) => this.toView(row)) };
  }

  async create(input: StaffInput, actor: StaffContext) {
    const name = this.readName(input?.name);
    const username = this.readUsername(input?.username);
    const password = this.readPassword(input?.password, '初始密码');
    const roleIds = this.readRoleIds(input?.roleIds);
    await this.assertRolesExist(roleIds);
    const duplicate = await this.prisma.staff.findUnique({ where: { username } });
    if (duplicate) throw conflict('账号已存在', { code: 'STAFF_USERNAME_EXISTS' });

    const active = input?.active === undefined ? true : Boolean(input.active);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.staff.create({
        data: {
          id: newId('staff'),
          name,
          username,
          passwordHash: bcrypt.hashSync(password, 10),
          active
        }
      });
      for (const roleId of roleIds) {
        await tx.staffRole.create({ data: { staffId: row.id, roleId } });
      }
      return tx.staff.findUnique({
        where: { id: row.id },
        include: { roles: { include: { role: true } } }
      });
    });
    if (!created) throw new ApiError(500, '账号创建失败');

    await audit(this.prisma, {
      actor,
      action: '新增用户',
      target: `${created.name}（${created.username}）`,
      detail: `角色：${created.roles.map((link) => link.role.name).join('、') || '无'}；${
        active ? '启用' : '停用'
      }`
    });
    return { staff: this.toView(created) };
  }

  async update(id: string, input: StaffInput, actor: StaffContext) {
    const row = await this.prisma.staff.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } }
    });
    if (!row) throw notFound('账号不存在', { code: 'STAFF_NOT_FOUND' });

    const name = input?.name === undefined ? row.name : this.readName(input.name);
    const roleIds =
      input?.roleIds === undefined ? row.roles.map((link) => link.roleId) : this.readRoleIds(input.roleIds);
    if (input?.roleIds !== undefined) await this.assertRolesExist(roleIds);
    const active = input?.active === undefined ? row.active : Boolean(input.active);

    const wasAdmin = row.roles.some((link) => link.roleId === ADMIN_ROLE_ID);
    const staysAdmin = roleIds.includes(ADMIN_ROLE_ID);

    if (id === actor.id && !active) {
      throw conflict('不能停用当前登录的账号', { code: 'STAFF_SELF_DEACTIVATE' });
    }
    if (id === actor.id && wasAdmin && !staysAdmin) {
      throw conflict('不能移除自己的 CRM 管理员角色', { code: 'STAFF_SELF_DEMOTE' });
    }
    if (wasAdmin && !(active && staysAdmin)) {
      const others = await this.prisma.staffRole.count({
        where: { roleId: ADMIN_ROLE_ID, staffId: { not: id }, staff: { active: true } }
      });
      if (others === 0) {
        throw conflict('系统需要保留至少一个启用中的 CRM 管理员', { code: 'LAST_ADMIN' });
      }
    }

    // 停用后旧令牌立即失效；改角色靠每次请求重新读取权限，不需要作废令牌。
    const deactivating = row.active && !active;
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.staff.update({
        where: { id },
        data: {
          name,
          active,
          ...(deactivating ? { tokenVersion: { increment: 1 } } : {})
        }
      });
      if (input?.roleIds !== undefined) {
        await tx.staffRole.deleteMany({ where: { staffId: id } });
        for (const roleId of roleIds) {
          await tx.staffRole.create({ data: { staffId: id, roleId } });
        }
      }
      return tx.staff.findUnique({
        where: { id },
        include: { roles: { include: { role: true } } }
      });
    });
    if (!updated) throw new ApiError(500, '账号更新失败');

    const changes: string[] = [];
    if (name !== row.name) changes.push(`姓名：${row.name} → ${name}`);
    if (active !== row.active) changes.push(active ? '启用' : '停用');
    if (input?.roleIds !== undefined) {
      changes.push(`角色：${updated.roles.map((link) => link.role.name).join('、') || '无'}`);
    }
    await audit(this.prisma, {
      actor,
      action: deactivating ? '停用用户' : '修改用户',
      target: `${updated.name}（${updated.username}）`,
      detail: changes.join('；') || '无变化'
    });
    return { staff: this.toView(updated) };
  }

  async resetPassword(id: string, input: { password?: unknown }, actor: StaffContext) {
    const row = await this.prisma.staff.findUnique({ where: { id } });
    if (!row) throw notFound('账号不存在', { code: 'STAFF_NOT_FOUND' });
    const password = this.readPassword(input?.password, '新密码');
    await this.prisma.staff.update({
      where: { id },
      data: { passwordHash: bcrypt.hashSync(password, 10), tokenVersion: { increment: 1 } }
    });
    await audit(this.prisma, {
      actor,
      action: '重置密码',
      target: `${row.name}（${row.username}）`,
      detail: '旧登录状态已失效'
    });
    return { ok: true, staffId: id };
  }

  private readName(value: unknown): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name) throw badRequest('姓名不能为空');
    if (name.length > NAME_MAX) throw badRequest(`姓名不能超过 ${NAME_MAX} 个字`);
    return name;
  }

  private readUsername(value: unknown): string {
    const username = typeof value === 'string' ? value.trim() : '';
    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
      throw badRequest(`账号长度需为 ${USERNAME_MIN}–${USERNAME_MAX} 个字符`);
    }
    if (/\s/.test(username)) throw badRequest('账号不能包含空格');
    return username;
  }

  private readPassword(value: unknown, label: string): string {
    const password = typeof value === 'string' ? value : '';
    if (password.length < PASSWORD_MIN) throw badRequest(`${label}至少 ${PASSWORD_MIN} 位`);
    if (password.length > 72) throw badRequest(`${label}不能超过 72 位`);
    return password;
  }

  private readRoleIds(value: unknown): string[] {
    if (!Array.isArray(value)) throw badRequest('roleIds 必须是角色 id 数组');
    const unique = [...new Set(value.map((roleId) => String(roleId)))];
    if (!unique.length) throw badRequest('至少选择一个角色');
    return unique;
  }

  private async assertRolesExist(roleIds: string[]) {
    const found = await this.prisma.crmRole.findMany({
      where: { id: { in: roleIds } },
      select: { id: true }
    });
    const missing = roleIds.filter((id) => !found.some((role) => role.id === id));
    if (missing.length) throw badRequest(`角色不存在：${missing.join(', ')}`);
  }

  private toView(row: StaffRow) {
    return {
      id: row.id,
      name: row.name,
      username: row.username,
      active: row.active,
      roles: row.roles.map((link) => ({ id: link.role.id, name: link.role.name })),
      createdAt: row.createdAt.toISOString()
    };
  }
}