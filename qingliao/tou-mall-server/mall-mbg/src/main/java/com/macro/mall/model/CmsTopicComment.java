package com.macro.mall.model;
import lombok.Data;

import io.swagger.annotations.ApiModelProperty;
import java.io.Serializable;
import java.util.Date;

@Data
public class CmsTopicComment implements Serializable {
    private Long id;

    private String memberNickName;

    private Long topicId;

    private String memberIcon;

    private String content;

    private Date createTime;

    private Integer showStatus;

    private static final long serialVersionUID = 1L;

}