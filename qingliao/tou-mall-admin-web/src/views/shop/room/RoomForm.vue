<template>
  <div class="RoomForm">
    <el-dialog
      :title="form.id ? '配置房间':'新增房间'"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="80px" label-position="left" class="margin-lr-16">
        <el-form-item label="所属门店" prop="shopId"
                      :rules="[{required: true, message: '请选择所属门店', trigger: ['blur', 'change']}]">
          <shop-selector v-model="form.shopId" filter-status :style="'width: 100%'"
                         placeholder="请选择所属门店" :force-update="false"></shop-selector>
        </el-form-item>
        <el-form-item label="房间名称" prop="name"
                      :rules="[{required: true, message: '请输入房间名称', trigger: ['blur', 'change']}]">
          <el-input v-model="form.name" placeholder="请输入房间名称"></el-input>
        </el-form-item>
        <el-form-item label="房间序号" prop="serialNumber"
                      :rules="[{required: true, message: '请输入房间序号', trigger: ['blur', 'change']}]">
          <el-input v-model="form.serialNumber" placeholder="请输入房间序号"></el-input>
        </el-form-item>
        <el-form-item label="房间类型" prop="type"
                      :rules="[{required: true, message: '请选择房间类型', trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.type">
            <el-radio v-for="item in constant.roomType"
                      :key="item.value"
                      :label="item.value">{{ item.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="房间状态" prop="status"
                      :rules="[{required: true, message: '请选择房间状态', trigger: ['blur', 'change']}]">
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
import roomApi from "@/api/shop/room";
import ShopSelector from "@/views/shop/shopList/ShopSelector";

export default {
  name: 'RoomForm',
  components: {ShopSelector},
  props: {},
  data() {
    return {
      form: {},
      dialogVisible: false
    }
  },
  computed: {
    ...mapGetters([])
  },
  created() {
  },
  methods: {
    open(form = {}) {
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
      await roomApi.saveOrUpd(this.form)
      this.handleClose()
      this.$notify.success("操作成功")
      this.$store.dispatch("setRoomList",true)
      this.$emit("submit-success")
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.RoomForm {
}
</style>
