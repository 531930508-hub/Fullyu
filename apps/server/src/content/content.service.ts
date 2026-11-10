import { Injectable } from '@nestjs/common';
import type { Banner, HomeAsset } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../common/prisma.service';
import { badRequest, notFound } from '../common/errors';
import { hasPerm, type StaffContext } from '../common/auth.types';
import { newId } from '../common/ids';
import { logAction } from '../common/logs';
import { assetUrl, UPLOAD_ROOT } from '../common/assets';
import {
  IMAGE_CONTENT_TYPES,
  IMAGE_MAX_BYTES,
  matchesImageSignature,
  readImageSize
} from '../common/image';

/** 首页 8 个系列图槽位：4 个系列 × 中英两套。顺序与小程序首页一致。 */
export const SERIES_ART_KEYS = [
  'xing-zh',
  'song-zh',
  'qing-zh',
  'mian-zh',
  'xing-en',
  'song-en',
  'qing-en',
  'mian-en'
] as const;

export type SeriesArtKey = (typeof SERIES_ART_KEYS)[number];

/** banner 只支持站内跳转；外部网页需要业务域名，本轮不开放。 */
export const BANNER_LINK_TYPES = ['none', 'menu', 'series', 'retail', 'orders', 'profile', 'product'] as const;
export type BannerLinkType = (typeof BANNER_LINK_TYPES)[number];

const SERIES_KEYS = ['xing', 'song', 'qing', 'mian'];
const SERIES_NAMES: Record<string, string> = { xing: '醒', song: '松', qing: '庆', mian: '眠' };
const LINK_NAMES: Record<string, string> = {
  none: '不跳转',
  menu: '茶单',
  series: '茶单系列',
  retail: '带回家',
  orders: '订单',
  profile: '我的',
  product: '商品详情'
};
const MAX_BANNERS = 8;
const HOME_IMAGE_WIDTH = 1600;
const HOME_IMAGE_HEIGHT = 900;

export type BannerImageInput = { base64?: string; contentType?: string };
export type BannerInput = BannerImageInput & {
  title?: string;
  linkType?: string;
  linkValue?: string;
  active?: boolean;
};

type StoredImage = {
  key: string;
  buffer: Buffer;
  ext: string;
};

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  private isSeriesKey(value: string): value is SeriesArtKey {
    return (SERIES_ART_KEYS as readonly string[]).includes(value);
  }

  private isLinkType(value: string): value is BannerLinkType {
    return (BANNER_LINK_TYPES as readonly string[]).includes(value);
  }

  /** 统一校验并落盘：只接受 1600×900、2MB 以内的 JPG/PNG/WebP。 */
  private storeImage(input: BannerImageInput, dir: string, name: string, label: string): StoredImage {
    const raw = String(input.base64 || '').replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    if (!buffer.length) throw badRequest(`${label}内容为空`);
    if (buffer.length > IMAGE_MAX_BYTES) throw badRequest(`${label}不能超过 2MB`);

    const ext = IMAGE_CONTENT_TYPES[String(input.contentType || '').toLowerCase()];
    if (!ext) throw badRequest('仅支持 JPG、PNG 或 WebP 图片');
    if (!matchesImageSignature(buffer, ext)) throw badRequest('图片内容与文件格式不符，请重新选择');

    const size = readImageSize(buffer);
    if (!size) throw badRequest('无法识别图片尺寸，请重新导出后再上传');
    if (size.width !== HOME_IMAGE_WIDTH || size.height !== HOME_IMAGE_HEIGHT) {
      throw badRequest(
        `${label}需要 ${HOME_IMAGE_WIDTH}×${HOME_IMAGE_HEIGHT}，当前是 ${size.width}×${size.height}`
      );
    }

    mkdirSync(join(UPLOAD_ROOT, dir), { recursive: true });
    const key = `${dir}/${name}-${randomBytes(6).toString('hex')}.${ext}`;
    writeFileSync(join(UPLOAD_ROOT, key), buffer);
    return { key, buffer, ext };
  }

  private removeFile(key: string | null | undefined, dir: string) {
    if (!key || !key.startsWith(`${dir}/`)) return;
    try {
      rmSync(join(UPLOAD_ROOT, key), { force: true });
    } catch {
      /* 文件已不存在不影响配置状态 */
    }
  }

  private mapBanner(row: Banner) {
    return {
      id: row.id,
      title: row.title,
      imageUrl: assetUrl(row.imageUrl),
      linkType: row.linkType,
      linkValue: row.linkValue,
      sortOrder: row.sortOrder,
      active: row.active,
      updatedAt: row.updatedAt.getTime()
    };
  }

  private mapSeriesAsset(row: HomeAsset | undefined, key: SeriesArtKey) {
    const [series, locale] = key.split('-');
    return {
      key,
      series,
      locale,
      imageUrl: row ? assetUrl(row.imageUrl) : '',
      updatedAt: row ? row.updatedAt.getTime() : null
    };
  }

  /** 后台首页内容：轮播、8 个系列槽位，以及商品跳转的可选项。 */
  async adminOverview() {
    const [banners, assets, products] = await Promise.all([
      this.prisma.banner.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.homeAsset.findMany(),
      this.prisma.product.findMany({
        select: { id: true, name: true, nameEn: true, series: true, kind: true, status: true },
        orderBy: { name: 'asc' }
      })
    ]);
    const assetMap = new Map(assets.map((row) => [row.key, row]));
    return {
      banners: banners.map((row) => this.mapBanner(row)),
      series: SERIES_ART_KEYS.map((key) => this.mapSeriesAsset(assetMap.get(key), key)),
      products
    };
  }

  /** 顾客首页：只返回启用中的轮播与已覆盖的系列图。 */
  async publicHome() {
    const [banners, assets] = await Promise.all([
      this.prisma.banner.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
      }),
      this.prisma.homeAsset.findMany()
    ]);
    return {
      banners: banners.map((row) => ({
        id: row.id,
        imageUrl: assetUrl(row.imageUrl),
        linkType: row.linkType,
        linkValue: row.linkValue
      })),
      series: Object.fromEntries(assets.map((row) => [row.key, assetUrl(row.imageUrl)]))
    };
  }

  private async validateBannerFields(
    input: BannerInput,
    current: { linkType: string; linkValue: string } | null
  ): Promise<{ linkType: BannerLinkType; linkValue: string }> {
    const linkType = String(input.linkType ?? current?.linkType ?? 'none');
    if (!this.isLinkType(linkType)) throw badRequest('跳转类型无效');
    const rawValue = input.linkValue !== undefined ? String(input.linkValue) : current?.linkValue || '';

    if (linkType === 'series') {
      if (!SERIES_KEYS.includes(rawValue)) throw badRequest('请选择要跳转的茶单系列');
      return { linkType, linkValue: rawValue };
    }
    if (linkType === 'product') {
      if (!rawValue) throw badRequest('请选择要跳转的商品');
      const product = await this.prisma.product.findUnique({ where: { id: rawValue } });
      if (!product) throw badRequest('跳转商品不存在，请重新选择');
      return { linkType, linkValue: rawValue };
    }
    return { linkType, linkValue: '' };
  }

  async createBanner(staff: StaffContext, input: BannerInput) {
    const title = String(input.title || '').trim();
    if (!title) throw badRequest('请填写轮播名称');
    if (title.length > 40) throw badRequest('轮播名称不能超过 40 个字');

    const count = await this.prisma.banner.count();
    if (count >= MAX_BANNERS) throw badRequest(`首页轮播最多 ${MAX_BANNERS} 屏，请先删除不再使用的轮播`);

    const link = await this.validateBannerFields(input, null);
    const stored = this.storeImage(input, 'home/banners', 'banner', '轮播图');
    const max = await this.prisma.banner.aggregate({ _max: { sortOrder: true } });

    try {
      const row = await this.prisma.banner.create({
        data: {
          id: newId('BN'),
          title,
          imageUrl: stored.key,
          linkType: link.linkType,
          linkValue: link.linkValue,
          sortOrder: (max._max.sortOrder ?? -1) + 1,
          active: input.active !== false
        }
      });
      await logAction(this.prisma, {
        actorId: staff.id,
        actorName: staff.name,
        action: '新建首页轮播',
        detail: `${title} · ${LINK_NAMES[link.linkType]}${link.linkValue ? ` · ${SERIES_NAMES[link.linkValue] || link.linkValue}` : ''}`,
        type: 'content'
      });
      return { banner: this.mapBanner(row) };
    } catch (error) {
      this.removeFile(stored.key, 'home/banners');
      throw error;
    }
  }

  async updateBanner(staff: StaffContext, id: string, input: BannerInput) {
    const row = await this.prisma.banner.findUnique({ where: { id } });
    if (!row) throw notFound('轮播不存在');

    const data: {
      title?: string;
      imageUrl?: string;
      linkType?: string;
      linkValue?: string;
      active?: boolean;
      updatedAt?: Date;
    } = {};
    if (input.title !== undefined) {
      const title = String(input.title).trim();
      if (!title) throw badRequest('请填写轮播名称');
      if (title.length > 40) throw badRequest('轮播名称不能超过 40 个字');
      data.title = title;
    }
    if (input.linkType !== undefined || input.linkValue !== undefined) {
      const link = await this.validateBannerFields(input, row);
      data.linkType = link.linkType;
      data.linkValue = link.linkValue;
    }
    if (input.active !== undefined) data.active = Boolean(input.active);

    let stored: StoredImage | null = null;
    if (input.base64 !== undefined || input.contentType !== undefined) {
      stored = this.storeImage(input, 'home/banners', 'banner', '轮播图');
      data.imageUrl = stored.key;
    }
    if (!Object.keys(data).length) return { banner: this.mapBanner(row) };
    data.updatedAt = new Date();

    try {
      const updated = await this.prisma.banner.update({ where: { id }, data });
      if (stored) this.removeFile(row.imageUrl, 'home/banners');
      await logAction(this.prisma, {
        actorId: staff.id,
        actorName: staff.name,
        action: '更新首页轮播',
        detail: `${updated.title}${stored ? ' · 更换图片' : ''}${data.active === false ? ' · 停用' : data.active === true ? ' · 启用' : ''}`,
        type: 'content'
      });
      return { banner: this.mapBanner(updated) };
    } catch (error) {
      if (stored) this.removeFile(stored.key, 'home/banners');
      throw error;
    }
  }

  async deleteBanner(staff: StaffContext, id: string) {
    const row = await this.prisma.banner.findUnique({ where: { id } });
    if (!row) throw notFound('轮播不存在');
    await this.prisma.banner.delete({ where: { id } });
    this.removeFile(row.imageUrl, 'home/banners');
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '删除首页轮播',
      detail: row.title,
      type: 'content'
    });
    return { ok: true };
  }

  /** 顺序提交必须覆盖当前全部轮播，避免部分提交造成重复序号。 */
  async reorderBanners(staff: StaffContext, ids: string[]) {
    const rows = await this.prisma.banner.findMany({ select: { id: true } });
    const existing = new Set(rows.map((row) => row.id));
    const next = ids.map(String);
    if (
      next.length !== rows.length ||
      new Set(next).size !== next.length ||
      next.some((id) => !existing.has(id))
    ) {
      throw badRequest('轮播顺序已变化，请刷新后重试');
    }
    await this.prisma.$transaction(
      next.map((id, index) =>
        this.prisma.banner.update({ where: { id }, data: { sortOrder: index, updatedAt: new Date() } })
      )
    );
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '调整首页轮播顺序',
      detail: `${next.length} 屏`,
      type: 'content'
    });
    const banners = await this.prisma.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    return { banners: banners.map((row) => this.mapBanner(row)) };
  }

  async setSeriesImage(staff: StaffContext, key: string, input: BannerImageInput) {
    if (!this.isSeriesKey(key)) throw badRequest('系列图槽位无效');
    const stored = this.storeImage(input, 'home/series', key, '系列图');
    const existing = await this.prisma.homeAsset.findUnique({ where: { key } });
    try {
      await this.prisma.homeAsset.upsert({
        where: { key },
        create: { key, imageUrl: stored.key },
        update: { imageUrl: stored.key, updatedAt: new Date() }
      });
      if (existing) this.removeFile(existing.imageUrl, 'home/series');
      const [series, locale] = key.split('-');
      await logAction(this.prisma, {
        actorId: staff.id,
        actorName: staff.name,
        action: '更新首页系列图',
        detail: `${SERIES_NAMES[series] || series} · ${locale === 'en' ? '英文' : '中文'}`,
        type: 'content'
      });
      return { series: await this.seriesSlots() };
    } catch (error) {
      this.removeFile(stored.key, 'home/series');
      throw error;
    }
  }

  async resetSeriesImage(staff: StaffContext, key: string) {
    if (!this.isSeriesKey(key)) throw badRequest('系列图槽位无效');
    const existing = await this.prisma.homeAsset.findUnique({ where: { key } });
    if (existing) {
      await this.prisma.homeAsset.delete({ where: { key } });
      this.removeFile(existing.imageUrl, 'home/series');
      const [series, locale] = key.split('-');
      await logAction(this.prisma, {
        actorId: staff.id,
        actorName: staff.name,
        action: '恢复首页系列图',
        detail: `${SERIES_NAMES[series] || series} · ${locale === 'en' ? '英文' : '中文'} · 使用内置图`,
        type: 'content'
      });
    }
    return { series: await this.seriesSlots() };
  }

  private async seriesSlots() {
    const assets = await this.prisma.homeAsset.findMany();
    const assetMap = new Map(assets.map((row) => [row.key, row]));
    return SERIES_ART_KEYS.map((key) => this.mapSeriesAsset(assetMap.get(key), key));
  }
}
