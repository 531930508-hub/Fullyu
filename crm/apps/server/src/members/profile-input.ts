import type { Prisma } from '@prisma/client';
import { badRequest } from '../common/errors';

export type ProfilePatch = {
  name?: string;
  gender?: number | null;
  birthday?: string | null;
  avatarUrl?: string | null;
};

/**
 * 会员资料字段校验：员工后台与业务端（在场/时叙/轻疗）共用一套规则，避免两边口径漂移。
 *
 * 只把「调用方明确传了」的字段写进 update：未传 = 不动，传 null = 清空。
 */
export function buildProfileUpdate(input: ProfilePatch): Prisma.MemberUpdateInput {
  const data: Prisma.MemberUpdateInput = {};
  if (input.name !== undefined) {
    const name = String(input.name ?? '').trim();
    if (name.length < 1 || name.length > 20) throw badRequest('姓名须为 1–20 个字符');
    data.name = name;
  }
  if (input.gender !== undefined) {
    if (input.gender !== null && input.gender !== 1 && input.gender !== 2) {
      throw badRequest('性别只能是 1、2 或空');
    }
    data.gender = input.gender;
  }
  if (input.birthday !== undefined) {
    if (input.birthday === null) {
      data.birthday = null;
    } else {
      const date = new Date(`${input.birthday}T00:00:00+08:00`);
      if (Number.isNaN(date.getTime())) throw badRequest('生日格式应为 YYYY-MM-DD');
      if (date.getTime() > Date.now()) throw badRequest('生日不能晚于今天');
      data.birthday = date;
    }
  }
  if (input.avatarUrl !== undefined) {
    if (input.avatarUrl && !/^https?:\/\//.test(input.avatarUrl)) {
      throw badRequest('头像地址必须是 http(s) URL');
    }
    data.avatarUrl = input.avatarUrl || null;
  }
  if (!Object.keys(data).length) throw badRequest('没有需要修改的字段');
  return data;
}