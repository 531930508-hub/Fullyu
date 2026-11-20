<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex flex-wrap" style="gap:10px;width: 70%" >
        <el-select v-model="searchForm.gender" style="width: 110px" placeholder="客户性别" clearable @change="searchData">
          <el-option v-for="item in constant.gender"
                     :value="item.value"
                     :label="item.label" :key="item.value">
            <span>{{ item.label }}</span>
          </el-option>
        </el-select>
        <el-input placeholder="请输入客户昵称" v-model="searchForm.nickname" clearable @keyup.enter.native="searchData"
                  style="width: 180px;display: inline-block" @clear="searchData">
        </el-input>
        <el-input placeholder="请输入称呼" v-model="searchForm.comment" clearable @keyup.enter.native="searchData"
                  style="width: 180px;display: inline-block" @clear="searchData">
        </el-input>
        <el-date-picker :clearable="false" clearable style="width: 400px;"
                        v-model="dateTime" @change="searchDateTime"
                        type="daterange" value-format="yyyy-MM-dd HH:mm:ss"
                        range-separator="至" :default-time="['00:00:00','23:59:59']"
                        start-placeholder="注册日期起"
                        end-placeholder="注册日期止"/>
        <el-date-picker :clearable="false" clearable style="width: 400px;"
                        v-model="dateTime2" @change="searchDateTime2"
                        type="daterange" value-format="yyyy-MM-dd HH:mm:ss"
                        range-separator="至" :default-time="['00:00:00','23:59:59']"
                        start-placeholder="更新日期起"
                        end-placeholder="更新日期止"/>
        <basic-customer-tag-selector v-model="searchForm.customerTag" @change="searchData" multiple placeholder="客户标签"
                                     clearable style="width: 200px;"/>
        <el-input placeholder="请输入手机号查询" v-model="searchForm.phone" clearable
                  style="width: 220px;height: 100%" @keyup.enter.native="searchData" @clear="searchData">
          <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
        </el-input>
      </div>
      <div style="width: 30%" class="flex justify-end">
        <el-popover
          v-if="isAdmin"
          placement="bottom"
          width="200"
          trigger="click">
          <el-button slot="reference">导出</el-button>
          <div class="flex justify-center">请选择要导出的类型</div>
          <div class="flex justify-center m-t-10">
            <el-button type="primary" size="mini" @click="handleExport('excel')">Excel</el-button>
            <el-button type="primary" size="mini" @click="handleExport('vcf')">vCard</el-button>
          </div>
        </el-popover>
        <el-button @click="goTagManage" icon="el-icon-files" style="margin-left: 20px">
          标签管理
        </el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="refTable" :data="dataList" style="width: 100%;" border>
        <el-table-column label="客户" header-align="left" align="left" min-width="190" fixed="left">
          <template slot-scope="scope">
            <div class="customer-cell hover-click" @click="handleEditCustomer(scope.row)">
              <el-image v-if="scope.row.avatar" class="customer-avatar" :src="scope.row.avatar"
                        :preview-src-list="[scope.row.avatar]" fit="cover" @click.stop></el-image>
              <span v-else class="customer-avatar customer-avatar--empty">
                {{ avatarInitial(scope.row.nickname) }}
              </span>
              <div class="customer-cell__main">
                <span class="ellipsis">{{ displayNickname(scope.row.nickname, '未设置昵称') }}</span>
                <i v-if="scope.row.gender == 1" class="el-icon-male c-blue" title="男"></i>
                <i v-else-if="scope.row.gender == 2" class="el-icon-female c-danger" title="女"></i>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="手机号" header-align="left" align="left" prop="phone" width="130">
          <template slot-scope="scope">{{ scope.row.phone | maskPhoneFilter }}</template>
        </el-table-column>
        <el-table-column label="称呼" header-align="left" align="left" prop="comment" min-width="100"
                         show-overflow-tooltip>
          <template slot-scope="scope">
            <span v-if="scope.row.comment" class="hover-click" @click="handleEditCustomer(scope.row)">
              {{ scope.row.comment }}
              <i class="el-icon-edit"></i>
            </span>
            <span v-else class="text-placeholder hover-click" @click="handleEditCustomer(scope.row)">
              待补充 <i class="el-icon-edit"></i>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="备注" header-align="left" align="left" prop="note" min-width="150"
                         show-overflow-tooltip>
          <template slot-scope="scope">
            <span v-if="scope.row.note" class="hover-click" @click="handleEditCustomer(scope.row)">
              {{ scope.row.note }}
              <i class="el-icon-edit"></i>
            </span>
            <span v-else class="text-placeholder hover-click" @click="handleEditCustomer(scope.row)">
              待补充 <i class="el-icon-edit"></i>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="生日" header-align="center" align="center" prop="birthday" width="130">
          <template slot-scope="scope">
            <span v-if="scope.row.birthday" class="hover-click" @click="handleEditCustomer(scope.row)">
              {{ birthdayLabel(scope.row.birthday) }}
              <span v-if="isBirthdayToday(scope.row.birthday)" class="birthday-flag">今天</span>
            </span>
            <span v-else class="text-placeholder hover-click" @click="handleEditCustomer(scope.row)">
              待补充
            </span>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" header-align="center" align="center" prop="createTime"
                         width="155"></el-table-column>

        <el-table-column label="客户标签" header-align="left" align="left" min-width="230">
          <template slot-scope="scope">
            <div class="tag-cell hover-click" @click="openCustomerTag(scope.row)">
              <template v-if="scope.row.customerTagNames && scope.row.customerTagNames.length">
                <el-tag v-for="name in scope.row.customerTagNames.slice(0, 2)" :key="name" size="mini"
                        class="tag-cell__item">{{ name }}</el-tag>
                <el-tooltip v-if="scope.row.customerTagNames.length > 2"
                            :content="scope.row.customerTagNames.join('、')" placement="top">
                  <el-tag size="mini" type="info">+{{ scope.row.customerTagNames.length - 2 }}</el-tag>
                </el-tooltip>
              </template>
              <span v-else class="text-placeholder">点击添加</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="可用券" header-align="center" align="center" prop="couponCount" width="90">
          <template slot-scope="scope">
            <el-tag class="hover-click" size="mini" @click="openCustomerCoupon(scope.row)">
              {{ scope.row.couponCount || 0 }}张
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="积分" header-align="center" align="center" prop="integration"
                         width="90">
        </el-table-column>
        <el-table-column label="品牌会员" header-align="center" align="center" width="100">
          <template slot-scope="scope">
            <el-tag v-if="scope.row.brandCardLocked === 1" size="mini" type="danger">已锁定</el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="疗愈师偏好" header-align="center" align="center" min-width="140">
          <template slot-scope="scope">
            <span class="hover-click" @click.stop="openTherapistDrawer(scope.row)">
              收藏 {{ getPreference(scope.row.id).favorite }} · 暂别 {{ getPreference(scope.row.id).block }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="推荐人" min-width="120" header-align="center" align="center"
                         prop="referrerCustomerName">
        </el-table-column>
        <el-table-column label="更新时间" header-align="center" align="center" prop="updateTime"
                         width="155"></el-table-column>
      </el-table>
    </div>
    <div class="pagination-container">
      <el-pagination
        background
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
        layout="total, sizes,prev, pager, next,jumper"
        :page-size="searchForm.size"
        :page-sizes="[5,10,15]"
        hide-on-single-page
        :current-page.sync="searchForm.page"
        :total="total">
      </el-pagination>
    </div>
    <customer-tag-drawer ref="refCustomerTagDrawer" @change="fetchData"></customer-tag-drawer>
    <customer-coupon-drawer ref="refCustomerCouponDrawer" @submit-success="fetchData"></customer-coupon-drawer>
    <customer-form-dialog ref="refCustomerFormDialog" @submit-success="fetchData"></customer-form-dialog>
    <customer-therapist-drawer ref="refCustomerTherapistDrawer" @change="loadPreferenceCounts(dataList)"/>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import customerApi from '@/api/customer';
import BasicCustomerTagCascader from './components/BasicCustomerTagCascader.vue'
import CustomerTagDrawer from './components/CustomerTagDrawer.vue'
import CustomerCouponDrawer from "./components/CustomerCouponDrawer"
import CustomerFormDialog from "../home/CustomerFormDialog";
import BasicCustomerTagSelector from "./components/BasicCustomerTagSelector";
import fileUtil from "@/utils/fileUtil"
import CustomerTherapistDrawer from "./components/CustomerTherapistDrawer"
import customerMassagistBlockApi from "@/api/customer/customerMassagistBlock"
import { isBirthdayToday as checkBirthdayToday, birthdayMonthDayLabel } from "@/utils/birthday"
import basicCustomerTagApi from "@/api/customer/basicCustomerTag"
import dateUtil from "../../utils/dateUtil"

export default {
  name: 'index',
  components: {
    CustomerTherapistDrawer,
    BasicCustomerTagSelector,
    CustomerFormDialog,
    CustomerCouponDrawer, CustomerTagDrawer, BasicCustomerTagCascader
  },
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        order: '-id'
      },
      total: 0,
      dataList: [],
      basicTagTitleMap: {},
      preferenceCountMap: {},
      listSeq: 0,
      dateTime: [],
      dateTime2: []
    }
  },
  computed: {
    ...mapGetters(['roles']),
    // 导出含完整手机号，仅超级管理员可见入口
    isAdmin() {
      return (this.roles || []).indexOf('超级管理员') > -1
    }
  },
  created() {
    this.init()
  },
  methods: {
    isBirthdayToday(birthday) {
      return checkBirthdayToday(birthday)
    },
    birthdayLabel(birthday) {
      return birthdayMonthDayLabel(birthday)
    },
    async init() {
      await this.loadBasicTagTitles()
      this.searchData()
    },
    async loadBasicTagTitles() {
      try {
        const res = await basicCustomerTagApi.all()
        const map = {}
        const walk = (list) => {
          (list || []).forEach(item => {
            if (!item) return
            if (item.id != null && item.title) {
              map[item.id] = item.title
            }
            walk(item.children)
          })
        }
        walk(res.data)
        this.basicTagTitleMap = map
      } catch (e) {
        this.basicTagTitleMap = {}
      }
    },
    resolveCustomerTagNames(tags) {
      if (!Array.isArray(tags)) return []
      const names = []
      tags.forEach(tag => {
        if (tag == null) return
        const isEntity = typeof tag === 'object'
        const basicTagId = isEntity
          ? (tag.basicCustomerTagId != null ? tag.basicCustomerTagId : tag.id)
          : tag
        let name = isEntity ? (tag.title || tag.name) : ''
        if (!name || /^\d+$/.test(String(name).trim())) {
          name = this.basicTagTitleMap[basicTagId]
        }
        name = name == null ? '' : String(name).trim()
        if (name && names.indexOf(name) === -1) {
          names.push(name)
        }
      })
      return names
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      const seq = ++this.listSeq
      try {
        this.showFullLoading()
        let res = await customerApi.page({
          ...this.searchForm,
          customerTag: this.searchForm.customerTag != null ? this.searchForm.customerTag.join(",") : ''
        })
        if (seq !== this.listSeq) return
        let {list, total} = res.data
        this.dataList = (list || []).map(item => ({
          ...item,
          customerTagNames: this.resolveCustomerTagNames(item.customerTagList)
        }))
        this.total = total || 0
        this.loadPreferenceCounts(this.dataList)
      } finally {
        if (seq === this.listSeq) this.hideFullLoading()
      }
    },
    async loadPreferenceCounts(customers) {
      const customerIds = (customers || []).map(c => c.id).filter(id => id != null)
      if (!customerIds.length) {
        this.preferenceCountMap = {}
        return
      }
      try {
        const res = await customerMassagistBlockApi.count(customerIds)
        this.preferenceCountMap = res.data || {}
      } catch (e) {
        this.preferenceCountMap = {}
      }
    },
    getPreference(customerId) {
      const item = this.preferenceCountMap[customerId] || {}
      return {
        favorite: item.favorite || 0,
        block: item.block || 0
      }
    },
    openTherapistDrawer(row) {
      this.$refs.refCustomerTherapistDrawer.open(row.id, row.nickname)
    },
    handleSizeChange(val) {
      this.searchForm.size = val;
      this.searchData();
    },
    handleCurrentChange(val) {
      this.searchForm.page = val;
      this.fetchData();
    },
    goTagManage() {
      this.$router.push({path: '/crm/tag'})
    },
    openCustomerTag(row) {
      let nickname = this.customerTitle(row)
      this.$refs.refCustomerTagDrawer.open(row, nickname)
    },
    openCustomerCoupon(row) {
      let nickname = this.customerTitle(row)
      this.$refs.refCustomerCouponDrawer.open(row.id, nickname)
    },
    handleEditCustomer(customer) {
      this.$refs.refCustomerFormDialog.open(customer)
    },
    async handleExport(exportType) {
      await this.notifyConfirm("将按照当前筛选条件进行导出，是否确定导出？")
      this.showFullLoading('正在导出文件', true)
      let fileName = "导出客户信息"
      if (this.searchForm.startCreateTime) {
        fileName += "&注册时间:" + dateUtil.toDate(this.searchForm.startCreateTime) + "到" + dateUtil.toDate(this.searchForm.endCreateTime)
      }
      if (this.searchForm.startUpdateTime) {
        fileName += "&更新时间:" + dateUtil.toDate(this.searchForm.startUpdateTime) + "到" + dateUtil.toDate(this.searchForm.endUpdateTime)
      }
      await customerApi.exportExcel({
        ...this.searchForm,
        customerTag: this.searchForm.customerTag != null ? this.searchForm.customerTag.join(",") : '',
        exportType: exportType
      }).then(res => {
        if (exportType == 'vcf') {
          fileUtil.exportZipSave(res, fileName + ".zip")
        } else {
          fileUtil.exportSave(res, fileName + ".xlsx")
        }
      })
      this.hideFullLoading()
    },
    searchDateTime(val) {
      if (this.dateTime) {
        this.searchForm.startCreateTime = val[0]
        this.searchForm.endCreateTime = val[1]
      } else {
        this.searchForm.startCreateTime = ''
        this.searchForm.endCreateTime = ''
      }
      this.searchData()
    },
    searchDateTime2(val) {
      if (this.dateTime2) {
        this.searchForm.startUpdateTime = val[0]
        this.searchForm.endUpdateTime = val[1]
      } else {
        this.searchForm.startUpdateTime = ''
        this.searchForm.endUpdateTime = ''
      }
      this.searchData()
    },
    customerTitle(customer) {
      if (!customer) {
        return
      }
      const {comment, nickname, phone, gender} = customer
      if (comment && gender) {
        return comment + (gender == 1 ? '先生' : gender == 2 ? '女士' : '')
      }
      const maskPhone = this.$options.filters['maskPhoneFilter']
      if (nickname && (nickname === '用户' + phone || /^1\d{10}$/.test(nickname))) {
        return maskPhone(phone || nickname)
      }
      return nickname
    },
    // 头像占位字：默认昵称「用户7229」取号码后两位，其余取首字
    // （默认昵称统一以「用户」开头，取首字会让一万多位客户的头像都变成同一个「用」）
    avatarInitial(nickname) {
      const name = nickname || '客'
      const tail = /^用户(\d{4})$/.exec(name)
      return tail ? tail[1].slice(-2) : name[0]
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 0 20px;
}

.customer-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.customer-avatar {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 50%;
}

.customer-avatar--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f3f6;
  color: #98a2b3;
  font-size: 14px;
  font-weight: 600;
}

.customer-cell__main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: #1d2939;
  font-weight: 500;

  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.tag-cell {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 24px;

  .tag-cell__item {
    display: inline-block;
    max-width: 108px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
  }
}

.text-placeholder {
  color: #b0b7c3;
}

.birthday-flag {
  display: inline-block;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 8px;
  background: rgba(255, 138, 101, 0.16);
  color: #e8590c;
  font-size: 11px;
  line-height: 17px;
}
</style>
