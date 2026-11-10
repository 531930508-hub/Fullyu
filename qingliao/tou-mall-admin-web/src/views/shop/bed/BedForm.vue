<template>
  <div class="BedForm">
    <el-dialog
      :title="form.id ? '编辑床位':'新增床位'"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="80px" label-position="left" class="margin-lr-16">
        <el-form-item label="所属门店" prop="shopId"
                      :rules="[{required: true, message: '请选择所属门店', trigger: ['blur', 'change']}]">
          <shop-selector v-model="form.shopId" :style="'width: 100%'" filter-status clearable
                         placeholder="请选择所属门店" :force-update="false"></shop-selector>
        </el-form-item>
<!--        <el-form-item label="所属房间" prop="roomId"
                      :rules="[{required: true, message: '请选择所属房间', trigger: ['blur', 'change']}]">
          <room-selector v-model="form.roomId" filter-status :style="'width: 100%'" clearable :shop-id="form.shopId" @selected="selectedRoom"
                         placeholder="请选择所属房间"></room-selector>
        </el-form-item>-->
        <el-form-item label="床位名称" prop="name"
                      :rules="[{required: true, message: '请输入床位名称', trigger: ['blur', 'change']}]">
          <el-input v-model="form.name" placeholder="请输入床位名称"></el-input>
        </el-form-item>
        <el-form-item label="床位序号" prop="serialNumber"
                      :rules="[{required: true, message: '请输入床位序号', trigger: ['blur', 'change']}]">
          <el-input v-model="form.serialNumber" placeholder="请输入床位序号"></el-input>
        </el-form-item>
        <el-form-item label="床位属性" prop="type"
                      :rules="[{required: true, message: '请选择床位属性', trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.type">
            <el-radio v-for="item in constant.bedType"
                      :key="item.value"
                      :label="item.value">{{ item.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="床位状态" prop="status"
                      :rules="[{required: true, message: '请选择床位状态', trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.status">
            <el-radio v-for="item in constant.shopStatus"
                      :key="item.value"
                      :label="item.value">{{ item.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose">取 消</el-button>
        <el-button type="primary" @click="onSubmit">确 定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import bedApi from "@/api/shop/bed"
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import RoomSelector from "@/views/shop/room/RoomSelector";

export default {
  name: 'BedForm',
  components: {RoomSelector, ShopSelector},
  props: {},
  data() {
    return {
      form: {},
      dialogVisible: false
    }
  },
  computed: {
    ...mapGetters(['shopId'])
  },
  created() {
  },
  methods: {
    open(form = {}) {
      if (!form.shopId){
        form.shopId = this.shopId
        form.status = 1
      }
      this.form = {...form}
      this.dialogVisible = true
    },
    handleClose() {
      this.dialogVisible = false
      this.form = {}
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      this.showFullLoading()
      await bedApi.saveOrUpd(this.form)
      this.handleClose()
      this.hideFullLoading()
      this.$notify.success("操作成功")
      this.$store.dispatch("setRoomList", true)
      this.$emit("submit-success")
    },
    selectedRoom(room) {
      if (room) {
        this.$set(this.form, 'shopId', room.shopId)
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.BedForm {
}
</style>
