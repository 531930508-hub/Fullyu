package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.macro.mall.serializer.QiniuUrlDeSerializer;
import com.macro.mall.serializer.QiniuUrlSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * @author zkl
 * @date 2025/05/30
 */
@Getter
@Setter
@TableName("s_mini_image")
@ApiModel(value = "MiniImage对象", description = "小程序图片")
public class MiniImage extends BaseEntity {

    @ApiModelProperty("文件名称")
    private String name;

    @ApiModelProperty("图片地址")
    @JsonSerialize(using = QiniuUrlSerializer.class)
    @JsonDeserialize(using = QiniuUrlDeSerializer.class)
    private String url;

    @ApiModelProperty("类型1开屏图，2banner图，3送券图，4首页弹框图")
    private Integer type;

    @ApiModelProperty("状态：0不可用、1可用")
    private Integer status;

    @ApiModelProperty("跳转地址")
    private  String goUrl;


}
