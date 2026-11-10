<template>
  <div class="ReceptionDiv flex" style="background-color: #e8def8;padding:6px 16px;font-size: 14px" v-if="receptionData">
<!--    <div>当前接待：{{ receptionData.currMassagistId }}</div>
    <div style="margin-left: 16px" v-if="receptionData.remainingReceptionMinute">【剩余{{ receptionData.remainingReceptionMinute }}mins】</div>
    <div style="margin-left: 16px">预计下一个：{{ receptionData.nextMassagistId }}</div>-->
  </div>
</template>

<script>
import {mapGetters} from 'vuex'

export default {
  name: 'ReceptionDiv',
  props: {
    receptionData: {
      type: Object,
      default() {
        return null
      }
    }
  },
  data() {
    return {}
  },
  computed: {
    ...mapGetters([])
  },
  created() {
  },
  methods: {}
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ReceptionDiv {
}
</style>
