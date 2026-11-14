import type { Prisma } from '@prisma/client';
import { badRequest } from '../common/errors';

export type ProfilePatchInput = {
  name?: unknown;
  gender?: unknown;
  birthday?: unknown;
  avatarUrl?: unknown;
};

/**
 * 会员资料（姓名 / 性别 / 生日 / 头像）是唯一主档：总部后台与各业务端都改这一份，
 * 所以两处入口共用同一套校验，避免同一字段在两种入口出现不同口径。
 */
export const parseProfilePatch = (input: ProfilePatchInput): Prisma.MemberUpdateInput => {
  const data: Prisma.MemberUpdateInput = {};
  if (input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length < 1 || name.length > 20) throw badRequest('姓名须为 1–20 个字符');
    data.name = name;
  }
  if (input.gender !== undefined) {
    if (input.gender !== null && input.gender !== 1 && input.gender !== 2) {
      throw badRequest('性别只能是 1、2 或空');
    }
    data.gender = input.gender as number | null;
  }
  if (input.birthday !== undefined) {
    if (input.birthday === null || input.birthday === '') {
      data.birthday = null;
    } else {
      if (typeof input.birthday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.birthday)) {
        throw badRequest('生日格式应为 YYYY-MM-DD');
      }
      const date = new Date(`${input.birthday}T00:00:00+08:00`);
      if (Number.isNaN(date.getTime())) throw badRequest('生日格式应为 YYYY-MM-DD');
      if (date.getTime() > Date.now()) throw badRequest('生日不能晚于今天');
      data.birthday = date;
    }
  }
  if (input.avatarUrl !== undefined) {
    const avatarUrl = typeof input.avatarUrl === 'string' ? input.avatarUrl.trim() : '';
    if (avatarUrl && !/^https?:\/\//.test(avatarUrl)) {
      throw badRequest('头像地址必须是 http(s) URL');
    }
    if (avatarUrl.length > 500) throw badRequest('头像地址过长');
    data.avatarUrl = avatarUrl || null;
  }
  if (!Object.keys(data).length) throw badRequest('没有需要修改的字段');
  return data;
};