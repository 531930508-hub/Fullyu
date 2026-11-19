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

/**
 * PUT 到 OSS 预签名地址。throwOnError=true 时失败会抛出，供“必须确认成功”的场景（如考核在岗证明）使用。
 */
export async function uploadFile(signedUrl, file, throwOnError = false) {
  try {
    const response = await axios.put(signedUrl, file, {
      headers: {
        'Content-Type': 'application/octet-stream',
      }
    });
    console.log(`返回上传状态码：${response.status}`);
    return response
  } catch (error) {
    Bus.$emit('cancel-loading')
    console.error(`发生错误：${error.message}`);
    if (throwOnError) throw error
  }
}
