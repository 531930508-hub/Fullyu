import request from '@/utils/fetch';
import Request from '@/js_sdk/luch-request/request.js'

const requestInstance = new Request()

/**
 * 上传用户选择的头像到阿里云OSS
 * @param {string} tempFilePath 临时文件路径
 * @returns {Promise<string>} 上传成功后的头像URL
 */
export async function uploadAvatar(tempFilePath) {
    try {
        // 显示加载状态
        uni.showLoading({title: '上传中...'});

        // 1. 生成文件名和前缀
        const fileName = `avatar_${Date.now()}.jpg`;
        const prefix = 'avatars'; // 存储在OSS的目录

        // 2. 获取阿里云预签名URL
        const {url, expireTime, key} = await generatePreSignedUrl(fileName, prefix);

        // 读取临时文件为 ArrayBuffer
        const arrayBuffer = await new Promise((resolve, reject) => {
            uni.getFileSystemManager().readFile({
                filePath: tempFilePath,
                success: (res) => resolve(res.data),
                fail: (err) => reject(new Error('文件读取失败'))
            });
        });

        // 3. 上传文件到阿里云
        await uploadFileToOss(url, arrayBuffer);

        // 4.返回key
        return key;
    } catch (error) {
        console.error('上传头像失败:', error);
        uni.showToast({title: '上传失败', icon: 'none'});
        throw error;
    } finally {
        uni.hideLoading();
    }
}

/**
 * 获取阿里云预签名URL
 * @param {string} fileName 文件名
 * @param {string} prefix 文件前缀
 * @returns {Promise<Object>} 包含签名URL和访问URL的对象
 */
async function generatePreSignedUrl(fileName, prefix) {
    return request.get({
        url: '/aliyun/oss/generatePreSignedUrl',
        params: {fileName, prefix}
    });
}

/**
 * 上传文件到阿里云OSS
 * @param {string} signedUrl 签名URL
 * @param {string} file 本地文件路径
 * @returns {Promise<void>}
 */
async function uploadFileToOss(signedUrl, file) {
    return requestInstance.request({
        url: signedUrl,
        method: 'PUT',
        header: {
            'Content-Type': 'application/octet-stream'
        },
        data: file
    });
}

