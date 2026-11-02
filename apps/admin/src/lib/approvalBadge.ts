/**
 * 审批待处理数量：侧边栏「审批中心」的角标。
 *
 * 导航合并后，门店营业与经营管理共用一套侧边栏，角标必须在任意页面都一致，
 * 所以计数放在这里由侧边栏统一订阅，而不是由某一个页面组件各自维护。
 */
import { useEffect, useState } from 'react';
import { api } from './api';

type Listener = (count: number) => void;

let current = 0;
const listeners = new Set<Listener>();

const publish = (count: number) => {
  if (count === current) return;
  current = count;
  listeners.forEach((listener) => listener(count));
};

/** 重新拉取待处理数量；审批通过/驳回后调用，让角标立即跟上。 */
export const refreshApprovalCount = (): void => {
  api
    .adminApprovals({ status: 'pending' })
    .then((result) => publish(result.counts.pending))
    .catch(() => undefined);
};

/**
 * 订阅待处理数量。
 * @param enabled 账号是否有 approval:view 权限；无权限时不发请求、不显示角标。
 * @param reloadKey 变化时重新拉取（侧边栏按路由变化传入，切页即刷新）。
 */
export const useApprovalCount = (enabled: boolean, reloadKey?: unknown): number => {
  const [count, setCount] = useState(enabled ? current : 0);

  useEffect(() => {
    if (!enabled) {
      publish(0);
      setCount(0);
      return;
    }
    listeners.add(setCount);
    setCount(current);
    refreshApprovalCount();
    return () => {
      listeners.delete(setCount);
    };
  }, [enabled, reloadKey]);

  return enabled ? count : 0;
};
