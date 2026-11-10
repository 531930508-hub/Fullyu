import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { StaffContext } from '../common/auth.types';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async load(id: string): Promise<StaffContext | null> {
    const row = await this.prisma.staff.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } }
    });
    if (!row) return null;
    const perms = new Set<string>();
    for (const link of row.roles) {
      for (const perm of JSON.parse(link.role.permsJson) as string[]) perms.add(perm);
    }
    return {
      id: row.id,
      name: row.name,
      username: row.username,
      active: row.active,
      perms,
      tokenVersion: row.tokenVersion
    };
  }
}
