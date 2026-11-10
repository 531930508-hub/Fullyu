<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <shop-selector v-model="searchForm.shopId" style="width: 180px"
                       placeholder="请选择所属门店" @change="searchData"
                       clearable class="m-r-10"></shop-selector>
        <el-select v-model="searchForm.status" @change="searchData" placeholder="在职状态" clearable class="m-r-10" style="width: 180px">
          <el-option
            v-for="item in constant.jobStatus"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-select v-model="searchForm.identity" @change="searchData" placeholder="身份筛选" clearable class="m-r-10" style="width: 180px">
          <el-option label="内训师" value="trainer"></el-option>
          <el-option label="店长" value="manager"></el-option>
          <el-option label="内训师待开通账号" value="trainer_pending_account"></el-option>
        </el-select>
        <el-input placeholder="请输入疗愈师姓名" v-model="searchForm.name" clearable @clear="searchData" style="width: 260px;">
          <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
        </el-input>
      </div>
      <div>
        <el-button icon="el-icon-plus" @click="handleAdd" type="primary">添加</el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;"
                v-loading="listLoading" border>
        <el-table-column label="所属门店" prop="shopId" width="220">
          <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>
        </el-table-column>
        <el-table-column label="疗愈师姓名" prop="name"></el-table-column>
        <el-table-column label="身份" width="200">
          <template slot-scope="scope">
            <el-tag v-for="code in identityCodes(scope.row)"
                    :key="code"
                    size="mini"
                    :type="identityTagType(code)"
                    class="m-r-5">{{ identityLabel(code) }}</el-tag>
            <el-tag v-if="hasIdentity(scope.row, 'TRAINER') && scope.row.trainerAccountReady === false"
                    size="mini" type="danger">待开通账号</el-tag>
            <span v-if="!identityCodes(scope.row).length" class="identity-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="疗愈师技能" prop="shopId" width="220">
          <template slot-scope="scope">{{ scope.row.projectArr | massagistproject }}</template>
        </el-table-column>
        <el-table-column label="疗愈师性别" prop="sex">
          <template slot-scope="scope">{{ scope.row.sex }}</template>
        </el-table-column>
        <el-table-column label="手机号码" prop="phone">
        </el-table-column>
        <el-table-column label="疗愈师头像" prop="avatarUrl">
          <template slot-scope="scope">
            <el-image v-if="scope.row.avatarUrl"
                      style="width: 50px; height: 50px" :src="scope.row.avatarUrl"
                      :preview-src-list="[scope.row.avatarUrl]"
                      fit="fill"></el-image>
            <span v-else>无</span>
          </template>
        </el-table-column>
        <el-table-column label="在职状态" prop="status">
          <template slot-scope="scope">{{ scope.row.status | jobStatusFilter }}</template>
        </el-table-column>
        <el-table-column label="关联账号" prop="umsAdminUsername">
          <template slot-scope="scope">{{ scope.row.umsAdminUsername }}</template>
        </el-table-column>
        <el-table-column label="正式月份" prop="formalMonth">
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template slot-scope="scope">
            <el-row>
              <el-button
                type="text" icon="el-icon-edit"
                @click="handleUpdate(scope.row,scope.$index)">
                编辑
              </el-button>
<!--              <el-button
                type="text" icon="el-icon-delete"
                @click="handleDelete(scope.row,scope.$index)">删除
              </el-button>-->
            </el-row>
          </template>
        </el-table-column>
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
        :current-page.sync="searchForm.page"
        :total="total">
      </el-pagination>
    </div>
    <massagist-form ref="refMassagistForm" @submit-success="searchData"></massagist-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import massagistApi from "@/api/massagist";
import MassagistForm from "@/views/massagist/management/MassagistForm";
import ShopSelector from "@/views/shop/shopList/ShopSelector";

export default {
  name: 'index',
  components: {ShopSelector, MassagistForm},
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        // 默认只看在职，避免离职脏数据；需要时可手动切换「离职」或清空
        status: 1,
        identity: '',
        order:'-status'
      },
      dataList: [],
      listLoading: false,
      total: 0,
      identityOptions: [
        {value: 'SHOP_MANAGER', label: '店长'},
        {value: 'TRAINER', label: '内训师'},
      ],
    }
  },
  computed: {
    ...mapGetters(['shopId','shopListAll'])
  },
  created() {
    this.$store.dispatch('setShopList')
    this.$store.dispatch('setShopAllList')
    this.loadIdentityOptions()
    this.searchForm.shopId = this.shopId
    this.searchData()
  },
  methods: {
    async loadIdentityOptions() {
      try {
        let res = await massagistApi.identityOptions()
        if (res.data && res.data.length) this.identityOptions = res.data
      } catch (e) {
        // 接口异常时保留内置身份，不影响列表
      }
    },
    identityCodes(row) {
      return Array.isArray(row.identities) ? row.identities : []
    },
    hasIdentity(row, code) {
      return this.identityCodes(row).indexOf(code) > -1
    },
    identityLabel(code) {
      const hit = this.identityOptions.find(item => item.value === code)
      return hit ? hit.label : code
    },
    identityTagType(code) {
      if (code === 'SHOP_MANAGER') return 'warning'
      if (code === 'TRAINER') return 'success'
      return 'info'
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.listLoading = true
      const query = {...this.searchForm}
      if (!query.identity) delete query.identity
      let res = await massagistApi.page(query)
      this.listLoading = false
      let {list, total} = res.data
      this.dataList = list || []
      this.total = total || 0
    },
    handleSizeChange(val) {
      this.searchForm.size = val;
      this.searchData();
    },
    handleCurrentChange(val) {
      this.searchForm.page = val;
      this.fetchData();
    },
    handleAdd() {
      this.$refs.refMassagistForm.open()
    },
    handleUpdate(row, index) {
      row.projectArrPage=JSON.parse(row.projectArr)

      this.$refs.refMassagistForm.open(row)
    },
    async handleDelete(row, index) {
      await this.notifyDelete()
      await massagistApi.remove(row.id)
      this.searchData()
      this.notifySuccess()
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding:0 20px;
}

.identity-muted {
  color: #c0c4cc;
}

.m-r-5 {
  margin-right: 5px;
}
</style>
