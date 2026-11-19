<template>
  <el-drawer title="排班顺序调整"
             :close-on-click-modal="false"
             :visible.sync="dialogVisible"
             :before-close="handleClose"
             size="520px">
    <div class="MassagistSortDrawer" v-loading="loading">

      <div class="sort-tip">
        拖拽行或点箭头调整顺序。两处结果不同，可按需选择：
        <div><b>实时交换（推荐在营业中使用）</b>：只把两个人对调，其他人的位置和结果编号都不变。</div>
        <div><b>整轮重排</b>：按当前顺序重写整天的顺序和结果编号，会清掉当天已生成的轮次。</div>
      </div>

      <draggable v-model="sortList"
                 class="sort-table"
                 :style="{height: tableHeight + 'px'}"
                 :animation="150"
                 ghost-class="sort-row-ghost"
                 handle=".sort-drag-handle">
        <div class="sort-row sort-row-head">
          <span class="col-index">顺序</span>
          <span class="col-handle"></span>
          <span class="col-avatar"></span>
          <span class="col-name">姓名</span>
          <span class="col-action">调整</span>
        </div>
        <div v-for="item in sortList" :key="item.id" class="sort-row">
          <span class="col-index">{{ item.order }}</span>
          <span class="col-handle"><i class="el-icon-rank sort-drag-handle" title="拖拽调整顺序"></i></span>
          <span class="col-avatar"><el-avatar :src="item.avatarUrl" :size="28"></el-avatar></span>
          <span class="col-name">{{ item.name }}</span>
          <span class="col-action">
            <i v-show="item.order > 1" class="el-icon-top" title="上移一位" @click="handleTop(item.order - 1)"></i>
            <i v-show="item.order < sortList.length" class="el-icon-bottom" title="下移一位"
               @click="handleBottom(item.order - 1)"></i>
          </span>
        </div>
        <div v-if="!sortList.length" class="sort-empty">当天还没有排班人员</div>
      </draggable>

      <div class="sort-footer">
        <span v-if="hasChange" class="change-tip">顺序已修改，保存后生效</span>
        <span v-else class="change-tip muted">可拖拽或点箭头调整顺序</span>
        <el-button icon="el-icon-close" @click="handleClose">取 消</el-button>
        <el-button icon="el-icon-refresh-left" @click="handleFullRerank" :loading="rerankLoading">整轮重排</el-button>
        <el-button icon="el-icon-check" type="primary" @click="onSubmit" :loading="saving">保 存</el-button>
      </div>
    </div>

  </el-drawer>
</template>

<script>
import draggable from 'vuedraggable'
import massagistApi from '../../../api/massagist'
import roundScheduleApi from '../../../api/roundSchedule'

export default {
  name: 'MassagistSortDrawer',
  components: {draggable},
  props: {},
  data() {
    return {
      dialogVisible: false,
      loading: false,
      saving: false,
      rerankLoading: false,
      sortList: [],
      // 打开时的顺序，用来算拖拽后该跟谁交换
      originalList: [],
      hasChange: false,
      day: '',
      shopId: ''
    }
  },
  computed: {
    tableHeight() {
      // 抽屉高度减掉标题和底部按钮，列表自己滚动
      return Math.max(240, window.innerHeight - 260)
    }
  },
  created() {
  },
  methods: {
    open(day, shopId) {
      this.dialogVisible = true
      this.hasChange = false
      this.day = day
      this.shopId = shopId
      this.fetchData()
    },
    async fetchData() {
      this.loading = true
      try {
        const res = await massagistApi.findSortList(this.day, this.shopId) || {}
        this.sortList = this.normalize(res.data || [])
        this.originalList = this.sortList.map(item => ({id: item.id, order: item.order}))
        this.hasChange = false
      } finally {
        this.loading = false
      }
    },
    /** 打开时的 order 就是服务端当前的顺序，用 order 判断位置而不是用下标（拖拽过程中下标会乱跳） */
    normalize(list) {
      return list.map((item, index) => ({...item, order: index + 1}))
    },
    /** 上移 / 下移一位：按 order 找到相邻的人换位 */
    moveItem(item, targetOrder) {
      if (!item || targetOrder < 1 || targetOrder > this.sortList.length) {
        return
      }
      const target = this.sortList.find(it => it.order === targetOrder)
      if (!target) {
        return
      }
      target.order = item.order
      item.order = targetOrder
      this.sortList = this.normalize(this.sortList.slice().sort((a, b) => a.order - b.order))
      this.hasChange = true
    },
    handleTop(index) {
      this.moveItem(this.sortList[index], index)
    },
    handleBottom(index) {
      this.moveItem(this.sortList[index], index + 2)
    },
    /** 保存：只提交换了位置的人，逐个调用实时交换接口（一次只对调两个人） */
    async onSubmit() {
      const changes = this.diffChanges()
      if (!changes.length) {
        this.notify('提示', '顺序没有变化', 'info')
        return
      }
      this.saving = true
      this.showFullLoading('正在保存顺序')
      try {
        for (const item of changes) {
          await roundScheduleApi.swapQueue(this.shopId, this.day, item.current, item.original)
        }
        this.hideFullLoading()
        this.notifySuccess()
        this.$emit('submit-success')
        await this.fetchData()
        this.dialogVisible = false
      } catch (e) {
        this.hideFullLoading()
      } finally {
        this.saving = false
      }
    },
    /**
     * 找出换了位置的人。
     *
     * <p>列表是按 order 渲染的，拖拽过程中 order 没变、变的只是「谁占了这个位置」。
     * 所以按 order 排序后，当前位置上的人之间形成一个置换，再拆成两两交换：
     * 「现在站这个位置的人 ↔ 原本站这个位置的人」。</p>
     */
    diffChanges() {
      // 按 order 排好后的顺序 = 打开时的原顺序；逐个位置比对，不一致的两两交换
      const current = this.sortList.slice().sort((a, b) => Number(a.order) - Number(b.order)).map(item => Number(item.id))
      const changes = []
      this.originalList.forEach((item, index) => {
        if (current[index] === Number(item.id)) {
          return
        }
        const occupant = current[index]
        const backIndex = current.indexOf(Number(item.id))
        changes.push({current: occupant, original: Number(item.id)})
        current[backIndex] = occupant
        current[index] = Number(item.id)
      })
      return changes
    },
    /** 整轮重排：沿用原来的口径，按当前顺序重写整天顺序（会清掉当天已生成的轮次） */
    async handleFullRerank() {
      try {
        await this.notifyConfirm('整轮重排会按当前顺序重写当天排班顺序，并清掉当天已生成的轮次，确定继续吗？', '整轮重排')
      } catch (e) {
        return
      }
      const massagistIdList = this.sortList.map(item => item.id)
      this.rerankLoading = true
      this.showFullLoading()
      try {
        await massagistApi.rerank(this.day, this.shopId, massagistIdList)
        this.hideFullLoading()
        this.notifySuccess('整轮重排成功')
        this.$emit('submit-success')
        await this.fetchData()
      } finally {
        this.hideFullLoading()
        this.rerankLoading = false
      }
    },
    async handleClose() {
      if (this.hasChange) {
        try {
          await this.notifyConfirm('已调整的顺序还没保存，确定放弃本次调整吗', '放弃修改')
        } catch (e) {
          return
        }
      }
      this.hasChange = false
      this.dialogVisible = false
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.MassagistSortDrawer {
  padding: 0 20px;
  display: flex;
  flex-direction: column;

  .sort-tip {
    font-size: 12px;
    line-height: 20px;
    color: #909399;
    background: #f4f4f5;
    border-radius: 4px;
    padding: 8px 10px;
    margin-bottom: 10px;

    b {
      color: #606266;
      font-weight: 600;
    }
  }

  .sort-table {
    overflow-y: auto;
    border: 1px solid #ebeef5;
    border-radius: 4px;
  }

  .sort-row {
    display: flex;
    align-items: center;
    height: 46px;
    padding: 0 10px;
    border-bottom: 1px solid #ebeef5;
    background: #fff;
    font-size: 14px;
    color: #606266;
    cursor: default;
    user-select: none;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: #f5f7fa;
    }
  }

  .sort-row-head {
    position: sticky;
    top: 0;
    z-index: 1;
    height: 40px;
    background: #fafafa;
    font-weight: 600;
    color: #909399;
  }

  .sort-row-ghost {
    opacity: 0.5;
    background: #ecf5ff !important;
  }

  .col-index {
    width: 50px;
    flex: none;
  }

  .col-handle {
    width: 30px;
    flex: none;
    color: #c0c4cc;
  }

  .sort-drag-handle {
    font-size: 18px;
    cursor: move;
  }

  .col-avatar {
    width: 44px;
    flex: none;
  }

  .col-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-action {
    width: 70px;
    flex: none;
    text-align: right;

    i {
      font-size: 18px;
      padding: 4px 6px;
      cursor: pointer;
      color: #409eff;

      &:hover {
        color: #66b1ff;
      }
    }
  }

  .sort-empty {
    padding: 30px 0;
    text-align: center;
    color: #909399;
    font-size: 13px;
  }

  .sort-footer {
    margin-top: 12px;
    display: flex;
    align-items: center;
    justify-content: flex-end;

    .change-tip {
      flex: 1;
      font-size: 12px;
      color: #e6a23c;

      &.muted {
        color: #909399;
      }
    }
  }
}
</style>
