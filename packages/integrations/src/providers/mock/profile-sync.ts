import type { ProfileSnapshot, ProfileSyncProvider } from '../../contracts';

/**
 * 资料同步占位实现：写内存队列，不外发任何资料。
 * 第三方用户中心上线后替换为真实调用（推送资料变更、按手机号拉取资料）。
 */
export class NoopProfileSync implements ProfileSyncProvider {
  readonly name = 'pending-user-center';
  readonly mode = 'noop';
  private readonly outbox: ProfileSnapshot[] = [];

  async pushProfile(snapshot: ProfileSnapshot): Promise<void> {
    this.outbox.push(snapshot);
    if (this.outbox.length > 200) this.outbox.shift();
  }

  async pullProfile(_phone: string): Promise<Partial<ProfileSnapshot> | null> {
    return null;
  }

  /** 供测试与自检使用：查看最近一次推送内容。 */
  lastPushed(): ProfileSnapshot | null {
    return this.outbox.length ? this.outbox[this.outbox.length - 1] : null;
  }
}
