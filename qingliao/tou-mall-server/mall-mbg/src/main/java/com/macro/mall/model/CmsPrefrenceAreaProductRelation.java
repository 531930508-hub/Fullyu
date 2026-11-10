package com.macro.mall.model;
import lombok.Data;

import io.swagger.annotations.ApiModelProperty;
import java.io.Serializable;

@Data
public class CmsPrefrenceAreaProductRelation implements Serializable {
    private Long id;

    private Long prefrenceAreaId;

    private Long productId;

    private static final long serialVersionUID = 1L;


}