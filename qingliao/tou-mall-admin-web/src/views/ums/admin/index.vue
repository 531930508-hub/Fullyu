<template> 
  <div class="app-container">
    <el-card class="filter-container" shadow="never">
      <div>
        <i class="el-icon-search"></i>
        <span>筛选搜索</span>
        <el-button
          style="float:right"
          type="primary"
          @click="handleSearchList()"
          size="small">
          查询搜索
        </el-button>
        <el-button
          style="float:right;margin-right: 15px"
          @click="handleResetSearch()"
          size="small">
          重置
        </el-button>
      </div>
      <div style="margin-top: 15px">
        <el-form :inline="true" :model="listQuery" size="small" label-width="140px">
          <el-form-item label="输入搜索：">
            <el-input v-model="listQuery.keyword" class="input-width" placeholder="帐号/姓名" clearable></el-input>
          </el-form-item>
        </el-form>
      </div>
    </el-card>
    <el-card class="operate-container" shadow="never">
      <i class="el-icon-tickets"></i>
      <span>数据列表</span>
      <el-button size="mini" @click="handleAdd()" style="margin-left: 20px" class="btn-add">添加</el-button>
    </el-card>
    <div class="table-container">
      <el-table ref="adminTable"
                :data="list"
                style="width: 100%;"
                v-loading="listLoading" border>
        <el-table-column label="编号" width="100" align="center">
          <template slot-scope="scope">{{scope.row.id}}</template>
        </el-table-column>
        <el-table-column label="所属店铺" align="center">
          <template slot-scope="scope"><span v-html="scope.row.shopIdArrName"></span> </template>
        </el-table-column>
        <el-table-column label="帐号" align="center">
          <template slot-scope="scope">{{scope.row.username}}</template>
        </el-table-column>
        <el-table-column label="姓名" align="center">
          <template slot-scope="scope">{{scope.row.nickName}}</template>
        </el-table-column>
        <el-table-column label="所属疗愈师" align="center">
          <template slot-scope="scope">{{scope.row.massagistName}}</template>
        </el-table-column>
<!--        <el-table-column label="邮箱" align="center">
          <template slot-scope="scope">{{scope.row.email}}</template>
        </el-table-column>-->
<!--        <el-table-column label="添加时间" width="160" align="center">-->
<!--          <template slot-scope="scope">{{scope.row.createTime | formatDateTime}}</template>-->
<!--        </el-table-column>-->
<!--        <el-table-column label="最后登录" width="160" align="center">-->
<!--          <template slot-scope="scope">{{scope.row.loginTime | formatDateTime}}</template>-->
<!--        </el-table-column>-->
        <el-table-column label="是否启用" width="140" align="center">
          <template slot-scope="scope">
            <el-switch
              @change="handleStatusChange(scope.$index, scope.row)"
              :active-value="1"
              :inactive-value="0"
              v-model="scope.row.status">
            </el-switch>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center">
          <template slot-scope="scope">
            <el-button size="mini"
                       type="text"
                       @click="handleSelectRole(scope.$index, scope.row)">分配角色
            </el-button>
<!--            <el-button size="mini"
                       type="text"
                       @click="relatedMassafist(scope.$index, scope.row)">
              关联疗愈师
            </el-button>-->
            <el-button size="mini"
                       type="text"
                       @click="handleUpdate(scope.$index, scope.row)">
              编辑
            </el-button>
            <el-button size="mini"
                       type="text" v-if="!scope.row.massagistName"
                       @click="handleDelete(scope.$index, scope.row)">删除
            </el-button>
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
        :current-page.sync="listQuery.pageNum"
        :page-size="listQuery.pageSize"
        :page-sizes="[10,15,20]"
        :total="total">
      </el-pagination>
    </div>
    <el-dialog
      :title="isEdit?'编辑用户':'添加用户'"
      :visible.sync="dialogVisible"
      width="40%">
      <el-form :model="admin"
               ref="adminForm"
               label-width="100px" size="small">
        <el-form-item label="所属门店：" required>
          <el-select :disabled="isDisabled"  v-model="admin.shopIdArrOther" multiple placeholder="可多选门店" @change="SetShopId" size="small" style="width: 100%">
            <el-option
              v-for="item in shopListAll"
              :key="item.id"
              :label="item.name"
              :value="item.id">
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="帐号/手机：" required>
          <el-input v-model="admin.username" style="width: 100%"></el-input>
        </el-form-item>
        <el-form-item label="注册姓名：" required>
          <el-input v-model="admin.nickName" style="width: 100%"></el-input>
        </el-form-item>
<!--        <el-form-item label="邮箱：">
          <el-input v-model="admin.email" style="width: 250px"></el-input>
        </el-form-item>-->
        <el-form-item label="注册密码：" required>
          <el-input v-model="admin.password"  type="password" style="width: 100%"></el-input>
        </el-form-item>
        <el-form-item label="账号备注：">
          <el-input v-model="admin.note"
                    type="textarea"
                    :rows="5"
                    style="width: 100%"></el-input>
        </el-form-item>
        <el-form-item label="是否启用：">
          <el-radio-group v-model="admin.status" style="width: 100%">
            <el-radio :label="1">是</el-radio>
            <el-radio :label="0">否</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="dialogVisible = false" size="small">取 消</el-button>
        <el-button type="primary" @click="handleDialogConfirm()" size="small">确 定</el-button>
      </span>
    </el-dialog>
    <el-dialog
      title="分配角色"
      :visible.sync="allocDialogVisible"
      width="30%">
      <el-select v-model="allocRoleIds" multiple placeholder="请选择" size="small" style="width: 80%">
        <el-option
          v-for="item in allRoleList"
          :key="item.id"
          :label="item.name"
          :value="item.id">
        </el-option>
      </el-select>
      <span slot="footer" class="dialog-footer">
        <el-button @click="allocDialogVisible = false" size="small">取 消</el-button>
        <el-button type="primary" @click="handleAllocDialogConfirm()" size="small">确 定</el-button>
      </span>
    </el-dialog>
    <related-massagist-form ref="refRelatedMassagistForm" @submit-success="getList"></related-massagist-form>
  </div>
</template>
<script>
  import {fetchList,createAdmin,updateAdmin,updateStatus,deleteAdmin,getRoleByAdmin,allocRole,getShopListByShopIdArr} from '@/api/login';
  import {fetchAllRoleList} from '@/api/role';
  import {formatDate} from '@/utils/date';
  import RelatedMassagistForm from "@/views/ums/admin/RelatedMassagistForm";
  import ShopSelector from "@/views/shop/shopList/ShopSelector";
  import {mapGetters} from 'vuex'

  const defaultListQuery = {
    pageNum: 1,
    pageSize: 10,
    keyword: null
  };
  const defaultAdmin = {
    id: null,
    username: null,
    password: null,
    nickName: null,
    email: null,
    note: null,
    status: 1,
    shopIdArrOther:[]
  };
  export default {
    name: 'adminList',
    components: {ShopSelector, RelatedMassagistForm},
    data() {
      return {
        listQuery: Object.assign({}, defaultListQuery),
        list: null,
        total: null,
        listLoading: false,
        dialogVisible: false,
        admin: Object.assign({}, defaultAdmin),
        isEdit: false,
        allocDialogVisible: false,
        allocRoleIds:[],
        allRoleList:[],
        allocAdminId:null,
        isDisabled:false,
      }
    },
    computed: {
      ...mapGetters(['shopListAll'])
    },
    created() {
      this.getList();
      this.getAllRoleList();
      this.$store.dispatch('setShopAllList')
    },
    filters: {
      formatDateTime(time) {
        if (time == null || time === '') {
          return 'N/A';
        }
        let date = new Date(time);
        return formatDate(date, 'yyyy-MM-dd hh:mm:ss')
      }
    },
    methods: {
      handleResetSearch() {
        this.listQuery = Object.assign({}, defaultListQuery);
      },
      handleSearchList() {
        this.listQuery.pageNum = 1;
        this.getList();
      },
      handleSizeChange(val) {
        this.listQuery.pageNum = 1;
        this.listQuery.pageSize = val;
        this.getList();
      },
      handleCurrentChange(val) {
        this.listQuery.pageNum = val;
        this.getList();
      },
      handleAdd() {
        this.dialogVisible = true;
        this.isEdit = false;
        this.admin = Object.assign({},defaultAdmin);
        this.isDisabled=false;
      },
      handleStatusChange(index, row) {
        this.$confirm('是否要修改该状态?', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          updateStatus(row.id, {status: row.status}).then(response => {
            this.$message({
              type: 'success',
              message: '修改成功!'
            });
          });
        }).catch(() => {
          this.$message({
            type: 'info',
            message: '取消修改'
          });
          this.getList();
        });
      },
      handleDelete(index, row) {
        this.$confirm('是否要删除该用户?', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          deleteAdmin(row.id).then(response => {
            this.$message({
              type: 'success',
              message: '删除成功!'
            });
            this.getList();
          });
        });
      },
      handleUpdate(index, row) {
        console.log(row);
        this.dialogVisible = true;
        this.isEdit = true;
        this.admin = Object.assign({},row);
        //控制疗愈师门店不可修改
        if(this.admin.massagistName!=null&&this.admin.massagistName!=undefined&&this.admin.massagistName.length>0){
          this.isDisabled=true;
        }else{
          this.isDisabled=false;
        }
        let params = new URLSearchParams();
        params.append("shopIdArr", this.admin.shopIdArr);
        let that = this;
        getShopListByShopIdArr(params).then(response => {
          let responseData = response.data;
          this.admin.shopIdArrOther=[];
          if(responseData!=null&&responseData.length>0){
            for(let i=0;i<responseData.length;i++){
              console.log(responseData[i]);
              this.admin.shopIdArrOther.push(responseData[i].id);
            }
          }
        });
      },
      handleDialogConfirm() {
        this.$confirm('是否要确认?', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          if (this.isEdit) {
            updateAdmin(this.admin.id,this.admin).then(response => {
              this.$message({
                message: '修改成功！',
                type: 'success'
              });
              this.dialogVisible =false;
              this.getList();
            })
          } else {
            createAdmin(this.admin).then(response => {
              this.$message({
                message: '添加成功！',
                type: 'success'
              });
              this.dialogVisible =false;
              this.getList();
            })
          }
          this.$store.dispatch('setShopList',true)
        })
      },
      handleAllocDialogConfirm(){
        this.$confirm('是否要确认?', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          let params = new URLSearchParams();
          params.append("adminId", this.allocAdminId);
          params.append("roleIds", this.allocRoleIds);
          allocRole(params).then(response => {
            this.$message({
              message: '分配成功！',
              type: 'success'
            });
            this.allocDialogVisible = false;
          })
        })
      },
      handleSelectRole(index,row){
        this.allocAdminId = row.id;
        this.allocDialogVisible = true;
        this.getRoleListByAdmin(row.id);
      },
      relatedMassafist(index,row){
        this.$refs.refRelatedMassagistForm.open(row)
      },
      getList() {
        this.listLoading = true;
        fetchList(this.listQuery).then(response => {
          this.listLoading = false;
          this.list = response.data.list;
          this.total = response.data.total;
        });
      },
      getAllRoleList() {
        fetchAllRoleList().then(response => {
          this.allRoleList = response.data;
        });
      },
      getRoleListByAdmin(adminId) {
        getRoleByAdmin(adminId).then(response => {
          let allocRoleList = response.data;
          this.allocRoleIds=[];
          if(allocRoleList!=null&&allocRoleList.length>0){
            for(let i=0;i<allocRoleList.length;i++){
              this.allocRoleIds.push(allocRoleList[i].id);
            }
          }
        });
      },
      SetShopId(obj){
        if(obj.length>0){
          console.log(obj);
          this.admin.shopId=obj[0];
        }
      }
    }
  }
</script>
<style></style>


