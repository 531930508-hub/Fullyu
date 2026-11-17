import { Injectable } from '@nestjs/common';
import { CRM_PERMISSIONS, CRM_PERMISSION_CODES } from '@fullyu/crm-shared';
import { PrismaService } from '../common/prisma.service';
import { audit } from '../common/audit';
import { ApiError, badRequest, conflict } from '../common/errors';
import { newId } from '../common/ids';
import type { StaffContext } from '../common/auth.types';

type RoleRow = {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  permsJson: string;
  createdAt: Date;
};

type PermissionInput = unknown;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const roles = await this.prisma.crmRole.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { staff: true } } }
    });
    return {
      roles: roles.map((role) => this.toView(role, role._count.staff)),
      permissions: CRM_PERMISSIONS
    };
  }

  async create(
    input: { name?: unknown; description?: unknown; perms?: PermissionInput },
    staff: StaffContext
  ) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) throw badRequest('角色名称不能为空');
    if (name.length > 20) throw badRequest('角色名称不能超过 20 个字');
    const description =
      typeof input?.description === 'string' ? input.description.trim() : '';
    if (description.length > 200) throw badRequest('角色说明不能超过 200 个字');
    const perms = this.normalizePerms(input?.perms);
    if (!perms.length) throw badRequest('新角色至少需要一个权限点');
    const duplicate = await this.prisma.crmRole.findFirst({ where: { name } });
    if (duplicate) {
      throw conflict('角色名称已存在', { code: 'ROLE_NAME_EXISTS' });
    }

    const created = await this.prisma.crmRole.create({
      data: {
        id: newId('crm-role'),
        name,
        description,
        builtin: false,
        permsJson: JSON.stringify(perms)
      }
    });
    await audit(this.prisma, {
      actor: staff,
      action: '创建角色',
      target: `${created.name}（${created.id}）`,
      detail: perms.join(', ')
    });
    return { role: this.toView(created, 0) };
  }

  async update(id: string, input: { perms?: PermissionInput }, staff: StaffContext) {
    const role = await this.prisma.crmRole.findUnique({ where: { id } });
    if (!role) throw new ApiError(404, '角色不存在', { code: 'ROLE_NOT_FOUND' });
    if (role.id === 'crm-admin') {
      throw new ApiError(409, 'CRM 管理员固定拥有全部权限，不能修改', {
        code: 'ROLE_PROTECTED'
      });
    }
    const unique = this.normalizePerms(input?.perms);
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
    const staffCount = await this.prisma.staffRole.count({ where: { roleId: id } });
    return { role: this.toView(updated, staffCount) };
  }

  private normalizePerms(input: PermissionInput): string[] {
    if (!Array.isArray(input)) throw badRequest('perms 必须是权限点数组');
    const unique = [...new Set(input.map((perm) => String(perm)))];
    const unknown = unique.filter(
      (perm) => perm !== '*' && !CRM_PERMISSION_CODES.includes(perm as never)
    );
    if (unknown.length) throw badRequest(`未知权限点：${unknown.join(', ')}`);
    return unique;
  }

  private toView(role: RoleRow, staffCount: number) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      builtin: role.builtin,
      perms: JSON.parse(role.permsJson) as string[],
      staffCount,
      createdAt: role.createdAt.toISOString()
    };
  }
}
