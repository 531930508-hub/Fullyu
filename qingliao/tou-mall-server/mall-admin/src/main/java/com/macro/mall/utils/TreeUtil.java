package com.macro.mall.utils;

import java.util.*;

/**
 * @author zkl on 2023/6/2
 */
public class TreeUtil {

    private TreeUtil() {
    }

    /**
     * 列表转树形
     *
     * @param <T> {@link TreeModel}
     * @return 树
     */
    public static <T extends TreeModel<T>> List<T> listToTree(List<T> list) {
        return listToTree(list, null);
    }

    /**
     * 列表转树形 带排序
     *
     * @param list    所有list
     * @param compare
     * @param <T>     {@link TreeModel}
     * @return 树
     */
    public static <T extends TreeModel<T>> List<T> listToTree(List<T> list, Comparator<T> compare) {
        //all groupingBy methods end up using the same map.merge() that rejects null keys
        //        Stream<T> stream = list.stream();
        Map<Long, List<T>> groupMap = new HashMap<>();
        Map<Long, T> idMap = new HashMap<>();
        List<T> result = new ArrayList<>();

        //按parent分组
        for (T t : list) {
            idMap.put(t.getId(), t);
            List<T> children = groupMap.computeIfAbsent(t.getParentId(), k -> new ArrayList<>());
            children.add(t);
        }
        //排序
        if (compare != null) {
            for (HashMap.Entry<Long, List<T>> entry : groupMap.entrySet()) {
                Long key = entry.getKey();
                List<T> value = entry.getValue();
                value.sort(compare);
                matchChildren(key, value, idMap, result);
            }
            result.sort(compare);
        }
        //不排序
        else {
            for (HashMap.Entry<Long, List<T>> entry : groupMap.entrySet()) {
                Long key = entry.getKey();
                List<T> value = entry.getValue();
                matchChildren(key, value, idMap, result);
            }
        }
        return result;
    }


    /**
     * 给children无父级按根级处理
     */
    private static <T extends TreeModel<T>> void matchChildren(Long key, List<T> value, Map<Long, T> idMap, List<T> result) {
        T t = idMap.get(key);
        if (t != null) {
            t.setChildren(value);
        } else {
            result.addAll(value);
        }
    }


}
