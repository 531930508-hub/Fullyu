package com.macro.mall.utils;


import com.alibaba.excel.EasyExcel;
import com.alibaba.excel.read.metadata.ReadSheet;
import com.alibaba.excel.support.ExcelTypeEnum;
import com.macro.mall.common.exception.BusinessException;
import lombok.Cleanup;
import org.apache.logging.log4j.util.Strings;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.util.List;
import java.util.Map;

/**
 * excel 工具类
 *
 * @Author: jinlong
 * @Date: 2020/3/23 18:17
 */
public class ExcelUtil implements RequestUtil {

    public static List<Map<Integer, String>> doReadExcelMapList(MultipartFile file, int sheetNo, int startRow) {
        try (InputStream is = file.getInputStream()) {
            NoModelMapListener noModelMapListener = new NoModelMapListener();
            ReadSheet readSheet = new ReadSheet();
            readSheet.setSheetNo(sheetNo);
            readSheet.setHeadRowNumber(startRow);
            EasyExcel.read(is).registerReadListener(noModelMapListener).build().read(readSheet).close();
            return noModelMapListener.getList();
        } catch (IOException e) {
            e.printStackTrace();
            throw new BusinessException("excel读取失败");
        }
    }

    public static void export(List list, Class cls, String fileName) {
        try {
            new com.macro.mall.utils.ExcelUtil().doExport(list, cls, "sheet1", fileName);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private void doExport(List list, Class cls, String sheetName, String fileName) throws IOException {
        HttpServletResponse response = response();
        response.setContentType("application/vnd.ms-excel");
        if (Strings.isNotBlank(fileName)) {
            response.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
            response.setHeader("Content-Disposition", "attachment;filename=" + URLEncoder.encode(fileName, "utf-8"));
        }
        @Cleanup OutputStream out = response.getOutputStream();
        EasyExcel.write(out, cls).excelType(ExcelTypeEnum.XLSX).sheet(sheetName).doWrite(list);
    }

}
