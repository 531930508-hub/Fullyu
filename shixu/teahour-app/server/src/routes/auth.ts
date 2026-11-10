import type { FastifyInstance } from 'fastify';
import type { Database as DatabaseType } from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { customerGuard, loadStaff, staffGuard } from '../lib/auth.js';
import { unauthorized } from '../lib/errors.js';
import { customerPayload, createCustomerSession } from '../services/customers.js';
import { mapStaffSummary } from '../services/mappers.js';
import { logAction } from '../db/index.js';

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

export async function authRoutes(app: FastifyInstance, options: { db: DatabaseType }) {
  const { db } = options;

  app.post('/auth/login', async (req) => {
    const input = loginSchema.parse(req.body);
    const row = db
      .prepare('SELECT id, password_hash, active FROM users WHERE username = ?')
      .get(input.username) as { id: string; password_hash: string; active: number } | undefined;
    if (!row || !bcrypt.compareSync(input.password, row.password_hash)) {
      throw unauthorized('账号或密码不正确');
    }
    if (!row.active) throw unauthorized('账号已停用，请联系管理员');
    const staff = loadStaff(db, row.id);
    if (!staff) throw unauthorized('账号不存在');
    const token = app.jwt.sign({ kind: 'staff', sub: staff.id }, { expiresIn: '12h' });
    logAction(db, {
      actorId: staff.id,
      actorName: staff.name,
      action: '登录后台',
      detail: staff.username,
      type: 'auth'
    });
    return { token, staff: mapStaffSummary(staff) };
  });

  app.get('/auth/me', { preHandler: staffGuard(db) }, async (req) => {
    return { staff: mapStaffSummary(req.staff!) };
  });

  app.post('/customer/session', async (req) => {
    const input = z
      .object({
        memberCode: z.string().trim().max(40).optional(),
        name: z.string().trim().max(30).optional(),
        phone: z.string().trim().max(20).optional()
      })
      .parse(req.body ?? {});
    const customer = createCustomerSession(db, input);
    const token = app.jwt.sign({ kind: 'customer', sub: customer.id }, { expiresIn: '30d' });
    return { token, customer: customerPayload(customer) };
  });

  app.get('/customer/me', { preHandler: customerGuard(db) }, async (req) => {
    return { customer: customerPayload(req.customer!) };
  });
}
