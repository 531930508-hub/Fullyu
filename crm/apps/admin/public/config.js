// 部署适配：默认与服务端同源；反向代理到子路径时按当前 /admin/ 前缀推导 API 根。
// 例：/admin/ -> /api；/crm-api/admin/ -> /crm-api/api。
(function () {
  if (window.CRM_API_BASE) return;
  var path = window.location.pathname;
  var at = path.indexOf('/admin/');
  var prefix = at > 0 ? path.slice(0, at) : '';
  window.CRM_API_BASE = prefix + '/api';
})();
