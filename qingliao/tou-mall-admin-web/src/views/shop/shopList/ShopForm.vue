<template>
  <div class="ShopForm">
    <el-dialog
      :title="form.id ? '编辑门店':'添加门店'"
      :visible.sync="dialogVisible"
      width="50%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="80px" label-position="left" class="margin-lr-16">
        <el-row :gutter="20">
          <el-col :span="12">
        <el-form-item label="门店名称" prop="name"
                      :rules="[{required: true, message: '请输入门店名称', trigger: ['blur', 'change']}]">
          <el-input v-model="form.name" placeholder="请输入门店名称" clearable ></el-input>
        </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系方式" prop="mobile"
                          :rules="[{required: true, message: '请输入联系方式', trigger: ['blur', 'change']}]">
              <el-input v-model="form.mobile" placeholder="请输入联系方式" clearable ></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="16">
            <el-form-item label="门店地址" prop="address"
                          :rules="[{required: true, message: '请输入门店地址', trigger: ['blur', 'change']}]">
              <el-input v-model="form.address" placeholder="请输入门店地址" clearable></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-button @click="getCoordinate()">点击我获取地址经纬度</el-button>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="门店纬度" prop="latitude"
                          :rules="[{required: true, message: '请输入门店纬度', trigger: ['blur', 'change']}]">
              <el-input readonly v-model.number="form.latitude" type="number" @input="handleInput($event,'latitude')"
                        placeholder="请输入最多7位小数"
                        class="input-width"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item  label="门店经度" prop="longitude"
                           :rules="[{required: true, message: '请输入门店经度', trigger: ['blur', 'change']}]">
              <el-input readonly v-model.number="form.longitude" type="number" @input="handleInput($event,'longitude')"
                        placeholder="请输入最多7位小数"
                        class="input-width"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="简要地址" prop="shortAddress"
                          :rules="[{required: true, message: '请输入简要地址', trigger: ['blur', 'change']}]">
              <el-input v-model="form.shortAddress" placeholder="请输入简要地址" clearable></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预约间隔" prop="intervalMinute"
                          :rules="[{required: true, message: '请输入预约间隔时间', trigger: ['blur', 'change']}]">
              <el-input-number v-model="form.intervalMinute" :min="1" :max="60" label="预约间隔时间（分钟）"
                               style="width: 90%;margin-right: 6px"></el-input-number>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="最早到店" prop="clockInTime"
                          :rules="[{required: true, message: '请输入最早到店时间', trigger: ['blur', 'change']}]">
              <el-time-select v-model="form.clockInTime" :picker-options="{start: '08:00',step: '00:30',end: '24:00'}"
                              placeholder="选择时间" style="width: 100%" clearable></el-time-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最晚到店" prop="clockOutTime"
                          :rules="[{required: true, message: '请输入最晚到店时间', trigger: ['blur', 'change']}]">
              <el-time-select v-model="form.clockOutTime" :picker-options="{start: '08:00',step: '00:30',end: '24:00'}"
                              placeholder="选择时间" style="width: 100%" clearable></el-time-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="接待工时上限" prop="receptionCapPercent">
              <el-input-number v-model="form.receptionCapPercent" :min="0" :max="100" :precision="0"
                               style="width: 90px;margin-right: 6px"></el-input-number>
              <span>% 排班在岗时长</span>
              <div class="form-tip">默认 20%，超出部分不计工时与计薪</div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20" :span="2" >
          <el-col :span="12">
            <el-form-item label="门店状态" prop="status"
                          :rules="[{required: true, message: '请选择门店状态', trigger: ['blur', 'change']}]">
              <el-radio-group v-model="form.status">
                <el-radio v-for="item in constant.shopStatus"
                          :key="item.value"
                          :label="item.value">{{ item.label }}
                </el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="是否推荐" prop="shopRecommend"
                          :rules="[{required: true, message: '请选择是否推荐', trigger: ['blur', 'change']}]">
              <el-radio-group v-model="form.shopRecommend">
                <el-radio v-for="item in constant.shopRecommend"
                          :key="item.value"
                          :label="item.value">{{ item.label }}
                </el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="商户号" prop="busSysId"
                          :rules="[{required: true, message: '请输入商户号', trigger: ['blur', 'change']}]">
              <el-input v-model="form.busSysId" placeholder="请输入商户号" clearable></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品号" prop="busProductId"
                          :rules="[{required: true, message: '请输入产品号', trigger: ['blur', 'change']}]">
              <el-input v-model="form.busProductId" placeholder="请输入产品号" clearable></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="公钥" prop="busPublicKey"
                          :rules="[{required: true, message: '请输入公钥', trigger: ['blur', 'change']}]">
              <el-input v-model="form.busPublicKey" placeholder="请输入公钥" clearable></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="私钥" prop="busPrivateKey"
                          :rules="[{required: true, message: '请输入私钥', trigger: ['blur', 'change']}]">
              <el-input v-model="form.busPrivateKey" placeholder="请输入私钥" clearable></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="设备编号" prop="printSn"
                          :rules="[{required: true, message: '请输入设备编号', trigger: ['blur', 'change']}]">
              <el-input v-model="form.printSn" placeholder="请输入设备编号" clearable></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备KEY" prop="printPkey"
                          :rules="[{required: true, message: '请输入设备KEY', trigger: ['blur', 'change']}]">
              <el-input v-model="form.printPkey" placeholder="请输入设备KEY" clearable></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="账号" prop="printName"  v-if="false"
                      :rules="[{required: true, message: '请输入账号', trigger: ['blur', 'change']}]">
          <el-input v-model="form.printName" placeholder="请输入账号" clearable></el-input>
        </el-form-item>
        <el-form-item label="小票备注" prop="printMarks"
                      :rules="[{required: true, message: '请输入小票备注', trigger: ['blur', 'change']}]">
          <el-input v-model="form.printMarks" placeholder="请输入小票备注" clearable></el-input>
        </el-form-item>
        <el-form-item label="店面图片" prop="coverImageUrls" label-width="70px">
          <el-image v-if="form.coverImageUrls"
                    style="width: 100px; height: 100px"
                    :src="form.coverImageUrls"
                    fit="fill"></el-image>
          <el-upload
            class="upload-demo"
            ref="refFile"
            action="/data"
            :limit="1"
            accept="image/*"
            :file-list="coverImageFile?[coverImageFile]:[]"
            :on-remove="handleRemove"
            :on-change="handleChange"
            :on-exceed="handleExceed"
            :auto-upload="false">
            <el-button slot="trigger" size="small" type="primary">选择图片</el-button>
          </el-upload>
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
import shopApi from '@/api/shop/shop';
import SingleUpload from '@/components/Upload/singleUpload';
import {generatePreSignedUrl, uploadFile} from '@/api/oss'

export default {
  name: 'ShopForm',
  components: {SingleUpload},
  props: {},
  data() {
    return {
      form: {},
      dialogVisible: false,
      coverImageFile: null,
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
      if (!form.id) {
        this.$set(this.form, 'clockInTime', '10:00')
        this.$set(this.form, 'clockOutTime', '22:00')
        this.$set(this.form, 'intervalMinute', 15)
        this.$set(this.form, 'status', 1)
      }
      if (this.form.receptionCapPercent == null) {
        this.$set(this.form, 'receptionCapPercent', 20)
      }
      this.dialogVisible = true
    },
    handleRemove() {
      this.coverImageFile = null
    },
    handleChange(file, fileList) {
      this.coverImageFile = file
    },
    handleExceed(files, fileList) {
      this.$message.warning(`只能选择 1 个文件`);
    },
    handleClose() {
      this.dialogVisible = false
      this.coverImageFile = null
      this.form = {}
    },
    handleInput(value, propName) {
      console.log(value, propName)
      this.form[propName] = value.replace(/[^\d.]/g, '')
        .replace(/^(\d{3})\d+/, '$1')
        .replace(/\.(\d{7}).*$/, '.$1')
        .replace(/^\./, '0.')
        .replace(/(\..*)\./g, '$1');
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      this.showFullLoading()
      if (this.coverImageFile) {
        let res = await generatePreSignedUrl(this.coverImageFile.name, 'shop');
        console.log(res)
        let {url, expireTime, key} = res.data
        this.form.coverImageUrls = key
        await uploadFile(url, this.coverImageFile.raw)
      }
      await shopApi.saveOrUpd(this.form)
      this.handleClose()
      this.hideFullLoading()
      this.$notify.success('操作成功')
      this.$emit('submit-success')
      this.$store.dispatch('setShopList', true)
    },
    getCoordinate() {//获取地址坐标
      var that = this
      console.log(this.form.address);
      const geocoder = new qq.maps.Geocoder({
        complete: (result) => {
          console.log(result);
          if (result.type === "GEO_INFO") { // 状态码为0表示成功
            that.$set(that.form,'latitude', result.detail.location.lat);
            that.$set(that.form,'longitude', result.detail.location.lng);
            console.log(that.form.latitude);
          } else {
            this.$message.warning(`无法获取坐标!`);
            // this.$notify.info('!');
          }
        },
        error: (e) => {
          this.$message.warning(`请输入正规的地址信息!`);
          // this.$notify.info('!');
        }
      });
      geocoder.getLocation(this.form.address); // 使用地址进行地理编码查询
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ShopForm {
  .form-tip {
    color: #909399;
    font-size: 12px;
    line-height: 18px;
    margin-top: 2px;
  }
}
</style>
