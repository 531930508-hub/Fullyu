<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">场地管理</h2>
      <a-space>
        <a-select v-model:value="selectedVenue" style="width: 180px" @change="loadReservations">
          <a-select-option v-for="v in venues" :key="v.id" :value="v.id">{{ v.city || '上海' }} · {{ v.name }}（{{ v.capacity }}人）</a-select-option>
        </a-select>
        <a-date-picker v-model:value="selectedDate" @change="loadReservations" />
        <a-button v-perm="'venue:create'" type="primary" @click="openBooking">+ 手动预约</a-button>
        <a-button @click="openContracts">合同管理</a-button>
        <a-button @click="openLogs">操作日志</a-button>
        <a-button v-perm="'venue:update'" @click="showQrSettingsModal = true">收款码设置</a-button>
        <a-button v-perm="'venue:update'" @click="showVenueSettingsModal = true">场地设置</a-button>
      </a-space>
    </div>

    <!-- 场地概览 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="8"><a-card><a-statistic title="当日预约数" :value="reservations.length" suffix="条" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="当日占用时段" :value="todayOccupied" suffix="/ 28 段" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="当日空闲时段" :value="28 - todayOccupied" :value-style="{ color: '#27AE60' }" suffix="段" /></a-card></a-col>
    </a-row>

    <!-- 时段表格（半小时为单位） -->
    <a-card :title="(currentVenue?.name || '场地') + ' - ' + selectedDate.format('YYYY-MM-DD') + ' 日程'" :loading="loading">
      <div class="timeslot-grid">
        <div v-for="slot in timeSlots" :key="slot.time" class="timeslot-row" :class="slotRowClass(slot)">
          <div class="timeslot-time">{{ slot.time }}</div>
          <div class="timeslot-content" v-if="slot.occupied">
            <div class="slot-info">
              <a-tag v-if="slot.isCourse" color="#6B463C" size="small">课程</a-tag>
              <a-tag v-else-if="slot.useType === 'INTERNAL'" color="#8B7355" size="small">内部</a-tag>
              <a-tag v-else-if="slot.contractStatus === 'INTENT'" size="small" :style="{ background: '#FEF3C7', color: '#B45309', border: '1px dashed #F59E0B' }">意向</a-tag>
              <a-tag v-else color="orange" size="small">已签约</a-tag>
              <span class="slot-title">{{ slot.title }}</span>
            </div>
            <div class="slot-contact">
              <span>{{ slot.bookedBy }}</span>
              <a-button v-perm="'venue:update'" v-if="!slot.isCourse && slot.useType === 'RENTAL'" type="link" size="small" @click="editRentalReservation(slot)">编辑</a-button>
              <a-button v-perm="'venue:update'" type="link" size="small" danger @click="confirmDeleteReservation(slot)">取消</a-button>
            </div>
          </div>
          <div class="timeslot-content empty" v-else>
            <span style="color: #ccc;">空闲</span>
            <a-button v-perm="'venue:create'" type="link" size="small" @click="quickBook(slot.time)">预约</a-button>
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 12px; margin-top: 12px; font-size: 12px; color: #666; flex-wrap: wrap;">
        <span><span class="legend-dot" style="background:#6B463C;"></span>课程</span>
        <span><span class="legend-dot" style="background:#F39C12;"></span>已签约租赁</span>
        <span><span class="legend-dot" style="background:#FEF3C7; border:1px dashed #F59E0B;"></span>意向沟通中</span>
        <span><span class="legend-dot" style="background:#8B7355;"></span>内部使用</span>
      </div>
    </a-card>

    <!-- 手动预约弹窗 -->
    <a-modal v-model:open="showBookingModal" :title="bookingEditId ? '编辑场地预约' : '手动预约场地'" width="640px" :confirm-loading="booking" @ok="confirmBooking">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="场地" required>
              <a-select v-model:value="bookingForm.venueId" placeholder="选择场地" :disabled="!!bookingEditId">
                <a-select-option v-for="v in venues" :key="v.id" :value="v.id">{{ v.name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="日期" required>
              <a-date-picker v-model:value="bookingForm.date" style="width: 100%" :disabled="!!bookingEditId" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="开始时间" required>
              <a-select v-model:value="bookingForm.startTime" placeholder="选择开始" :disabled="!!bookingEditId">
                <a-select-option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="结束时间" required>
              <a-select v-model:value="bookingForm.endTime" placeholder="选择结束" :disabled="!!bookingEditId">
                <a-select-option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="使用类型" required>
          <a-radio-group v-model:value="bookingForm.useType">
            <a-radio-button value="RENTAL">租赁</a-radio-button>
            <a-radio-button value="INTERNAL">内部使用</a-radio-button>
          </a-radio-group>
        </a-form-item>

        <template v-if="bookingForm.useType === 'RENTAL'">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="合同状态">
                <a-select v-model:value="bookingForm.contractStatus">
                  <a-select-option value="INTENT">意向沟通中</a-select-option>
                  <a-select-option value="SIGNED">已签约</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="我方销售">
                <a-select v-model:value="bookingForm.salesId" show-search :filter-option="filterOption" @change="onSalesChange">
                  <a-select-option v-for="a in adminOptions" :key="a.value" :value="a.value" :label="a.label">{{ a.label }}</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="应收总额（元）">
                <a-input-number v-model:value="bookingForm.totalAmountYuan" :min="0" :precision="2" style="width: 100%" placeholder="选填" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="预约人">
                <a-input v-model:value="bookingForm.bookedBy" placeholder="客户/联系方式" />
              </a-form-item>
            </a-col>
          </a-row>
        </template>
        <template v-else>
          <a-form-item label="使用人/负责人">
            <a-input v-model:value="bookingForm.bookedBy" placeholder="内部使用登记人" />
          </a-form-item>
        </template>
        <a-form-item label="备注">
          <a-textarea v-model:value="bookingForm.notes" :rows="2" placeholder="用途/特殊要求等" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 场地设置弹窗 -->
    <a-modal v-model:open="showVenueSettingsModal" title="场地设置" width="720px" :footer="null">
      <a-table :columns="venueSettingCols" :data-source="filteredVenueSettings" :pagination="false" size="small" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'action'">
            <a-button v-perm="'venue:update'" type="link" size="small" @click="editVenue(record)">编辑</a-button>
            <a-popconfirm v-perm="'venue:delete'" title="确认删除该场地？" @confirm="deleteVenue(record.id)">
              <a-button type="link" size="small" danger>删除</a-button>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
      <div style="display: flex; gap: 12px; margin-top: 12px;">
        <a-select v-model:value="venueCityFilter" style="width: 180px" allow-clear placeholder="按城市筛选">
          <a-select-option v-for="city in cityOptions" :key="city" :value="city">{{ city }}</a-select-option>
        </a-select>
        <a-button v-perm="'venue:create'" type="dashed" style="flex: 1" @click="addVenue">+ 添加场地</a-button>
      </div>
    </a-modal>

    <!-- 编辑场地弹窗 -->
    <a-modal v-model:open="showEditVenueModal" :title="editingVenue ? '编辑场地' : '添加场地'" :confirm-loading="savingVenue" @ok="saveVenue">
      <a-form layout="vertical">
        <a-form-item label="场地名称" required><a-input v-model:value="venueForm.name" placeholder="如：冥想室 A" /></a-form-item>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="城市" required>
              <a-auto-complete
                v-model:value="venueForm.city"
                :options="citySelectOptions"
                :filter-option="filterCityOption"
                placeholder="选择或输入城市"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
          <a-col :span="8"><a-form-item label="容量"><a-input-number v-model:value="venueForm.capacity" :min="1" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="8"><a-form-item label="地址"><a-input v-model:value="venueForm.address" placeholder="场地地址" /></a-form-item></a-col>
        </a-row>
        <a-form-item label="描述"><a-textarea v-model:value="venueForm.description" :rows="2" placeholder="场地设备/特点等" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 操作日志弹窗 -->
    <a-modal v-model:open="showLogsModal" title="场地预约操作日志" width="960px" :footer="null">
      <div style="margin-bottom: 12px; display: flex; gap: 8px; align-items: center;">
        <a-select v-model:value="logsVenueFilter" style="width: 220px" placeholder="全部场地" allow-clear @change="loadLogs">
          <a-select-option v-for="v in venues" :key="v.id" :value="v.id">{{ v.name }}</a-select-option>
        </a-select>
        <a-button size="small" @click="loadLogs">刷新</a-button>
        <span style="color:#999; font-size:12px;">默认展示最新 200 条</span>
      </div>
      <a-table :columns="logColumns" :data-source="logs" :pagination="{ pageSize: 10 }" size="small" row-key="id" :loading="logsLoading">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'action'">
            <a-tag :color="actionColor(record.action)">{{ actionLabel(record.action) }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'when'">
            {{ record.date ? new Date(record.date).toLocaleDateString('zh-CN') : '—' }}<br />
            <span style="color:#999;">{{ record.startTime || '' }}—{{ record.endTime || '' }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'createdAt'">
            {{ new Date(record.createdAt).toLocaleString('zh-CN') }}
          </template>
          <template v-else-if="column.dataIndex === 'operator'">
            {{ record.operatorName || record.operatorId || (record.source === 'SYSTEM' ? '系统' : '—') }}
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 合同管理弹窗 -->
    <a-modal v-model:open="showContractsModal" title="合同管理" width="1080px" :footer="null">
      <div style="margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <a-radio-group v-model:value="contractFilter" @change="loadContracts">
          <a-radio-button value="">全部租赁</a-radio-button>
          <a-radio-button value="INTENT">意向沟通中</a-radio-button>
          <a-radio-button value="SIGNED">已签约</a-radio-button>
        </a-radio-group>
        <a-input v-model:value="contractKeyword" placeholder="搜索客户/销售/事项" style="width: 240px" allow-clear @press-enter="loadContracts" />
        <a-button size="small" @click="loadContracts">查询</a-button>
      </div>
      <a-table :columns="contractCols" :data-source="contracts" :pagination="{ pageSize: 8 }" size="small" row-key="id" :loading="contractsLoading" :scroll="{ x: 'max-content' }">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'contractStatus'">
            <a-tag v-if="record.contractStatus === 'SIGNED'" color="orange">已签约</a-tag>
            <a-tag v-else :style="{ background: '#FEF3C7', color: '#B45309', border: '1px dashed #F59E0B' }">意向沟通中</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'time'">
            {{ new Date(record.date).toLocaleDateString('zh-CN') }} {{ record.startTime }}—{{ record.endTime }}
          </template>
          <template v-else-if="column.dataIndex === 'venueName'">
            {{ record.venue?.name || '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'amount'">
            <div>应收：¥{{ toYuan(record.totalAmount) }}</div>
            <div style="color: #27AE60; font-size: 12px;">已收：¥{{ toYuan(record.paidAmount) }}</div>
          </template>
          <template v-else-if="column.dataIndex === 'waited'">
            <span v-if="record.contractStatus === 'INTENT'" style="color: #B45309;">{{ waitedText(record.createdAt) }}</span>
            <span v-else style="color: #999;">—</span>
          </template>
          <template v-else-if="column.dataIndex === 'contract'">
            <a v-if="record.contractUrl" :href="record.contractUrl" target="_blank">{{ record.contractName || '查看合同' }}</a>
            <span v-else style="color: #999;">未上传</span>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-space>
              <a-upload :show-upload-list="false" :before-upload="(f: File) => beforeContractUpload(f, record)" :accept="'.pdf,.doc,.docx,image/*'">
                <a-button v-perm="'venue:update'" type="link" size="small" :loading="contractUploadingId === record.id">上传合同</a-button>
              </a-upload>
              <a-button v-perm="'venue:update'" type="link" size="small" @click="openPayment(record)">收款</a-button>
              <a-button v-perm="'venue:update'" type="link" size="small" @click="editRentalReservation(record)">编辑</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 收款弹窗 -->
    <a-modal v-model:open="showPaymentModal" :title="'收款 - ' + (paymentTarget?.eventName || '')" width="640px" :footer="null">
      <div v-if="paymentTarget" style="margin-bottom: 12px; color: #666; font-size: 13px;">
        <div>时段：{{ new Date(paymentTarget.date).toLocaleDateString('zh-CN') }} {{ paymentTarget.startTime }}—{{ paymentTarget.endTime }}</div>
        <div>应收总额：¥{{ toYuan(paymentTarget.totalAmount) }} · 已收：¥{{ toYuan(paymentTarget.paidAmount) }}</div>
      </div>
      <a-tabs v-model:activeKey="paymentTab">
        <a-tab-pane key="OFFLINE_TRANSFER" tab="线下转账">
          <a-form layout="vertical" style="margin-top: 8px;">
            <a-form-item label="金额（元）" required>
              <a-input-number v-model:value="offlineForm.amountYuan" :min="0" :precision="2" style="width: 100%" />
            </a-form-item>
            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item label="对方转账时间">
                  <a-date-picker v-model:value="offlineForm.transferAt" show-time style="width: 100%" />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="交易对手">
                  <a-input v-model:value="offlineForm.counterparty" placeholder="对方姓名/公司" />
                </a-form-item>
              </a-col>
            </a-row>
            <a-form-item label="备注">
              <a-textarea v-model:value="offlineForm.remark" :rows="2" />
            </a-form-item>
            <a-button type="primary" block :loading="submittingPayment" @click="submitOffline">确认已到账</a-button>
          </a-form>
        </a-tab-pane>
        <a-tab-pane key="QR_CODE" tab="二维码收款">
          <div v-if="!qrConfig.alipay && !qrConfig.wechat" style="padding: 24px; text-align: center; color: #999;">
            尚未配置收款码，请先在【收款码设置】里上传收款码图片
          </div>
          <div v-else style="margin-top: 8px;">
            <a-form layout="vertical">
              <a-form-item label="金额（元）" required>
                <a-input-number v-model:value="qrForm.amountYuan" :min="0" :precision="2" style="width: 100%" />
              </a-form-item>
              <a-form-item label="备注">
                <a-input v-model:value="qrForm.remark" />
              </a-form-item>
            </a-form>
            <a-radio-group v-model:value="qrForm.channel" button-style="solid" style="display: flex; justify-content: center; margin-bottom: 12px;">
              <a-radio-button value="WECHAT" :disabled="!qrConfig.wechat">微信收款</a-radio-button>
              <a-radio-button value="ALIPAY" :disabled="!qrConfig.alipay">支付宝收款</a-radio-button>
            </a-radio-group>
            <div style="text-align: center;">
              <img v-if="qrForm.channel === 'WECHAT' && qrConfig.wechat" :src="qrConfig.wechat" style="max-width: 280px; max-height: 280px; border: 1px solid #eee; padding: 8px; border-radius: 8px;" />
              <img v-else-if="qrForm.channel === 'ALIPAY' && qrConfig.alipay" :src="qrConfig.alipay" style="max-width: 280px; max-height: 280px; border: 1px solid #eee; padding: 8px; border-radius: 8px;" />
            </div>
            <div style="text-align: center; margin-top: 12px; color: #999; font-size: 12px;">请让客户扫码支付，支付成功后点击"确认到账"</div>
            <a-space style="width: 100%; justify-content: center; margin-top: 12px;">
              <a-button type="primary" :loading="submittingPayment" @click="submitQrConfirm">确认到账</a-button>
              <a-button @click="submitQrPending">仅创建待确认流水</a-button>
            </a-space>
          </div>
        </a-tab-pane>
        <a-tab-pane key="HISTORY" tab="收款记录">
          <a-table :columns="paymentCols" :data-source="paymentHistory" size="small" :pagination="{ pageSize: 5 }" row-key="id" :loading="loadingHistory">
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'method'">
                <a-tag v-if="record.method === 'QR_CODE'" color="green">扫码</a-tag>
                <a-tag v-else color="blue">线下转账</a-tag>
                <a-tag v-if="record.qrChannel === 'ALIPAY'" size="small">支付宝</a-tag>
                <a-tag v-else-if="record.qrChannel === 'WECHAT'" size="small">微信</a-tag>
              </template>
              <template v-else-if="column.dataIndex === 'amount'">¥{{ toYuan(record.amount) }}</template>
              <template v-else-if="column.dataIndex === 'status'">
                <a-tag v-if="record.status === 'CONFIRMED'" color="green">已到账</a-tag>
                <a-tag v-else-if="record.status === 'PENDING'" color="orange">待确认</a-tag>
                <a-tag v-else color="default">已取消</a-tag>
              </template>
              <template v-else-if="column.dataIndex === 'action'">
                <a-space v-if="record.status === 'PENDING'">
                  <a-button v-perm="'venue:update'" type="link" size="small" @click="confirmOnePayment(record.id, 'CONFIRMED')">确认到账</a-button>
                  <a-button v-perm="'venue:update'" type="link" size="small" danger @click="confirmOnePayment(record.id, 'CANCELLED')">取消</a-button>
                </a-space>
              </template>
              <template v-else-if="column.dataIndex === 'createdAt'">
                {{ new Date(record.createdAt).toLocaleString('zh-CN') }}
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-modal>

    <!-- 收款码设置弹窗 -->
    <a-modal v-model:open="showQrSettingsModal" title="收款码设置" width="640px" :footer="null">
      <p style="color: #666; font-size: 13px;">上传微信/支付宝收款码图片。客户扫码后手动确认到账。</p>
      <a-row :gutter="16">
        <a-col :span="12">
          <div style="text-align: center;">
            <div style="font-weight: 600; margin-bottom: 8px;">微信收款码</div>
            <img v-if="qrConfig.wechat" :src="qrConfig.wechat" style="max-width: 200px; max-height: 200px; border: 1px solid #eee; padding: 8px; border-radius: 8px;" />
            <div v-else style="width: 200px; height: 200px; margin: 0 auto; border: 1px dashed #ccc; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #999;">未上传</div>
            <a-upload :show-upload-list="false" :before-upload="(f: File) => beforeQrUpload(f, 'WECHAT')" accept="image/*">
              <a-button type="link" :loading="qrUploading === 'WECHAT'">{{ qrConfig.wechat ? '更换' : '上传' }}</a-button>
            </a-upload>
            <a-button v-if="qrConfig.wechat" type="link" danger @click="clearQr('WECHAT')">清除</a-button>
          </div>
        </a-col>
        <a-col :span="12">
          <div style="text-align: center;">
            <div style="font-weight: 600; margin-bottom: 8px;">支付宝收款码</div>
            <img v-if="qrConfig.alipay" :src="qrConfig.alipay" style="max-width: 200px; max-height: 200px; border: 1px solid #eee; padding: 8px; border-radius: 8px;" />
            <div v-else style="width: 200px; height: 200px; margin: 0 auto; border: 1px dashed #ccc; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #999;">未上传</div>
            <a-upload :show-upload-list="false" :before-upload="(f: File) => beforeQrUpload(f, 'ALIPAY')" accept="image/*">
              <a-button type="link" :loading="qrUploading === 'ALIPAY'">{{ qrConfig.alipay ? '更换' : '上传' }}</a-button>
            </a-upload>
            <a-button v-if="qrConfig.alipay" type="link" danger @click="clearQr('ALIPAY')">清除</a-button>
          </div>
        </a-col>
      </a-row>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, createVNode } from 'vue'
import dayjs, { Dayjs } from 'dayjs'
import { message, Modal } from 'ant-design-vue'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import {
  listVenues, createVenue, updateVenue, removeVenue,
  listReservations, createReservation, updateReservation, removeReservation, listReservationLogs,
  listContractReservations, uploadReservationContract,
  listPayments, createPayment, confirmPayment,
  getPaymentQrConfig, setPaymentQrConfig,
} from '@/api/venue'
import { listAdmins } from '@/api/rbac'
import { uploadFile } from '@/api/upload'

const selectedDate = ref<Dayjs>(dayjs())
const selectedVenue = ref('')
const loading = ref(false)
const showBookingModal = ref(false)
const showVenueSettingsModal = ref(false)
const showEditVenueModal = ref(false)
const showContractsModal = ref(false)
const showPaymentModal = ref(false)
const showQrSettingsModal = ref(false)
const editingVenue = ref<any>(null)
const booking = ref(false)
const savingVenue = ref(false)

const venues = ref<any[]>([])
const reservations = ref<any[]>([])
const adminOptions = ref<{ label: string; value: string; name: string }[]>([])

// 城市是场地的管理维度：常见城市可直接选择，也允许输入新的城市。
const CITY_PRESETS = ['上海', '北京', '杭州', '苏州', '南京', '成都', '广州', '深圳', '武汉', '西安', '重庆', '厦门', '长沙', '青岛', '昆明', '大理', '三亚']
const venueCityFilter = ref<string | undefined>(undefined)
const cityOptions = computed(() => {
  const existing = venues.value.map(v => String(v.city || '上海').trim()).filter(Boolean)
  return Array.from(new Set([...CITY_PRESETS, ...existing]))
})
const citySelectOptions = computed(() => cityOptions.value.map(city => ({ value: city })))
const filteredVenueSettings = computed(() => venueCityFilter.value
  ? venues.value.filter(v => String(v.city || '上海').trim() === venueCityFilter.value)
  : venues.value)
function filterCityOption(input: string, option: any) {
  return String(option?.value || '').includes(input)
}

const currentVenue = computed(() => venues.value.find(v => v.id === selectedVenue.value))

// 半小时时段 08:00 - 22:00
const timeOptions = Array.from({ length: 29 }, (_, i) => {
  const h = Math.floor(i / 2) + 8
  const m = i % 2 === 0 ? '00' : '30'
  return `${h.toString().padStart(2, '0')}:${m}`
})

const timeSlots = computed(() => {
  const slots: any[] = []
  for (let i = 0; i < 28; i++) {
    const h = Math.floor(i / 2) + 8
    const m = i % 2 === 0 ? '00' : '30'
    const time = `${h.toString().padStart(2, '0')}:${m}`
    const r = reservations.value.find(s => s.startTime <= time && s.endTime > time)
    if (r) {
      const isCourse = !!r.courseId
      slots.push({
        time,
        occupied: true,
        title: isCourse ? (r.course?.title || r.eventName || '课程') : (r.eventName || r.note || '场地预约'),
        bookedBy: isCourse ? '课程占用' : (r.useType === 'RENTAL' ? (r.salesName ? `销售：${r.salesName}` : (r.contactName || '—')) : (r.contactName || '—')),
        reservationId: r.id,
        isCourse,
        useType: r.useType || 'RENTAL',
        contractStatus: r.contractStatus || null,
        salesId: r.salesId || null,
        salesName: r.salesName || null,
        totalAmount: r.totalAmount ?? null,
        paidAmount: r.paidAmount ?? 0,
        contactName: r.contactName || '',
        note: r.note || '',
        createdAt: r.createdAt,
        courseId: r.courseId || '',
        courseTitle: r.course?.title || '',
        startTime: r.startTime,
        endTime: r.endTime,
        date: r.date,
        eventName: r.eventName || '',
      })
    } else {
      slots.push({ time, occupied: false })
    }
  }
  return slots
})

const todayOccupied = computed(() => timeSlots.value.filter(s => s.occupied).length)

function slotRowClass(slot: any) {
  if (!slot.occupied) return {}
  return {
    occupied: true,
    'row-course': slot.isCourse,
    'row-internal': !slot.isCourse && slot.useType === 'INTERNAL',
    'row-intent': !slot.isCourse && slot.useType === 'RENTAL' && slot.contractStatus === 'INTENT',
    'row-signed': !slot.isCourse && slot.useType === 'RENTAL' && slot.contractStatus === 'SIGNED',
  }
}

const venueSettingCols = [
  { title: '名称', dataIndex: 'name' },
  { title: '城市', dataIndex: 'city', width: 100 },
  { title: '容量', dataIndex: 'capacity', width: 80 },
  { title: '地址', dataIndex: 'address' },
  { title: '描述', dataIndex: 'description' },
  { title: '操作', dataIndex: 'action', width: 130 },
]

const bookingEditId = ref('')
const bookingForm = ref<any>({
  venueId: '', date: null as Dayjs | null, startTime: '', endTime: '',
  useType: 'RENTAL', contractStatus: 'INTENT',
  salesId: '', salesName: '',
  totalAmountYuan: null as number | null,
  bookedBy: '', notes: '',
})
const venueForm = ref({ name: '', city: '上海', capacity: 8, address: '', description: '' })

async function loadVenues() {
  try {
    const data: any = await listVenues()
    venues.value = Array.isArray(data) ? data : []
    if (!selectedVenue.value && venues.value.length) {
      selectedVenue.value = venues.value[0].id
    }
    await loadReservations()
  } catch (e: any) {
    message.error(e?.message || '加载场地列表失败')
  }
}

async function loadAdmins() {
  try {
    const data: any = await listAdmins()
    const list = Array.isArray(data) ? data : (data?.list || [])
    adminOptions.value = list.map((a: any) => ({
      value: a.id,
      name: a.name || a.username,
      label: `${a.name || a.username}（${a.username}）`,
    }))
  } catch { /* ignore */ }
}

async function loadReservations() {
  if (!selectedVenue.value) { reservations.value = []; return }
  loading.value = true
  try {
    const data: any = await listReservations({ venueId: selectedVenue.value, date: selectedDate.value.format('YYYY-MM-DD') })
    reservations.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    message.error(e?.message || '加载预约失败')
  } finally {
    loading.value = false
  }
}

function currentAdminId() {
  return localStorage.getItem('admin_id') || ''
}
function currentAdminName() {
  return localStorage.getItem('admin_name') || ''
}

function openBooking() {
  bookingEditId.value = ''
  bookingForm.value = {
    venueId: selectedVenue.value, date: selectedDate.value,
    startTime: '', endTime: '',
    useType: 'RENTAL', contractStatus: 'INTENT',
    salesId: currentAdminId(), salesName: currentAdminName(),
    totalAmountYuan: null, bookedBy: '', notes: '',
  }
  showBookingModal.value = true
}

function quickBook(time: string) {
  bookingEditId.value = ''
  bookingForm.value = {
    venueId: selectedVenue.value, date: selectedDate.value,
    startTime: time, endTime: '',
    useType: 'RENTAL', contractStatus: 'INTENT',
    salesId: currentAdminId(), salesName: currentAdminName(),
    totalAmountYuan: null, bookedBy: '', notes: '',
  }
  showBookingModal.value = true
}

function editRentalReservation(rec: any) {
  bookingEditId.value = rec.reservationId || rec.id
  bookingForm.value = {
    venueId: rec.venueId || selectedVenue.value,
    date: dayjs(rec.date),
    startTime: rec.startTime, endTime: rec.endTime,
    useType: rec.useType || 'RENTAL',
    contractStatus: rec.contractStatus || 'INTENT',
    salesId: rec.salesId || '',
    salesName: rec.salesName || '',
    totalAmountYuan: rec.totalAmount != null ? rec.totalAmount / 100 : null,
    bookedBy: rec.contactName || rec.bookedBy || '',
    notes: rec.note || rec.notes || '',
  }
  showBookingModal.value = true
}

function onSalesChange(val: string) {
  const found = adminOptions.value.find(a => a.value === val)
  bookingForm.value.salesName = found?.name || ''
}
function filterOption(input: string, option: any) {
  return (option?.label || '').toLowerCase().includes(input.toLowerCase())
}

async function confirmBooking() {
  const f = bookingForm.value
  if (!f.venueId) { message.warning('请选择场地'); return }
  if (!f.date) { message.warning('请选择日期'); return }
  if (!f.startTime || !f.endTime) { message.warning('请选择时间段'); return }
  if (f.endTime <= f.startTime) { message.warning('结束时间需晚于开始时间'); return }
  booking.value = true
  try {
    const totalAmountFen = f.totalAmountYuan != null ? Math.round(Number(f.totalAmountYuan) * 100) : undefined
    if (bookingEditId.value) {
      await updateReservation(bookingEditId.value, {
        useType: f.useType,
        contractStatus: f.useType === 'RENTAL' ? f.contractStatus : undefined,
        salesId: f.useType === 'RENTAL' ? (f.salesId || null) : null,
        salesName: f.useType === 'RENTAL' ? (f.salesName || null) : null,
        totalAmount: f.useType === 'RENTAL' ? (totalAmountFen ?? null) : null,
        contactName: f.bookedBy || undefined,
        note: f.notes || undefined,
      })
      message.success('已更新')
    } else {
      await createReservation({
        venueId: f.venueId,
        date: (f.date as Dayjs).format('YYYY-MM-DD'),
        startTime: f.startTime,
        endTime: f.endTime,
        useType: f.useType,
        contractStatus: f.useType === 'RENTAL' ? f.contractStatus : undefined,
        salesId: f.useType === 'RENTAL' ? (f.salesId || undefined) : undefined,
        salesName: f.useType === 'RENTAL' ? (f.salesName || undefined) : undefined,
        totalAmount: totalAmountFen,
        bookedBy: f.bookedBy || undefined,
        notes: f.notes || undefined,
      })
      message.success('预约成功')
    }
    showBookingModal.value = false
    loadReservations()
    if (showContractsModal.value) loadContracts()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  } finally {
    booking.value = false
  }
}

async function deleteReservation(id: string) {
  if (!id) return
  try {
    await removeReservation(id)
    message.success('已取消预约')
    loadReservations()
    if (showContractsModal.value) loadContracts()
  } catch (e: any) {
    message.error(e?.message || '取消失败')
  }
}

// 二次确认：区分"课程占用"与"场地租赁"分别给出不同提示；防误点、防错删
function confirmDeleteReservation(slot: any) {
  if (!slot?.reservationId) return
  const timeRange = `${slot.startTime} — ${slot.endTime}`
  const dateStr = dayjs(slot.date || selectedDate.value).format('YYYY-MM-DD')
  if (slot.isCourse) {
    Modal.confirm({
      title: '取消课程占用将联动取消课程',
      icon: createVNode(ExclamationCircleOutlined),
      width: 480,
      content: createVNode('div', {}, [
        createVNode('p', { style: 'margin:0 0 8px;color:#c0392b;' }, `该时段被课程「${slot.courseTitle || slot.title}」占用。`),
        createVNode('p', { style: 'margin:0 0 8px;' }, `时间：${dateStr}  ${timeRange}`),
        createVNode('p', { style: 'margin:0 0 8px;' }, '确认取消后将同时将课程下架；若课程存在已支付报名，系统会拒绝并提示先处理退款。'),
        createVNode('p', { style: 'margin:0;color:#999;font-size:12px;' }, '已开始/已完课的课程无法取消。'),
      ]),
      okText: '确认取消课程占用',
      okType: 'danger',
      cancelText: '不取消',
      onOk: () => deleteReservation(slot.reservationId),
    })
  } else {
    Modal.confirm({
      title: '确认取消该场地预约？',
      icon: createVNode(ExclamationCircleOutlined),
      content: createVNode('div', {}, [
        createVNode('p', { style: 'margin:0 0 8px;' }, `预约：${slot.title}`),
        createVNode('p', { style: 'margin:0;' }, `时间：${dateStr}  ${timeRange}`),
      ]),
      okText: '确认取消',
      okType: 'danger',
      cancelText: '保留',
      onOk: () => deleteReservation(slot.reservationId),
    })
  }
}

function editVenue(record: any) {
  editingVenue.value = record
  venueForm.value = { name: record.name, city: record.city || '上海', capacity: record.capacity, address: record.address || '', description: record.description || '' }
  showEditVenueModal.value = true
}

function addVenue() {
  editingVenue.value = null
  venueForm.value = { name: '', city: '上海', capacity: 8, address: '', description: '' }
  showEditVenueModal.value = true
}

async function saveVenue() {
  if (!venueForm.value.name) { message.warning('请填写场地名称'); return }
  if (!String(venueForm.value.city || '').trim()) { message.warning('请选择或填写城市'); return }
  const payload = { ...venueForm.value, name: venueForm.value.name.trim(), city: String(venueForm.value.city).trim() }
  savingVenue.value = true
  try {
    if (editingVenue.value) {
      await updateVenue(editingVenue.value.id, payload)
      message.success('场地信息已更新')
    } else {
      await createVenue(payload)
      message.success('场地添加成功')
    }
    showEditVenueModal.value = false
    loadVenues()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    savingVenue.value = false
  }
}

async function deleteVenue(id: string) {
  try {
    await removeVenue(id)
    message.success('场地已删除')
    if (selectedVenue.value === id) selectedVenue.value = ''
    loadVenues()
  } catch (e: any) {
    message.error(e?.message || '删除失败')
  }
}

// ===== 操作日志 =====
const showLogsModal = ref(false)
const logs = ref<any[]>([])
const logsLoading = ref(false)
const logsVenueFilter = ref<string | undefined>(undefined)
const logColumns = [
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '场地', dataIndex: 'venueName', width: 120 },
  { title: '动作', dataIndex: 'action', width: 110 },
  { title: '预约/课程', dataIndex: 'eventName' },
  { title: '日期/时段', dataIndex: 'when', width: 140 },
  { title: '操作人', dataIndex: 'operator', width: 110 },
  { title: '备注', dataIndex: 'reason' },
]
function actionLabel(a: string) {
  return ({
    CREATE: '新增租赁',
    UPDATE: '编辑预约',
    CANCEL_RENTAL: '取消租赁',
    CONTRACT_UPLOAD: '上传合同',
    CONTRACT_SIGNED: '合同签约',
    COURSE_RESERVE: '课程登记占用',
    COURSE_RELEASE: '课程释放占用',
    COURSE_EXPIRE_RELEASE: '课程过期释放',
  } as Record<string,string>)[a] || a
}
function actionColor(a: string) {
  return ({
    CREATE: 'green',
    UPDATE: 'blue',
    CANCEL_RENTAL: 'red',
    CONTRACT_UPLOAD: 'geekblue',
    CONTRACT_SIGNED: 'orange',
    COURSE_RESERVE: 'blue',
    COURSE_RELEASE: 'orange',
    COURSE_EXPIRE_RELEASE: 'default',
  } as Record<string,string>)[a] || 'default'
}
async function openLogs() {
  logsVenueFilter.value = selectedVenue.value || undefined
  showLogsModal.value = true
  await loadLogs()
}
async function loadLogs() {
  logsLoading.value = true
  try {
    const data: any = await listReservationLogs({ venueId: logsVenueFilter.value, limit: 200 })
    logs.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    message.error(e?.message || '加载日志失败')
  } finally {
    logsLoading.value = false
  }
}

// ===== 合同管理 =====
const contracts = ref<any[]>([])
const contractsLoading = ref(false)
const contractFilter = ref('')
const contractKeyword = ref('')
const contractUploadingId = ref('')
const contractCols = [
  { title: '事项', dataIndex: 'eventName', width: 180 },
  { title: '场地', dataIndex: 'venueName', width: 110 },
  { title: '时段', dataIndex: 'time', width: 200 },
  { title: '客户', dataIndex: 'contactName', width: 100 },
  { title: '我方销售', dataIndex: 'salesName', width: 110 },
  { title: '合同状态', dataIndex: 'contractStatus', width: 110 },
  { title: '金额', dataIndex: 'amount', width: 130 },
  { title: '等待时长', dataIndex: 'waited', width: 110 },
  { title: '合同文件', dataIndex: 'contract', width: 160 },
  { title: '操作', dataIndex: 'action', width: 220, fixed: 'right' as const },
]
async function openContracts() {
  showContractsModal.value = true
  await loadContracts()
}
async function loadContracts() {
  contractsLoading.value = true
  try {
    const data: any = await listContractReservations({
      contractStatus: contractFilter.value ? (contractFilter.value as any) : undefined,
      keyword: contractKeyword.value || undefined,
    })
    contracts.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    message.error(e?.message || '加载合同列表失败')
  } finally {
    contractsLoading.value = false
  }
}

function beforeContractUpload(file: File, record: any) {
  if (file.size > 10 * 1024 * 1024) { message.error('文件过大，请选择 10MB 以内'); return false }
  const okType = /\.(pdf|doc|docx)$|^image\//i.test(file.name) || file.type.startsWith('image/')
  if (!okType) { message.error('仅支持 PDF/Word/图片'); return false }
  doUploadContract(file, record)
  return false
}
async function doUploadContract(file: File, record: any) {
  contractUploadingId.value = record.id
  try {
    const uploaded = await uploadFile(file, 'venue-contract')
    // 询问是否同步标记为已签约
    const markSigned = await new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: '合同已上传，是否同步标记为「已签约」？',
        content: '选择"是"将立即变更合同状态并记录签约时间；选择"否"则仅暂存合同文件，状态保持不变。',
        okText: '是，同步标记签约',
        cancelText: '否，仅暂存',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
    await uploadReservationContract(record.id, {
      contractUrl: uploaded.url,
      contractName: file.name,
      markSigned,
    })
    message.success(markSigned ? '合同上传并标记签约' : '合同已上传')
    loadContracts()
    loadReservations()
  } catch (e: any) {
    message.error(e?.message || '上传失败')
  } finally {
    contractUploadingId.value = ''
  }
}

// ===== 收款 =====
const paymentTarget = ref<any>(null)
const paymentTab = ref<'OFFLINE_TRANSFER' | 'QR_CODE' | 'HISTORY'>('OFFLINE_TRANSFER')
const submittingPayment = ref(false)
const offlineForm = ref<any>({ amountYuan: null, transferAt: null, counterparty: '', remark: '' })
const qrForm = ref<any>({ amountYuan: null, channel: 'WECHAT', remark: '' })
const paymentHistory = ref<any[]>([])
const loadingHistory = ref(false)
const paymentCols = [
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '方式', dataIndex: 'method', width: 130 },
  { title: '金额', dataIndex: 'amount', width: 100 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '交易对手', dataIndex: 'counterparty', width: 120 },
  { title: '操作人', dataIndex: 'operatorName', width: 100 },
  { title: '备注', dataIndex: 'remark' },
  { title: '操作', dataIndex: 'action', width: 160, fixed: 'right' as const },
]

const qrConfig = ref<{ alipay: string | null; wechat: string | null }>({ alipay: null, wechat: null })
const qrUploading = ref<'ALIPAY' | 'WECHAT' | ''>('')

async function loadQrConfig() {
  try {
    const data: any = await getPaymentQrConfig()
    qrConfig.value = { alipay: data?.alipay || null, wechat: data?.wechat || null }
  } catch { /* ignore */ }
}

async function openPayment(rec: any) {
  paymentTarget.value = rec
  paymentTab.value = 'OFFLINE_TRANSFER'
  offlineForm.value = { amountYuan: null, transferAt: null, counterparty: '', remark: '' }
  qrForm.value = { amountYuan: null, channel: qrConfig.value.wechat ? 'WECHAT' : 'ALIPAY', remark: '' }
  showPaymentModal.value = true
  await loadPaymentHistory(rec.id)
}
async function loadPaymentHistory(reservationId: string) {
  loadingHistory.value = true
  try {
    const data: any = await listPayments(reservationId)
    paymentHistory.value = Array.isArray(data) ? data : []
  } finally {
    loadingHistory.value = false
  }
}

async function submitOffline() {
  const f = offlineForm.value
  if (!f.amountYuan || Number(f.amountYuan) <= 0) { message.warning('请填写金额'); return }
  submittingPayment.value = true
  try {
    await createPayment(paymentTarget.value.id, {
      amount: Math.round(Number(f.amountYuan) * 100),
      method: 'OFFLINE_TRANSFER',
      transferAt: f.transferAt ? (f.transferAt as Dayjs).toISOString() : undefined,
      counterparty: f.counterparty || undefined,
      remark: f.remark || undefined,
      status: 'CONFIRMED',
    })
    message.success('已记录一笔收款')
    await Promise.all([loadPaymentHistory(paymentTarget.value.id), loadContracts()])
    offlineForm.value = { amountYuan: null, transferAt: null, counterparty: '', remark: '' }
    paymentTab.value = 'HISTORY'
  } catch (e: any) {
    message.error(e?.message || '提交失败')
  } finally {
    submittingPayment.value = false
  }
}
async function submitQrConfirm() {
  await doSubmitQr('CONFIRMED')
}
async function submitQrPending() {
  await doSubmitQr('PENDING')
}
async function doSubmitQr(status: 'CONFIRMED' | 'PENDING') {
  const f = qrForm.value
  if (!f.amountYuan || Number(f.amountYuan) <= 0) { message.warning('请填写金额'); return }
  submittingPayment.value = true
  try {
    await createPayment(paymentTarget.value.id, {
      amount: Math.round(Number(f.amountYuan) * 100),
      method: 'QR_CODE',
      qrChannel: f.channel,
      remark: f.remark || undefined,
      status,
    })
    message.success(status === 'CONFIRMED' ? '已确认到账' : '已创建待确认流水')
    await Promise.all([loadPaymentHistory(paymentTarget.value.id), loadContracts()])
    qrForm.value.amountYuan = null
    qrForm.value.remark = ''
    paymentTab.value = 'HISTORY'
  } catch (e: any) {
    message.error(e?.message || '提交失败')
  } finally {
    submittingPayment.value = false
  }
}
async function confirmOnePayment(id: string, status: 'CONFIRMED' | 'CANCELLED') {
  try {
    await confirmPayment(id, status)
    message.success(status === 'CONFIRMED' ? '已确认到账' : '已取消')
    await Promise.all([loadPaymentHistory(paymentTarget.value.id), loadContracts()])
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

// ===== 收款码上传 =====
function beforeQrUpload(file: File, channel: 'ALIPAY' | 'WECHAT') {
  if (!file.type.startsWith('image/')) { message.error('请上传图片'); return false }
  if (file.size > 5 * 1024 * 1024) { message.error('图片过大，请选择 5MB 以内'); return false }
  doUploadQr(file, channel)
  return false
}
async function doUploadQr(file: File, channel: 'ALIPAY' | 'WECHAT') {
  qrUploading.value = channel
  try {
    const uploaded = await uploadFile(file, 'venue-qr')
    const patch: any = {}
    patch[channel === 'ALIPAY' ? 'alipay' : 'wechat'] = uploaded.url
    const next: any = await setPaymentQrConfig(patch)
    qrConfig.value = { alipay: next?.alipay || null, wechat: next?.wechat || null }
    message.success('已更新收款码')
  } catch (e: any) {
    message.error(e?.message || '上传失败')
  } finally {
    qrUploading.value = ''
  }
}
async function clearQr(channel: 'ALIPAY' | 'WECHAT') {
  try {
    const patch: any = {}
    patch[channel === 'ALIPAY' ? 'alipay' : 'wechat'] = null
    const next: any = await setPaymentQrConfig(patch)
    qrConfig.value = { alipay: next?.alipay || null, wechat: next?.wechat || null }
    message.success('已清除')
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

// ===== 工具 =====
function toYuan(fen: number | null | undefined) {
  if (fen == null) return '—'
  return (fen / 100).toFixed(2)
}
function waitedText(createdAt: string) {
  if (!createdAt) return '—'
  const diffMs = Date.now() - new Date(createdAt).getTime()
  if (diffMs < 0) return '—'
  const totalHours = Math.floor(diffMs / 3600000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return `${days}天${hours}小时`
}

onMounted(() => {
  loadVenues()
  loadAdmins()
  loadQrConfig()
})
</script>

<style scoped>
.timeslot-grid { display: flex; flex-direction: column; gap: 2px; }
.timeslot-row {
  display: flex; align-items: center; padding: 8px 16px;
  border-radius: 6px; border: 1px solid #f0ebe5; transition: all 0.2s;
}
.timeslot-row.occupied { background: #faf5f0; border-color: #e8ddd4; }
.timeslot-row.row-course { background: #faf5f0; border-color: #e8ddd4; }
.timeslot-row.row-signed { background: #FFF7EC; border-color: #F5D9A6; }
.timeslot-row.row-intent { background: #FFFBEB; border: 1px dashed #F59E0B; }
.timeslot-row.row-internal { background: #F3EFEA; border-color: #C7B9A3; }
.timeslot-time { min-width: 60px; font-weight: 600; color: #6B463C; font-size: 13px; }
.timeslot-content { flex: 1; display: flex; justify-content: space-between; align-items: center; }
.timeslot-content.empty { color: #ccc; }
.slot-info { display: flex; align-items: center; gap: 8px; }
.slot-title { font-weight: 500; color: #4B3621; }
.slot-contact { color: #7D665C; font-size: 13px; display: flex; align-items: center; gap: 4px; }
.legend-dot { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
</style>
