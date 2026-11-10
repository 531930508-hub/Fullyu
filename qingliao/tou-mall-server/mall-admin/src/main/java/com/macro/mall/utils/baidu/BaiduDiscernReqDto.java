package com.macro.mall.utils.baidu;

import lombok.Data;
import lombok.experimental.Accessors;

/**
 * 语音识别请求参数
 */
@Data
@Accessors(chain = true)
public class BaiduDiscernReqDto {
    /**
     * 语音文件的格式，pcm/wav/amr/m4a。不区分大小写。推荐pcm文件
     */
    private String format = "pcm";
    /**
     * 用户唯一标识，用来区分用户，计算UV值。建议填写能区分用户的机器 MAC 地址或 IMEI 码，长度为60字符以内。
     */
    private String cuid;
    /**
     * 80001（极速版输入法模型）
     */
    private Integer dev_pid = 80001;
    /**
     * 采样率，16000、8000，固定值
     */
    private Integer rate = 16000;
    /**
     * 声道数，仅支持单声道，请填写固定值 1
     */
    private Integer channel = 1;
    /**
     * 开放平台获取到的开发者[access_token]获取 Access Token "access_token")
     */
    private String token;
    /**
     * 本地语音文件的二进制语音数据 ，需要进行base64 编码。与len参数连一起使用。
     */
    private String speech;
    /**
     * 本地语音文件的的字节数，单位字节
     */
    private Integer len;
}
