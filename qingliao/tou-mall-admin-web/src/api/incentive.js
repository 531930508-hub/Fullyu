import request from '@/utils/request'

export default {
  mine(params) {
    return request({
      url: '/incentive/mine',
      method: 'get',
      params: params
    })
  },
  dashboard(params) {
    return request({
      url: '/incentive/dashboard',
      method: 'get',
      params: params
    })
  },
  board(params) {
    return request({
      url: '/incentive/board',
      method: 'get',
      params: params
    })
  },
  shops() {
    return request({
      url: '/incentive/shops',
      method: 'get'
    })
  },
  massagists(params) {
    return request({
      url: '/incentive/massagists',
      method: 'get',
      params: params
    })
  },
  trainingRecords(params) {
    return request({
      url: '/incentive/training-records',
      method: 'get',
      params: params
    })
  },
  saveTrainingRecord(data) {
    return request({
      url: '/incentive/training-records',
      method: 'post',
      data: data
    })
  },
  deleteTrainingRecord(certId) {
    return request({
      url: `/incentive/training-records/${certId}`,
      method: 'delete'
    })
  },
  config(params) {
    return request({
      url: '/incentive/config',
      method: 'get',
      params: params
    })
  },
  configHistory() {
    return request({
      url: '/incentive/config/history',
      method: 'get'
    })
  },
  saveConfig(data) {
    return request({
      url: '/incentive/config',
      method: 'post',
      data: data
    })
  },
  shopTargets(params) {
    return request({
      url: '/incentive/shop-targets',
      method: 'get',
      params: params
    })
  },
  saveShopTarget(data) {
    return request({
      url: '/incentive/shop-targets',
      method: 'post',
      data: data
    })
  },
  exportCsv(params) {
    return request({
      url: '/incentive/export',
      method: 'get',
      params: params,
      responseType: 'blob'
    })
  },
  trainerProfile() {
    return request({url: '/incentive/trainer/profile', method: 'get'})
  },
  trainerTherapists(params) {
    return request({url: '/incentive/trainer/therapists', method: 'get', params})
  },
  trainerProjects(params) {
    return request({url: '/incentive/trainer/projects', method: 'get', params})
  },
  submitAssessment(data) {
    return request({url: '/incentive/trainer/assessments', method: 'post', data})
  },
  myAssessments(params) {
    return request({url: '/incentive/trainer/assessments', method: 'get', params})
  },
  assessmentRecords(params) {
    return request({url: '/incentive/training-assessments', method: 'get', params})
  },
  assessmentTrainers() {
    return request({url: '/incentive/training-assessments/trainers', method: 'get'})
  },
  assessmentSummary(params) {
    return request({url: '/incentive/training-assessments/summary', method: 'get', params})
  },
  assessmentDetail(params) {
    return request({url: '/incentive/training-assessments/detail', method: 'get', params})
  },
  voidAssessment(id, data) {
    return request({url: `/incentive/training-assessments/${id}/void`, method: 'post', data})
  },
  revokeCert(certId, data) {
    return request({url: `/incentive/training-records/${certId}/revoke`, method: 'post', data})
  },
  manualCert(data) {
    return request({url: '/incentive/training-records/manual', method: 'post', data})
  },
  exportAssessments(params) {
    return request({url: '/incentive/training-assessments/export', method: 'get', params, responseType: 'blob'})
  },
  exportCertifications(params) {
    return request({url: '/incentive/training-certifications/export', method: 'get', params, responseType: 'blob'})
  }
}
