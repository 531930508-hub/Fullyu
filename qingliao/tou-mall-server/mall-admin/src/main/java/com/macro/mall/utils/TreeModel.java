package com.macro.mall.utils;

import java.util.List;

/**
 * @author zkl on 2023/6/2
 */
public interface TreeModel<T> {

    /**
     * 树形
     */


    /**
     * 主键id
     *
     * @return
     */
    Long getId();

    /**
     * 父id
     *
     * @return
     */
    Long getParentId();

    /**
     * 设置子数据集
     *
     * @param children
     * @return
     */
    T setChildren(List<T> children);


}
