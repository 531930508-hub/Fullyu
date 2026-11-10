import request from '@/utils/request'
import axios from "axios";
import Bus from "@/utils/Bus";
export function policy() {
  return request({
    url: '/aliyun/oss/policy',
    method: 'get',
  })
}

export function generatePreSignedUrl(fileName, prefix) {
  return request({
    url: '/aliyun/oss/generatePreSignedUrl',
    method: 'get',
    params: {fileName, prefix}
  })
}

export async function uploadFile(signedUrl, file) {
  try {
    console.log(file)
    const response = await axios.put(signedUrl, file, {
      headers: {
        'Content-Type': 'application/octet-stream',
      }
    });
    console.log(response)
    console.log(`返回上传状态码：${response.status}`);
    if (response.status === 200) {
      console.log('使用网络库上传成功');
    }
    console.log(response.data);
  } catch (error) {
    Bus.$emit('cancel-loading')
    console.error(`发生错误：${error.message}`);
  }
}

