<template>
  <div style="padding: 24px; background: #f5f5f5; min-height: 100vh;">
    <h2>排班日历组件演示</h2>
    <SchedulingView
      :columns="columns"
      :appointments="appointments"
      :startTime="'10:00'"
      :endTime="'22:30'"
      :slotHeight="60"
      @appointment-selected="onAppointmentSelected"
    />
    <el-dialog :visible.sync="dialogVisible" title="预约详情">
      <pre>{{ selectedAppointment }}</pre>
    </el-dialog>
  </div>
</template>

<script>
import SchedulingView from '@/components/SchedulingView/index2.vue'

export default {
  name: 'SchedulingViewMock',
  components: { SchedulingView },
  data() {
    return {
      columns: [
        { id: 'col1', name: '王丽莎' },
        { id: 'col2', name: '李明' },
        { id: 'col3', name: '张三' }
      ],
      appointments: [
        {
          id: 'appt1',
          columnId: 'col1',
          title: '洗发',
          subTitle: 'A1',
          type: 'wet',
          startTime: this.mockTodayTime('10:00'),
          endTime: this.mockTodayTime('10:30')
        },
        {
          id: 'appt2',
          columnId: 'col2',
          title: '剪发',
          subTitle: 'B2',
          type: 'dry',
          startTime: this.mockTodayTime('11:00'),
          endTime: this.mockTodayTime('12:00')
        },
        {
          id: 'appt3',
          columnId: 'col3',
          title: '烫发',
          subTitle: 'C3',
          type: 'wet',
          startTime: this.mockTodayTime('13:30'),
          endTime: this.mockTodayTime('15:00')
        },
        {
          id: 'appt4',
          columnId: 'col1',
          title: '染发',
          subTitle: 'D4',
          type: 'dry',
          startTime: this.mockTodayTime('16:00'),
          endTime: this.mockTodayTime('17:30')
        }
      ],
      dialogVisible: false,
      selectedAppointment: null
    }
  },
  methods: {
    mockTodayTime(hm) {
      // 生成今天的指定时间字符串（yyyy-MM-ddTHH:mm:00）
      const today = new Date();
      const [h, m] = hm.split(':');
      today.setHours(Number(h), Number(m), 0, 0);
      return today.toISOString();
    },
    onAppointmentSelected(appt) {
      this.selectedAppointment = appt;
      this.dialogVisible = true;
    }
  }
}
</script>

<style scoped>
</style>
