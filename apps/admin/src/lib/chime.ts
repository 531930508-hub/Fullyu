/**
 * 新订单提示音：WebAudio 现场合成两段短音，不依赖音频文件。
 *
 * 浏览器自动播放策略要求先有用户手势，因此首次点击/按键时调用 primeChime() 解锁；
 * 未解锁或环境不支持时静默失败，界面仍有 toast 与卡片高亮兜底。
 */
let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (context) return context;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

/** 在用户手势里调用一次即可；重复调用无副作用。 */
export function primeChime(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

/** 新订单提示音（约 0.4 秒，两段上扬短音）。 */
export function playNewOrderChime(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    // 尚未解锁时补一次 resume，成功与否都继续尝试，失败则静默。
    void ctx.resume().catch(() => undefined);
  }
  try {
    const start = ctx.currentTime + 0.02;
    [
      { freq: 784, at: 0 },
      { freq: 1046, at: 0.16 }
    ].forEach(({ freq, at }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(0.28, start + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + at);
      osc.stop(start + at + 0.18);
    });
  } catch {
    /* 音频失败不影响接单 */
  }
}