<script>
import { applyLaunchScene, expireStaleTable } from '@/store';

// 小程序冷启动与从后台回前台都会走 onShow：桌签码在两种情况下都要生效。
// 首页尚未挂载时（冷启动）只写缓存，由首页初始化读取；已在运行时发事件让首页换店换桌。
let firstShow = true;

function entryScene(options) {
  const query = (options && options.query) || {};
  // 普通链接二维码：微信把原始 https 链接放进 q；小程序码：scene。
  // 少数后台或测试链接会直接把参数挂到启动参数上，这里一并拼接。
  if (query.q) return query.q;
  if (query.scene) return query.scene;
  if (query.store && query.seat) return `${query.store}|${query.seat}`;
  return '';
}

export default {
  onShow(options) {
    // 启动时不弹授权；顾客会话在首页初始化时静默建立（wx.login 换 openId）。
    // 通过桌签进入时，scene / q 可能是「门店ID|座位」，也可能是带 store / seat
    // 参数的 https 链接（微信原生扫普通链接二维码）；统一解析后写入本地缓存，
    // 首页加载目录后会自动落到该门店并选中座位。
    const scene = entryScene(options);
    const applied = scene ? applyLaunchScene(scene) : null;
    if (applied && !firstShow) uni.$emit('teahour:scene', applied);
    // 没有带桌签进店（例如只是从后台切回小程序）时，清掉跨天失效的桌号，
    // 避免停留在昨天扫过的桌子上；带 scene 时刚写入的是当天有效记录，无需清理。
    if (!applied) expireStaleTable();
    firstShow = false;
  }
};
</script>

<style>
@import './styles/teahour.css';
</style>
