<template>
  <el-dialog title="精油和部位" :visible.sync="dialogVisible" width="800px" modal-append-to-body
             append-to-body :close-on-click-modal="false">
    <div class="OrderLabelDialog">
      <el-form :model="form" label-width="80px" label-position="left" class="margin-lr-16">
        <el-form-item label="精油" prop="oil">
          <el-radio-group v-model="form.oil" size="mini" class="radio" ><!--style="width: 300px"-->
            <el-radio-button v-for="item in oilList" :class="getClass(item)"
                             :key="item" :label="item">
              {{ item }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="部位" prop="parts">
          <el-checkbox-group class="group" v-model="form.parts">
            <el-checkbox-button v-for="item in partsList" :label="item" :key="item">
              {{ item }}
            </el-checkbox-button>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer" style="float: right">
        <el-button class="btn-B m-r-10" @click="dialogVisible = false">取 消</el-button>
        <el-button type="primary" @click="onSubmit" class="btn-A">确 定</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import orderApi from "../../api/order/order"

export default {
  name: 'OrderLabelDialog',
  components: {},
  props: {},
  data() {
    return {
      dialogVisible: false,
      form: {},
      oilList: ['花', '柚', '竺', '森', '无','花*','果*','草*','木*','茶*'],
      partsList: ['头', '肩', '眼', '脸', '手', '腿', '耳']
    }
  },
  methods: {
    open(form) {
      this.dialogVisible = true
      this.form = {...form}
    },
    async onSubmit() {
      this.showFullLoading()
      await orderApi.addLabel(this.form)
      this.hideFullLoading()
      this.dialogVisible = false
      this.$emit('submit-success', this.form)
      this.notifySuccess()
    },
    getClass(item) {
      let bgClass = ''
      if (item == '花') {
        bgClass = 'bg9d8bb6'
      } else if (item == '柚') {
        bgClass = 'bgeeb046'
      } else if (item == '竺') {
        bgClass = 'bgb1d02a'
      } else if (item == '森') {
        bgClass = 'bg2a4824'
      } else if (item == '无') {
        bgClass = 'bga6a6a6'
      }else if (item == '花*') {
        bgClass = 'bgf2d8de'
      }else if (item == '果*') {
        bgClass = 'bgfaedc7'
      }else if (item == '草*') {
        bgClass = 'bge5efcb'
      }else if (item == '木*') {
        bgClass = 'bg5c411f'
      }else if (item == '茶*') {
        bgClass = 'bg6C8149'
      }
      return bgClass
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.OrderLabelDialog {
  padding-bottom: 20px;

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


    /deep/ .bgf2d8de .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background: linear-gradient(#f2d8de, #9d8bb6);
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

    /deep/ .bgfaedc7 .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background: linear-gradient(#faedc7, #eeb046);
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

    /deep/ .bge5efcb .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background: linear-gradient(#e5efcb, #b1d02a);
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

    /deep/ .bg5c411f .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background: linear-gradient(#5c411f, #2a4824);
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

    /deep/ .bg6C8149 .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background: linear-gradient(#6C8149, #D3D3D3);
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

  .group {
    /deep/ .el-checkbox-button:not(:first-child) .el-checkbox-button__inner {
      border-left: 1px solid #DCDFE6 !important;
    }

    /deep/ .el-checkbox-button__inner {
      border-radius: 6px;
      color: #49454f;
      padding: 8px 15px;
      position: relative;
    }

    /deep/ .el-checkbox-button.is-checked:not(:first-child) .el-checkbox-button__inner {
      border-left: 1px solid #e8def8 !important;
    }

    /deep/ .el-checkbox-button.is-disabled .el-checkbox-button__inner {
      color: #c0c4cc;
      cursor: not-allowed;
      background-image: none;
      background-color: #fff;
      border-color: #ebeef5;
      box-shadow: none;
    }

    /deep/ .el-checkbox-button .el-checkbox-button__inner {
      margin-right: 6px;
      margin-bottom: 6px;
    }

    /deep/ .el-checkbox-button.is-checked .el-checkbox-button__inner {
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

    /deep/ .el-checkbox-button .el-checkbox__input {
      display: none;
    }

    /deep/ .el-checkbox-button.is-checked .el-checkbox-button__inner {
      color: #4a4459 !important;
    }

    /deep/ .el-checkbox-button.is-focus .el-checkbox-button__inner {
      border-color: #DCDFE6;
    }
  }

  .btn-A {
    background-color: #6750a4;
    color: #FFFFFF;
    border: 1px solid #6750a4;
    border-radius: 16px;
    margin-left: 0;
    margin-bottom: 10px;
  }

  .btn-B {
    background-color: #FFFFFF;
    border: 1px solid #d7d3db;
    color: #54515a;
    border-radius: 16px;
    margin-left: 0;
    margin-bottom: 10px;
  }
}
</style>
