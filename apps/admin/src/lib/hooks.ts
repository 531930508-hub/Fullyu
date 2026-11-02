import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export function useApi<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async (options: { silent?: boolean } = {}) => {
    const id = ++seq.current;
    if (!options.silent) setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      if (seq.current === id) {
        setData(result);
        setLoading(false);
      }
      return result;
    } catch (err) {
      if (seq.current === id) {
        setError(err instanceof ApiError ? err.message : '加载失败，请稍后重试');
        setLoading(false);
      }
      throw err;
    }
  }, []);

  useEffect(() => {
    reload().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, setData };
}

export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useStoredState<T extends string>(key: string, initial: T, valid?: T[]) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key) as T | null;
    if (stored && (!valid || valid.includes(stored))) return stored;
    return initial;
  });
  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

/**
 * 结构化筛选条件的本地持久化：出错或格式过期时回落到默认值。
 * 只用于界面偏好（区间、筛选），不存业务数据。
 */
export function useStoredJsonState<T>(key: string, initial: T, parse?: (raw: unknown) => T | null) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parse) {
          const checked = parse(parsed);
          if (checked) return checked;
        } else {
          return parsed as T;
        }
      }
    } catch (error) {
      /* 缓存损坏时使用默认值 */
    }
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      /* 存储不可用时只保留内存状态 */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
