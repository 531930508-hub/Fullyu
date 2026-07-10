<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">场地管理</h2>
      <a-space>
        <a-select v-model:value="selectedVenue" style="width: 180px" @change="loadReservations">
          <a-select-option v-for="v in venues" :key="v.id" :value="v.id">{{ v.name }}（{{ v.capacity }}人）</a-select-option>
        </a-select>
        <a-date-picker v-model:value="selectedDate" @change="loadReservations" />
        <a-button type="primary" @click="openBooking">+ 手动预约</a-button>
        <a-button @click="showVenueSettingsModal = true">场地设置</a-button>
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
        <div v-for="slot in timeSlots" :key="slot.time" class="timeslot-row" :class="{ occupied: slot.occupied }">
          <div class="timeslot-time">{{ slot.time }}</div>
          <div class="timeslot-content" v-if="slot.occupied">
            <div class="slot-info">
              <a-tag color="orange" size="small">预约</a-tag>
              <span class="slot-title">{{ slot.title }}</span>
            </div>
            <div class="slot-contact">
              <span>{{ slot.bookedBy }}</span>
              <a-button type="link" size="small" danger @click="deleteReservation(slot.reservationId)">取消</a-button>
            </div>
          </div>
          <div class="timeslot-content empty" v-else>
            <span style="color: #ccc;">空闲</span>
            <a-button type="link" size="small" @click="quickBook(slot.time)">预约</a-button>
          </div>
        </div>
      </div>
    </a-card>

    <!-- 手动预约弹窗 -->
    <a-modal v-model:open="showBookingModal" title="手动预约场地" width="600px" :confirm-loading="booking" @ok="confirmBooking">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="场地" required>
              <a-select v-model:value="bookingForm.venueId" placeholder="选择场地">
                <a-select-option v-for="v in venues" :key="v.id" :value="v.id">{{ v.name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="日期" required>
              <a-date-picker v-model:value="bookingForm.date" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="开始时间" required>
              <a-select v-model:value="bookingForm.startTime" placeholder="选择开始">
                <a-select-option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="结束时间" required>
              <a-select v-model:value="bookingForm.endTime" placeholder="选择结束">
                <a-select-option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="预约人">
          <a-input v-model:value="bookingForm.bookedBy" placeholder="预约人姓名/联系方式" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="bookingForm.notes" :rows="2" placeholder="用途/特殊要求等" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 场地设置弹窗 -->
    <a-modal v-model:open="showVenueSettingsModal" title="场地设置" width="720px" :footer="null">
      <a-table :columns="venueSettingCols" :data-source="venues" :pagination="false" size="small" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'action'">
            <a-button type="link" size="small" @click="editVenue(record)">编辑</a-button>
            <a-popconfirm title="确认删除该场地？" @confirm="deleteVenue(record.id)">
              <a-button type="link" size="small" danger>删除</a-button>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
      <a-button type="dashed" block style="margin-top: 12px" @click="addVenue">+ 添加场地</a-button>
    </a-modal>

    <!-- 编辑场地弹窗 -->
    <a-modal v-model:open="showEditVenueModal" :title="editingVenue ? '编辑场地' : '添加场地'" :confirm-loading="savingVenue" @ok="saveVenue">
      <a-form layout="vertical">
        <a-form-item label="场地名称" required><a-input v-model:value="venueForm.name" placeholder="如：冥想室 A" /></a-form-item>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="容量"><a-input-number v-model:value="venueForm.capacity" :min="1" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="地址"><a-input v-model:value="venueForm.address" placeholder="场地地址" /></a-form-item></a-col>
        </a-row>
        <a-form-item label="描述"><a-textarea v-model:value="venueForm.description" :rows="2" placeholder="场地设备/特点等" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs, { Dayjs } from 'dayjs'
import { message } from 'ant-design-vue'
import { listVenues, createVenue, updateVenue, removeVenue, listReservations, createReservation, removeReservation } from '@/api/venue'

const selectedDate = ref<Dayjs>(dayjs())
const selectedVenue = ref('')
const loading = ref(false)
const showBookingModal = ref(false)
const showVenueSettingsModal = ref(false)
const showEditVenueModal = ref(false)
const editingVenue = ref<any>(null)
const booking = ref(false)
const savingVenue = ref(false)

const venues = ref<any[]>([])
const reservations = ref<any[]>([])

const currentVenue = computed(() => venues.value.find(v => v.id === selectedVenue.value))

// 半小时时段 08:00 - 22:00
const timeOptions = Array.from({ length: 29 }, (_, i) => {
  const h = Math.floor(i / 2) + 8
  const m = i % 2 === 0 ? '00' : '30'
  return `${h.toString().padStart(2, '0')}:${m}`
})

const timeSlots = computed(() => {
  const slots = []
  for (let i = 0; i < 28; i++) {
    const h = Math.floor(i / 2) + 8
    const m = i % 2 === 0 ? '00' : '30'
    const time = `${h.toString().padStart(2, '0')}:${m}`
    const r = reservations.value.find(s => s.startTime <= time && s.endTime > time)
    if (r) {
      slots.push({ time, occupied: true, title: r.notes || '场地预约', bookedBy: r.bookedBy || '—', reservationId: r.id })
    } else {
      slots.push({ time, occupied: false, title: '', bookedBy: '', reservationId: '' })
    }
  }
  return slots
})

const todayOccupied = computed(() => timeSlots.value.filter(s => s.occupied).length)

const venueSettingCols = [
  { title: '名称', dataIndex: 'name' },
  { title: '容量', dataIndex: 'capacity', width: 80 },
  { title: '地址', dataIndex: 'address' },
  { title: '描述', dataIndex: 'description' },
  { title: '操作', dataIndex: 'action', width: 130 },
]

const bookingForm = ref({ venueId: '', date: null as Dayjs | null, startTime: '', endTime: '', bookedBy: '', notes: '' })
const venueForm = ref({ name: '', capacity: 8, address: '', description: '' })

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

function openBooking() {
  bookingForm.value = { venueId: selectedVenue.value, date: selectedDate.value, startTime: '', endTime: '', bookedBy: '', notes: '' }
  showBookingModal.value = true
}

function quickBook(time: string) {
  bookingForm.value = { venueId: selectedVenue.value, date: selectedDate.value, startTime: time, endTime: '', bookedBy: '', notes: '' }
  showBookingModal.value = true
}

async function confirmBooking() {
  if (!bookingForm.value.venueId) { message.warning('请选择场地'); return }
  if (!bookingForm.value.date) { message.warning('请选择日期'); return }
  if (!bookingForm.value.startTime || !bookingForm.value.endTime) { message.warning('请选择时间段'); return }
  booking.value = true
  try {
    await createReservation({
      venueId: bookingForm.value.venueId,
      date: bookingForm.value.date.format('YYYY-MM-DD'),
      startTime: bookingForm.value.startTime,
      endTime: bookingForm.value.endTime,
      bookedBy: bookingForm.value.bookedBy || undefined,
      notes: bookingForm.value.notes || undefined,
    })
    message.success('预约成功')
    showBookingModal.value = false
    loadReservations()
  } catch (e: any) {
    message.error(e?.message || '预约失败')
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
  } catch (e: any) {
    message.error(e?.message || '取消失败')
  }
}

function editVenue(record: any) {
  editingVenue.value = record
  venueForm.value = { name: record.name, capacity: record.capacity, address: record.address || '', description: record.description || '' }
  showEditVenueModal.value = true
}

function addVenue() {
  editingVenue.value = null
  venueForm.value = { name: '', capacity: 8, address: '', description: '' }
  showEditVenueModal.value = true
}

async function saveVenue() {
  if (!venueForm.value.name) { message.warning('请填写场地名称'); return }
  savingVenue.value = true
  try {
    if (editingVenue.value) {
      await updateVenue(editingVenue.value.id, { ...venueForm.value })
      message.success('场地信息已更新')
    } else {
      await createVenue({ ...venueForm.value })
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

onMounted(loadVenues)
</script>

<style scoped>
.timeslot-grid { display: flex; flex-direction: column; gap: 2px; }
.timeslot-row {
  display: flex; align-items: center; padding: 8px 16px;
  border-radius: 6px; border: 1px solid #f0ebe5; transition: all 0.2s;
}
.timeslot-row.occupied { background: #faf5f0; border-color: #e8ddd4; }
.timeslot-time { min-width: 60px; font-weight: 600; color: #6B463C; font-size: 13px; }
.timeslot-content { flex: 1; display: flex; justify-content: space-between; align-items: center; }
.timeslot-content.empty { color: #ccc; }
.slot-info { display: flex; align-items: center; gap: 8px; }
.slot-title { font-weight: 500; color: #4B3621; }
.slot-contact { color: #7D665C; font-size: 13px; }
</style>
