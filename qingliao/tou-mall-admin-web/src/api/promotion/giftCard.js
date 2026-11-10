import request from '@/utils/request'
import fileUtil from "@/utils/fileUtil";

export default {
  page(params) {
    return request({
      url: '/giftCard/page',
      method: 'get',
      params: params
    })
  },
  batchSave(data) {
    return request({
      url: '/giftCard/batch/save',
      method: 'post',
      data,
      timeout: 90000
    })
  },
  distribution(id, distributionUser) {
    return request({
      url: '/giftCard/distribution',
      method: 'post',
      params: {id, distributionUser}
    })
  },
  batchDistribution(distributionUser, ids) {
    return request({
      url: '/giftCard/batch/distribution',
      method: 'post',
      params: {distributionUser},
      data: ids
    })
  },
  failure(id) {
    return request({
      url: '/giftCard/failure',
      method: 'post',
      params: {id}
    })
  },
  batchFailure(ids) {
    return request({
      url: '/giftCard/batch/failure',
      method: 'post',
      data: ids
    })
  },
  importBatchSave(file, shopId, createUser) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('shopId', shopId)
    formData.append('createUser', createUser)
    return request.post('/giftCard/import/batch/save', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  prepaidPage(params) {
    return request({
      url: '/giftCard/prepaid/page',
      method: 'get',
      params
    })
  },
  exportExcel(params) {
    return request({
      url: '/giftCard/export',
      method: 'get',
      params,
      responseType: 'blob',
      timeout: 90000
    }).then(res => {
      fileUtil.exportSave(res, "导出礼品卡列表.xlsx")
    })
  },
}
