import { Injectable } from '@nestjs/common';
import { CRM_PERMISSIONS, CRM_PERMISSION_CODES } from '@fullyu/crm-shared';
import { PrismaService } from '../common/prisma.service';
import { audit } from '../common/audit';
import { ApiError, badRequest } from '../common/errors';
import type { StaffContext } from '../common/auth.types';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const roles = await this.prisma.crmRole.findMany({ orderBy: { id: 'asc' } });
    return {
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        builtin: role.builtin,
        perms: JSON.parse(role.permsJson) as string[]
      })),
      permissions: CRM_PERMISSIONS
    };
  }

  async update(id: string, input: { perms?: string[] }, staff: StaffContext) {
    const role = await this.prisma.crmRole.findUnique({ where: { id } });
    if (!role) throw new ApiError(404, '角色不存在', { code: 'ROLE_NOT_FOUND' });
    if (role.id === 'crm-admin') {
      throw new ApiError(409, 'CRM 管理员固定拥有全部权限，不能修改', {
        code: 'ROLE_PROTECTED'
      });
    }
    const perms = input?.perms;
    if (!Array.isArray(perms)) throw badRequest('perms 必须是权限点数组');
    const unique = [...new Set(perms.map((perm) => String(perm)))];
    const unknown = unique.filter(
      (perm) => perm !== '*' && !CRM_PERMISSION_CODES.includes(perm as never)
    );
    if (unknown.length) throw badRequest(`未知权限点：${unknown.join(', ')}`);
    const updated = await this.prisma.crmRole.update({
      where: { id },
      data: { permsJson: JSON.stringify(unique) }
    });
    await audit(this.prisma, {
      actor: staff,
      action: '角色权限',
      target: `${role.name}（${role.id}）`,
      detail: unique.join(', ') || '（无）'
    });
    return {
      role: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        builtin: updated.builtin,
        perms: JSON.parse(updated.permsJson) as string[]
      }
    };
  }
}
