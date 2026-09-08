import service from './request'

/**
 * 服务端代传文件上传（图片/PDF/Word 等）
 * 后端接口：POST /api/v1/upload/server  form-data: file, dir
 * 返回：{ key, url }
 */
export async function uploadFile(file: File | Blob, dir = 'common'): Promise<{ key: string; url: string }> {
  const form = new FormData()
  form.append('file', file, (file as File).name || 'upload')
  form.append('dir', dir)
  const res: any = await service.request({
    method: 'POST',
    url: '/upload/server',
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  })
  return res
}
