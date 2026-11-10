<template>
  <div class="DiscountForm">
    <el-dialog
      :title="'配置折扣'"
      :visible.sync="dialogVisible"
      width="600px"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="100px" class="margin-lr-16">
        <el-form-item label="所属门店" prop="shopId"
                      :rules="[{required: true, message: '请选择所属门店', trigger: ['blur', 'change']}]">
          <shop-selector v-model="form.shopId" :style="'width: 100%'" filter-status clearable
                         placeholder="请选择所属门店"></shop-selector>
        </el-form-item>
        <el-form-item label="使用限制" prop="useType"
                      :rules="[{required: true, message: '请选择使用限制', trigger: ['blur', 'change']}]">
          <el-select v-model.number="form.useType" placeholder="请选择使用限制" style="width: 100%" filterable clearable>
            <el-option v-for="(item,index) in constant.discountUseType || []" :value="item.value"
                       :label="item.label" :key="item.value">
              <span>{{ item.value }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-radio-group v-model="form.type" size="mini" class="radio">
            <el-radio-button v-for="item in typeList" :key="item.value" :value="item.value" :label="item.value">
              <span>{{ item.label }}</span>
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.type == 1" label="折扣" prop="discount"
                      :rules="[{required: true, message: '请输入折扣(1-99折)', trigger: ['blur', 'change']},{pattern: /^([1-9]|[1-9][0-9])$/, message: '折扣必须在1到99之间', trigger: ['blur', 'change'] }]">
          <el-input-number v-model="form.discount" :min="1" :max="99" :step="1" style="width: 90%"
                           placeholder="请输入折扣(1-99折)" controls-position="right"></el-input-number>
          (折)
        </el-form-item>
        <el-form-item v-else label="折后金额" prop="discount"
                      :rules="[{required: true, message: '请输入金额', trigger: ['blur', 'change']}]">
          <el-input-number v-model="form.discount" :min="0.01" :step="1" :precision="2" style="width: 90%"
                           placeholder="请输入金额" controls-position="right"></el-input-number>
          (元)
        </el-form-item>
        <el-form-item v-if="form.type == 2" label="服务时长" prop="duration"
                      :rules="[{required: true, message: '请选择服务时长', trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.duration" size="mini" class="radio">
            <el-radio-button v-for="item in durationList" :key="item.value" :value="item.value" :label="item.value">
              <span>{{ item.label }}</span>
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="折扣期限" prop="startTime"
                      :rules="[{required: true, message: '请选择折扣期限', trigger: ['blur', 'change']}]">
          <el-date-picker
            v-model="dateRange" style="width: 100%"
            type="datetimerange" @change="dateRangeChange"
            :picker-options="pickerOptions"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="yyyy-MM-dd HH:mm:ss"
            align="right">
          </el-date-picker>
        </el-form-item>
        <el-form-item label="备注" prop="comment">
          <el-input
            type="textarea"
            :rows="3"
            :maxlength="500"
            show-word-limit
            placeholder="请输入使用备注"
            v-model="form.comment">
          </el-input>
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
import ShopSelector from "@/views/shop/shopList/ShopSelector";

export default {
  name: 'DiscountForm',
  components: {ShopSelector},
  props: {},
  data() {
    return {
      form: {type:1,},
      dialogVisible: false,
      dateRange: [],
      pickerOptions: {
        disabledDate(time) {
          return time.getTime() < Date.now() - 24 * 60 * 60 * 1000;
        },
        shortcuts: [{
          text: '持续一周',
          onClick(picker) {
            const start = new Date();
            const end = new Date();
            end.setTime(start.getTime() + 3600 * 1000 * 24 * 7);
            picker.$emit('pick', [start, end]);
          }
        }, {
          text: '持续一个月',
          onClick(picker) {
            const start = new Date();
            const end = new Date();
            end.setTime(start.getTime() + 3600 * 1000 * 24 * 30);
            picker.$emit('pick', [start, end]);
          }
        }, {
          text: '持续三个月',
          onClick(picker) {
            const start = new Date();
            const end = new Date();
            console.log(start);
            end.setTime(start.getTime() + 3600 * 1000 * 24 * 90);
            picker.$emit('pick', [start, end]);
          }
        }]
      },
      typeList: [{value: 1, label: '折扣比例'}, {value: 2, label: '固定金额'}],
      durationList: [
        {value: 30, label: '30分钟'},
        {value: 45, label: '45分钟'},
        {value: 60, label: '60分钟'},
        {value: 90, label: '90分钟'}
      ]
    }
  },
  computed: {
    ...mapGetters(['shopId'])
  },
  methods: {
    open(form = {}) {
      if (!form.shopId){
        form.shopId = this.shopId
      }
      if (form.id) {
        this.form = {...form}
      } else {
        this.form = {...form, type: 1}
      }
      if (this.form.startTime) {
        this.dateRange = [this.form.startTime, this.form.endTime]
      } else {
        this.dateRange = []
      }
      this.dialogVisible = true
    },
    handleClose() {
      this.dialogVisible = false
      this.form = {}
      this.dateRange = []
    },
    dateRangeChange(value) {
      if (value && value.length > 0) {
        this.$set(this.form, 'startTime', value[0])
        this.$set(this.form, 'endTime', value[1])
      } else {
        this.$set(this.form, 'startTime', null)
        this.$set(this.form, 'endTime', null)
      }
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false)
      if (!validate) {
        return
      }
      this.$emit("submit-success", this.form)
      this.handleClose()
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.DiscountForm {

  .radio {

    /deep/ .el-radio-button:not(:first-child) .el-radio-button__inner {
      border-left: 1px solid #DCDFE6 !important;
    }

    /deep/ .el-radio-button__inner {
      border-radius: 6px;
      color: #49454f;
    }

    /deep/ .el-radio-button + .is-active:not(:first-child) .el-radio-button__inner {
      border-left: 1px solid #e8def8 !important;
    }

    /deep/ .el-radio-button__orig-radio:disabled + .el-radio-button__inner {
      color: #c0c4cc;
      cursor: not-allowed;
      background-image: none;
      background-color: #fff;
      border-color: #ebeef5;
      box-shadow: none;
    }

    /deep/ .el-radio-button .el-radio-button__inner {
      margin-right: 6px;
      margin-bottom: 6px;
    }

    /deep/ .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background-color: #e8def8;
      border-color: #e8def8;
      box-shadow: -1px 0 0 0 #e8def8;
      color: #4a4459;

      &::before {
        content: "";
        display: inline-block;
        width: 10px;
        position: relative;
        height: 6px;
        top: -2px;
        border-left: 2px solid #4a4459;
        border-bottom: 2px solid #4a4459;
        transform: rotate(-45deg);
        margin-right: 5px;
      }
    }

    /deep/ .bg9d8bb6 .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background: linear-gradient(#9d8bb6, #f2d8de);
      border-color: #fff;
      box-shadow: -1px 0 0 0 #fff;
      color: #fff;

      &::before {
        content: "";
        display: inline-block;
        width: 10px;
        position: relative;
        height: 6px;
        top: -2px;
        border-left: 2px solid #fff;
        border-bottom: 2px solid #fff;
        transform: rotate(-45deg);
        margin-right: 5px;
      }
    }

    /deep/ .bgeeb046 .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background: linear-gradient(#eeb046, #faedc7);
      border-color: #fff;
      box-shadow: -1px 0 0 0 #fff;
      color: #fff;

      &::before {
        content: "";
        display: inline-block;
        width: 10px;
        position: relative;
        height: 6px;
        top: -2px;
        border-left: 2px solid #fff;
        border-bottom: 2px solid #fff;
        transform: rotate(-45deg);
        margin-right: 5px;
      }
    }

    /deep/ .bgb1d02a .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background: linear-gradient(#b1d02a, #e5efcb);
      border-color: #fff;
      box-shadow: -1px 0 0 0 #fff;
      color: #fff;

      &::before {
        content: "";
        display: inline-block;
        width: 10px;
        position: relative;
        height: 6px;
        top: -2px;
        border-left: 2px solid #fff;
        border-bottom: 2px solid #fff;
        transform: rotate(-45deg);
        margin-right: 5px;
      }
    }

    /deep/ .bg2a4824 .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background: linear-gradient(#2a4824, #5c411f);
      border-color: #fff;
      box-shadow: -1px 0 0 0 #fff;
      color: #fff;

      &::before {
        content: "";
        display: inline-block;
        width: 10px;
        position: relative;
        height: 6px;
        top: -2px;
        border-left: 2px solid #fff;
        border-bottom: 2px solid #fff;
        transform: rotate(-45deg);
        margin-right: 5px;
      }
    }

    /deep/ .bga6a6a6 .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background: linear-gradient(#a6a6a6, #ffffff);
      border-color: #fff;
      box-shadow: -1px 0 0 0 #fff;
      color: #fff;

      &::before {
        content: "";
        display: inline-block;
        width: 10px;
        position: relative;
        height: 6px;
        top: -2px;
        border-left: 2px solid #fff;
        border-bottom: 2px solid #fff;
        transform: rotate(-45deg);
        margin-right: 5px;
      }
    }
  }
}
</style>
