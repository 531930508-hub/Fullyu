package com.macro.mall.utils;

import com.alibaba.excel.context.AnalysisContext;
import com.alibaba.excel.event.AnalysisEventListener;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 不创建对象的读
 *
 * @author zkl on 2023/1/11
 */
@Slf4j
public class NoModelMapListener extends AnalysisEventListener<Map<Integer, String>> {
    private List<Map<Integer, String>> list = new ArrayList();

    public NoModelMapListener() {
    }

    @Override
    public void invoke(Map<Integer, String> map, AnalysisContext analysisContext) {
        this.list.add(map);
    }

    public void doAfterAllAnalysed(AnalysisContext context) {
    }

    public List<Map<Integer, String>> getList() {
        return this.list;
    }

    public void setList(List<Map<Integer, String>> list) {
        this.list = list;
    }
}
