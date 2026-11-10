package com.macro.mall.model;
import lombok.Data;

import io.swagger.annotations.ApiModelProperty;
import java.io.Serializable;

@Data
public class PmsAlbum implements Serializable {
    private Long id;

    private String name;

    private String coverPic;

    private Integer picCount;

    private Integer sort;

    private String description;

    private static final long serialVersionUID = 1L;

}