package com.macro.mall.model;
import lombok.Data;

import io.swagger.annotations.ApiModelProperty;
import java.io.Serializable;

@Data
public class PmsAlbumPic implements Serializable {
    private Long id;

    private Long albumId;

    private String pic;

    private static final long serialVersionUID = 1L;

}