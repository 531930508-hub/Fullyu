<template>
  <el-card class="form-container" shadow="never">
    <div v-loading="loading" class="alloc-menu">
      <p class="alloc-menu__hint">勾选到页签即可精确授权；只勾部分页签时，上级页面会显示为半选。</p>
      <el-tree
        :data="menuTreeList"
        show-checkbox
        default-expand-all
        node-key="id"
        ref="tree"
        highlight-current
        :props="defaultProps">
      </el-tree>
      <div class="alloc-menu__actions">
        <el-button type="primary" :disabled="loading" @click="handleSave()">保存</el-button>
        <el-button :disabled="loading" @click="handleClear()">清空</el-button>
      </div>
    </div>
  </el-card>
</template>

<script>
  import {fetchTreeList} from '@/api/menu';
  import {listMenuByRole, allocMenu} from '@/api/role';

  export default {
    name: "allocMenu",
    data() {
      return {
        loading: false,
        menuTreeList: [],
        defaultProps: {
          children: 'children',
          label: 'title'
        },
        roleId: null
      };
    },
    created() {
      this.roleId = this.$route.query.roleId;
      this.loading = true;
      // 先建树再回填勾选，避免 setCheckedKeys 早于节点渲染导致勾选丢失
      this.treeList()
        .then(() => this.getRoleMenu(this.roleId))
        .finally(() => { this.loading = false; });
    },
    methods: {
      treeList() {
        return fetchTreeList().then(response => {
          this.menuTreeList = response.data || [];
        });
      },
      getRoleMenu(roleId) {
        return listMenuByRole(roleId).then(response => {
          const menuList = response.data || [];
          const granted = new Set(menuList.map(menu => menu.id));
          // 只勾选「被授权的叶子节点」，el-tree 会自动把上级置为半选/全选；
          // 若直接勾父页面，会连带勾上其全部页签，造成越权。
          const leafIds = [];
          this.collectGrantedLeaves(this.menuTreeList, granted, leafIds);
          this.$refs.tree.setCheckedKeys(leafIds);
        });
      },
      collectGrantedLeaves(nodes, granted, result) {
        (nodes || []).forEach(node => {
          const children = node.children || [];
          if (children.length) {
            this.collectGrantedLeaves(children, granted, result);
          } else if (granted.has(node.id)) {
            result.push(node.id);
          }
        });
      },
      handleSave() {
        // 全选节点 + 半选祖先 = 完整授权集合（含分组/页面/页签三级）
        const checkedMenuIds = new Set([
          ...this.$refs.tree.getCheckedKeys(),
          ...this.$refs.tree.getHalfCheckedKeys()
        ]);
        this.$confirm('是否分配菜单？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          const params = new URLSearchParams();
          params.append("roleId", this.roleId);
          params.append("menuIds", Array.from(checkedMenuIds));
          return allocMenu(params).then(() => {
            this.$message({
              message: '分配成功',
              type: 'success',
              duration: 1000
            });
            this.$router.back();
          });
        }).catch(() => {});
      },
      handleClear() {
        this.$refs.tree.setCheckedKeys([]);
      }
    }
  }
</script>

<style scoped>
  .alloc-menu__hint {
    margin: 0 0 14px;
    color: #909399;
    font-size: 12.5px;
  }

  .alloc-menu__actions {
    margin-top: 20px;
    text-align: center;
  }
</style>