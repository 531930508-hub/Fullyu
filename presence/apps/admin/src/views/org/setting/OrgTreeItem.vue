<template>
  <div class="org-node" :style="{ marginLeft: depth * 28 + 'px' }">
    <div class="org-row" :class="{ disabled: node.status === 'DISABLED' }">
      <span class="org-line" v-if="depth > 0" />
      <span class="org-name">{{ node.shortName }}</span>
      <a-tag :color="orgTypeMap[node.type].color">{{ orgTypeMap[node.type].text }}</a-tag>
      <a-tag v-if="node.accounting" color="gold">核算</a-tag>
      <a-tag v-if="node.hasWarehouse" color="cyan">仓库</a-tag>
      <a-tag v-if="node.canPurchase" color="blue">可采购</a-tag>
      <a-tag v-if="node.status === 'DISABLED'" color="default">已停用</a-tag>
      <span class="org-leader">{{ node.leader || '-' }}</span>
      <span class="org-actions">
        <a v-perm="'org:create'" @click="emit('add', node)">新建下级</a>
        <a v-perm="'org:update'" @click="emit('edit', node)">编辑</a>
        <a v-perm="'org:delete'" class="danger" @click="emit('remove', node)">删除</a>
      </span>
    </div>
    <OrgTreeItem
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :depth="depth + 1"
      @add="emit('add', $event)"
      @edit="emit('edit', $event)"
      @remove="emit('remove', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { orgTypeMap } from '@/api/org'
import type { OrgNode, OrgTreeNode } from '@/api/org'

defineOptions({ name: 'OrgTreeItem' })

defineProps<{ node: OrgTreeNode; depth: number }>()

const emit = defineEmits<{
  add: [node: OrgNode]
  edit: [node: OrgNode]
  remove: [node: OrgNode]
}>()
</script>

<style scoped>
.org-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #ede5db;
  border-radius: 10px;
  transition: all 0.2s;
}
.org-row:hover {
  border-color: #6b463c;
  box-shadow: 0 2px 8px rgba(107, 70, 60, 0.08);
}
.org-row.disabled {
  opacity: 0.6;
}
.org-line {
  position: absolute;
  left: -14px;
  width: 14px;
  height: 1px;
  background: #ede5db;
}
.org-name {
  font-weight: 600;
  color: #4b3621;
}
.org-leader {
  margin-left: 8px;
  font-size: 12px;
  color: #999;
}
.org-actions {
  margin-left: auto;
  display: flex;
  gap: 12px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s;
}
.org-row:hover .org-actions {
  opacity: 1;
}
.org-actions .danger {
  color: #cf1322;
}
@media (max-width: 768px) {
  .org-actions {
    opacity: 1;
  }
  .org-row {
    flex-wrap: wrap;
  }
}
</style>
