import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { StaffContext } from '../common/auth.types';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async load(id: string): Promise<StaffContext | null> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: true } },
        userStores: true
      }
    });
    if (!row) return null;
    const roles = row.roles.map(({ role }) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      scope: role.scope,
      builtin: role.builtin,
      perms: JSON.parse(role.permsJson) as string[]
    }));
    const perms = new Set<string>();
    for (const role of roles) {
      for (const perm of role.perms) perms.add(perm);
    }
    return {
      id: row.id,
      name: row.name,
      username: row.username,
      active: row.active,
      allStores: row.allStores,
      storeIds: row.userStores.map((x) => x.storeId),
      roles,
      perms,
      tokenVersion: row.tokenVersion
    };
  }
}
