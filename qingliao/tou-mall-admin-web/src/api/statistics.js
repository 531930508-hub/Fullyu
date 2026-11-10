import request from '@/utils/request'
import fileUtil from "@/utils/fileUtil";

export default {
  serviceDuration(params) {
    return request({
      url: '/statistics/serviceDuration',
      method: 'get',
      params
    })
  },
  serviceDurationExport(params) {
    return request({
      url: '/statistics/serviceDuration/export',
      method: 'get',
      params,
      responseType: 'blob'
    }).then(res => {
      fileUtil.exportSave(res, "服务时长.xlsx")
    })
  },
  therapistStats(params) {
    return request({
      url: '/statistics/therapistStats',
      method: 'get',
      params
    })
  },
  therapistStatsExport(params) {
    return request({
      url: '/statistics/therapistStats/export',
      method: 'get',
      params,
      responseType: 'blob'
    }).then(res => {
      fileUtil.exportSave(res, "疗愈师统计.xlsx")
    })
  },
  operatingRevenue(params) {
    return request({
      url: '/statistics/operatingRevenue',
      method: 'get',
      params
    })
  },
  operatingRevenueTop(params) {
    return request({
      url: '/statistics/operatingRevenue/top',
      method: 'get',
      params
    })
  },
  operatingRevenueExport(params) {
    return request({
      url: '/statistics/operatingRevenue/export',
      method: 'get',
      params,
      responseType: 'blob'
    }).then(res => {
      fileUtil.exportSave(res, "经营流水.xlsx")
    })
  },
  operatingRevenueDailyExport(params) {
    return request({
      url: '/statistics/operatingRevenue/dailyExport',
      method: 'get',
      params,
      responseType: 'blob'
    }).then(res => {
      fileUtil.exportSave(res, "经营日报.xlsx")
    })
  },
  savepayout(data) {
    return request({
      url: '/statistics/addMonthlyPayout',
      method: 'post',
      data
    })
  },
  payoutpage(params) {
    return request({
      url: '/statistics/payoutpage',
      method: 'get',
      params: params
    })
  },
  deletePayoutData(id){
    return request({
      url:'/statistics/deletePayoutData',
      method: 'delete',
      params: {id}
    })
  },
  topAlldata(params) {
    return request({
      url: '/statistics/topAlldata',
      method: 'get',
      params: params
    })
  },
  operatingRevenueExportXinZi(params) {
    return request({
      url: '/statistics/operatingRevenueXinZi/export',
      method: 'get',
      params,
      responseType: 'blob'
    }).then(res => {
      console.log(res)
      fileUtil.exportSave(res, false)
    })
  },
  operatingRevenueExportFuWu(params) {
    return request({
      url: '/statistics/operatingRevenueFuWu/export',
      method: 'get',
      params,
      responseType: 'blob'
    }).then(res => {
      fileUtil.exportSave(res, "疗愈师服务时长.xlsx")
    })
  },
}
