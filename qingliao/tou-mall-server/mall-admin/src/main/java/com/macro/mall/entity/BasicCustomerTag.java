package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.utils.TreeModel;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

/**
 * 基础客户标签
 *
 * @author ST
 * @date 2025/07/10
 */
@Getter
@Setter
@TableName("s_basic_customer_tag")
@ApiModel(value = "BasicCustomerTag对象", description = "基础客户标签")
public class BasicCustomerTag  extends BaseEntity implements TreeModel<BasicCustomerTag> {

    @ApiModelProperty("父级id")
    private Long parentId;

    @ApiModelProperty("标题")
    private String title;

    @ApiModelProperty("删除标记")
    private Boolean deleteFlag = false;

    private Long createUser;

    private Integer shopId = 1;

    @TableField(exist = false)
    private List<BasicCustomerTag> children;

    @Override
    public BasicCustomerTag setChildren(List<BasicCustomerTag> children) {
        this.children = children;
        return this;
    }
}
