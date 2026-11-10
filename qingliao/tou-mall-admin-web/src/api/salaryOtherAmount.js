import request from '@/utils/request'

export default {
  importExcel(file, createUser) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('createUser', createUser)
    return request.post('/salaryOtherAmount/import/add', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
getSalaryOtherAmount(params){
  return request({
    url: '/salaryOtherAmount/getSalaryOtherAmount',
    method: 'get',
    params: params
  })
},
deleteSalaryOtherAmount(id){
  return request({
    url:'/salaryOtherAmount/deleteSalaryOtherAmount',
    method: 'delete',
    params: {id}
  })
},
saveorupdate(params){
  return request({
    url: '/salaryCoefficient/AddSalaryCoefficient',
    method: 'get',
    params: params
  })
},
getSalaryCoefficient(){
  return request({
    url: '/salaryCoefficient/GetSalaryCoefficient',
    method: 'get',
  })
},
saveSalaryOtherAmount(data){
  return request({
    url: '/salaryOtherAmount/saveSalaryOtherAmount',
    method: 'post',
    data
  })
},
}
