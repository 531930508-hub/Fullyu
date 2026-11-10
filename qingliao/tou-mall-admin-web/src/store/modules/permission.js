import { asyncRouterMap, constantRouterMap } from '@/router/index';

// 与数据库 ums_role.name 保持一致
const SUPER_ADMIN_ROLE = '超级管理员';

//判断是否有权限访问该菜单
function hasPermission(menus, route) {
  if (route.name) {
    let currMenu = getMenu(route.name, menus);
    if (currMenu!=null) {
      //设置菜单的标题、图标和可见性
      if (currMenu.title != null && currMenu.title !== '') {
        route.meta.title = currMenu.title;
      }
      if (currMenu.icon != null && currMenu.title !== '') {
        route.meta.icon = currMenu.icon;
      }
      if(currMenu.hidden!=null && route.hidden !== true){
        route.hidden = currMenu.hidden !== 0;
      }
      if (currMenu.sort != null && currMenu.sort !== '') {
        route.sort = currMenu.sort;
      }
      return true;
    } else {
      route.sort = 0;
      if (route.hidden !== undefined && route.hidden === true) {
        route.sort=-1;
        return true;
      } else {
        return false;
      }
    }
  } else {
    return true
  }
}

//根据路由名称获取菜单
function getMenu(name, menus) {
  for (let i = 0; i < menus.length; i++) {
    let menu = menus[i];
    if (name===menu.name) {
      return menu;
    }
  }
  return null;
}

//对菜单进行排序
function sortRouters(accessedRouters) {
  for (let i = 0; i < accessedRouters.length; i++) {
    let router = accessedRouters[i];
    if(router.children && router.children.length > 0){
      router.children.sort(compare("sort"));
    }
  }
  accessedRouters.sort(compare("sort"));
}

//降序比较函数
function compare(p){
  return function(m,n){
    let a = m[p];
    let b = n[p];
    return b - a;
  }
}

//深拷贝路由配置，避免切换账号时把上一次过滤过的 children 写回原始路由表
function cloneRoute(route) {
  const copy = Object.assign({}, route);
  if (route.meta) {
    copy.meta = Object.assign({}, route.meta);
  }
  if (route.children) {
    copy.children = route.children.map(cloneRoute);
  }
  return copy;
}

const permission = {
  state: {
    routers: constantRouterMap,
    addRouters: [],
    // 后端下发的原始菜单（含页签级隐藏行），供 TabbedPage / 首页区块做页签级鉴权
    menus: []
  },
  mutations: {
    SET_ROUTERS: (state, routers) => {
      state.addRouters = routers;
      state.routers = constantRouterMap.concat(routers);
    },
    SET_MENUS: (state, menus) => {
      state.menus = Array.isArray(menus) ? menus : [];
    }
  },
  actions: {
    GenerateRoutes({ commit }, data) {
      return new Promise(resolve => {
        const { menus, roles } = data;
        commit('SET_MENUS', menus);
        // 超级管理员兜底：菜单表还没同步的新页面不能被静默丢出侧边栏和路由表
        const isSuperAdmin = (roles || []).indexOf(SUPER_ADMIN_ROLE) > -1;
        const canAccess = route => {
          if (hasPermission(menus, route)) return true;
          return isSuperAdmin && route.hidden !== true;
        };
        // 克隆后再过滤，GenerateRoutes 可能在同一会话内被多次调用（切换账号/权限刷新）
        const accessedRouters = asyncRouterMap.map(cloneRoute).filter(v => {
          if (v.children && v.children.length > 0) {
            v.children = v.children.filter(child => canAccess(child));
            // 父级菜单缺失但子菜单有权限时仍保留分组，避免增量迁移期间整组消失
            return canAccess(v) || v.children.length > 0;
          }
          return canAccess(v);
        });
        //对菜单进行排序
        sortRouters(accessedRouters);
        commit('SET_ROUTERS', accessedRouters);
        resolve();
      })
    }
  }
};

export default permission;

