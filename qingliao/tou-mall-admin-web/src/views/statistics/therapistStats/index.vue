<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex stats-filters">
        <shop-selector v-if="!massagist" v-model="searchForm.shopId" class="m-r-10" style="width: 220px" :clearable="true"
                       @change="changeShop"></shop-selector>
        <massagist-selector v-if="!massagist" v-model="searchForm.massagistIds" multiple clearable class="m-r-10"
                            style="width: 260px" :shop-id="searchForm.shopId" :filter-status="searchForm.status"
                            @change="searchData"></massagist-selector>
        <el-select v-model="searchForm.status" class="m-r-10" aria-label="合作状态" @change="changeStatus">
          <el-option label="合作中" :value="1"></el-option>
          <el-option label="暂停合作" :value="2"></el-option>
          <el-option label="已结束合作" :value="0"></el-option>
          <el-option label="全部合作状态" :value="-1"></el-option>
        </el-select>
        <el-date-picker :clearable="false"
                        v-model="dateTime" @change="searchDateTime"
                        type="daterange" value-format="yyyy-MM-dd HH:mm:ss"
                        range-separator="至" :default-time="['00:00:00','23:59:59']"
                        start-placeholder="开始日期"
                        end-placeholder="结束日期">
        </el-date-picker>
      </div>
      <div>
        <el-button @click="exportExcel" :loading="exporting" :disabled="exporting" icon="el-icon-paperclip" type="primary">导出全部结果</el-button>
      </div>
    </div>
    <div class="stats-hint">
      按完成时间统计已完成服务；订单、支付方式、部位按单计，顾客按人计，点钟按服务项目计；新增点钟为该顾客首次点该疗愈师。
    </div>
    <div class="table-container">
      <el-table :data="dataList" style="width: 100%;" v-loading="listLoading" border
                show-summary :summary-method="summaryMethod">
        <el-table-column label="疗愈师" prop="massagistName" width="120" fixed show-overflow-tooltip></el-table-column>
        <el-table-column label="合作状态" prop="statusText" width="100"></el-table-column>
        <el-table-column label="服务订单数" prop="orderCount" width="100"></el-table-column>
        <el-table-column label="服务项目数" prop="serviceCount" width="100"></el-table-column>
        <el-table-column label="支付方式（单）" align="center">
          <el-table-column v-for="c in payColumns" :key="c.prop" :label="c.label" :prop="c.prop" width="76"></el-table-column>
        </el-table-column>
        <el-table-column label="顾客（人）" align="center">
          <el-table-column label="男" prop="maleCustomers" width="64"></el-table-column>
          <el-table-column label="女" prop="femaleCustomers" width="64"></el-table-column>
          <el-table-column label="未知" prop="unknownGenderCustomers" width="64"></el-table-column>
        </el-table-column>
        <el-table-column label="点钟" align="center">
          <el-table-column label="点钟" prop="specifyCount" width="70"></el-table-column>
          <el-table-column label="新增点钟" prop="newSpecifyCount" width="86"></el-table-column>
        </el-table-column>
        <el-table-column label="部位（单）" align="center">
          <el-table-column v-for="c in partColumns" :key="c.prop" :label="c.label" :prop="c.prop" width="64"></el-table-column>
        </el-table-column>
      </el-table>
    </div>
    <div class="pagination-container">
      <el-pagination :current-page="searchForm.page" :page-size="searchForm.size" :total="total"
                     :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper"
                     @current-change="handleCurrentChange" @size-change="handleSizeChange"></el-pagination>
    </div>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import statisticsApi from "@/api/statistics";
import dateUtil from "@/utils/dateUtil";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import MassagistSelector from "@/views/massagist/management/MassagitSelector";

export default {
  name: 'therapistStats',
  components: {MassagistSelector, ShopSelector},
  data() {
    return {
      searchForm: {
        startTime: '',
        endTime: '',
        shopId: '',
        massagistIds: [],
        status: 1,
        page: 1,
        size: 10,
      },
      payColumns: [
        {label: '微信', prop: 'wechatCount'}, {label: '二维码', prop: 'qrCount'},
        {label: 'Full愈券', prop: 'couponCount'}, {label: '美团', prop: 'meituanCount'},
        {label: '现金', prop: 'cashCount'}, {label: '其他', prop: 'otherPayCount'}
      ],
      partColumns: [
        {label: '头', prop: 'headCount'}, {label: '肩', prop: 'shoulderCount'}, {label: '腿', prop: 'legCount'},
        {label: '脸', prop: 'faceCount'}, {label: '眼', prop: 'eyeCount'}, {label: '手', prop: 'handCount'},
        {label: '耳', prop: 'earCount'}, {label: '其他', prop: 'otherPartCount'}
      ],
      dateTime: [],
      dataList: [],
      summary: null,
      listLoading: false,
      exporting: false,
      requestSequence: 0,
      destroyed: false,
      total: 0
    }
  },
  computed: {
    ...mapGetters(['roles', 'massagistId', 'shopId']),
    massagist() {
      return (this.roles || []).filter(s => s == '疗愈师').length > 0
    }
  },
  created() {
    this.$store.dispatch("setMassagistList")
    this.$store.dispatch('setShopList')
    if (this.massagist) {
      this.searchForm.massagistIds = [this.massagistId]
    } else {
      this.searchForm.shopId = this.shopId
    }
    const start = dateUtil.getCurrentMonthCode() + "-01 00:00:00"
    const end = dateUtil.getCurrentDateCode() + " 23:59:59"
    this.searchForm.startTime = start
    this.searchForm.endTime = end
    this.dateTime = [start, end]
    this.searchData()
  },
  beforeDestroy() {
    this.destroyed = true
    this.requestSequence++
  },
  methods: {
    queryParams(form, keepPaging) {
      const params = {
        shopId: form.shopId,
        massagistIds: (form.massagistIds || []).join(','),
        status: form.status,
        startTime: form.startTime,
        endTime: form.endTime
      }
      if (keepPaging) {
        params.page = form.page
        params.size = form.size
      }
      Object.keys(params).forEach(k => {
        if (params[k] === '' || params[k] === null || params[k] === undefined) delete params[k]
      })
      return params
    },
    searchData() {
      this.searchForm.page = 1
      return this.fetchData()
    },
    changeShop() {
      if (!this.massagist) this.searchForm.massagistIds = []
      return this.searchData()
    },
    changeStatus() {
      if (!this.massagist) this.searchForm.massagistIds = []
      return this.searchData()
    },
    handleCurrentChange(page) {
      this.searchForm.page = page
      return this.fetchData()
    },
    handleSizeChange(size) {
      this.searchForm.size = size
      return this.searchData()
    },
    async fetchData() {
      const sequence = ++this.requestSequence
      const params = this.queryParams(this.searchForm, true)
      this.listLoading = true
      try {
        const res = await statisticsApi.therapistStats(params)
        if (this.destroyed || sequence !== this.requestSequence) return
        const data = (res && res.data) || {}
        this.dataList = data.list || []
        this.total = Number(data.total) || 0
        this.summary = data.summary || null
      } finally {
        if (!this.destroyed && sequence === this.requestSequence) this.listLoading = false
      }
    },
    summaryMethod({columns}) {
      return columns.map((col, i) => {
        if (i === 0) return '本页合计'
        if (!this.summary || !col.property || col.property === 'statusText') return ''
        const v = this.summary[col.property]
        return v === undefined || v === null ? '' : v
      })
    },
    async exportExcel() {
      if (this.exporting) return
      const params = this.queryParams(this.searchForm, false)
      this.exporting = true
      let loadingShown = false
      try {
        await this.notifyConfirm("将导出当前筛选条件下的全部疗愈师统计（含合计行），是否确定？")
        if (this.destroyed) return
        this.showFullLoading('正在导出文件', true)
        loadingShown = true
        await statisticsApi.therapistStatsExport(params)
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.exporting = false
      }
    },
    searchDateTime(val) {
      if (val && val.length > 0) {
        this.searchForm.startTime = val[0]
        this.searchForm.endTime = val[1]
      }
      this.searchData()
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 0 20px;

  .operate-container {
    gap: 10px;
    flex-wrap: wrap;
  }

  .stats-filters {
    flex-wrap: wrap;
    gap: 10px 0;
    min-width: 0;
  }

  .stats-hint {
    color: #909399;
    font-size: 12px;
    line-height: 20px;
    margin: 8px 0 0;
  }

  .pagination-container {
    overflow-x: auto;
  }
}
</style>
