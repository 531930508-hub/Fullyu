<template>
  <a-timeline>
    <a-timeline-item color="gray">
      <b>提交申请</b>
      <div class="tl-sub">{{ instance.requesterName || approverLabel(instance.requester) }} · {{ dt(instance.createdAt) }}</div>
    </a-timeline-item>
    <a-timeline-item v-for="(n, i) in instance.nodes" :key="n.id || i" :color="nodeColor(n.status)">
      <b>{{ i + 1 }}. {{ n.name }}</b>
      <a-tag style="margin-left: 6px">{{ n.mode === 'ALL' ? '会签' : '或签' }}</a-tag>
      <div class="tl-sub">审批人：{{ approverLabels(n.approvers) }}</div>
      <div v-for="(d, di) in n.decisions" :key="di" class="tl-sub">
        {{ d.approverName || approverLabel(d.approver) }}：{{ d.action === 'APPROVE' ? '同意' : '驳回'
        }}{{ d.comment ? `（${d.comment}）` : '' }} · {{ dt(d.createdAt) }}
      </div>
      <div v-if="n.status === 'PROCESSING'" class="tl-sub warn">等待审批中…</div>
    </a-timeline-item>
    <a-timeline-item :color="instance.status === 'APPROVED' ? 'green' : 'gray'">
      <b>{{ doneText }}</b>
      <div class="tl-sub">{{ instance.finishedAt ? dt(instance.finishedAt) : '待流程走完' }}</div>
    </a-timeline-item>
  </a-timeline>
</template>

<script setup lang="ts">
import { useApprovers } from '@/composables/useApprovers'
import { dt } from '@/utils/format'
import type { ApprovalInstance } from '@/api/approval'

/** 审批进度时间轴：审批中心、采购单、支出台账、库存调整共用一份渲染 */
withDefaults(defineProps<{ instance: ApprovalInstance; doneText?: string }>(), {
  doneText: '单据生效',
})

const { approverLabel, approverLabels } = useApprovers()

const nodeColor = (s: string) =>
  s === 'APPROVED' ? 'green' : s === 'REJECTED' ? 'red' : s === 'PROCESSING' ? 'blue' : 'gray'
</script>

<style scoped>
.tl-sub {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}
.tl-sub.warn {
  color: #d46b08;
}
</style>
