package com.macro.mall.utils;

import com.baomidou.mybatisplus.generator.FastAutoGenerator;
import com.baomidou.mybatisplus.generator.config.OutputFile;
import com.baomidou.mybatisplus.generator.config.TemplateType;
import com.baomidou.mybatisplus.generator.engine.FreemarkerTemplateEngine;

import java.util.Collections;

/**
 * @author zkl
 */
public class CodeGenerator {
    /**
     * 子包名
     */
    private static final String SUB_PACKAGE = "mall";
    /**
     * 数据库名
     */
    private static final String DB_NAME = "fullytherapy";
    /**
     * 作者名称
     */
    private static final String AUTHOR = "";

    private static final String PACKAGE_NAME = "com.macro";
    private static final String DB_URL = "jdbc:mysql://rm-bp127cdsipvc7dtseno.mysql.rds.aliyuncs.com:3306/" + DB_NAME;
    private static final String DB_USERNAME = com.macro.mall.common.utils.Env.get("DB_USERNAME", "fully");
    private static final String DB_PASSWORD = com.macro.mall.common.utils.Env.get("DB_PASSWORD");

    public static void main(String[] args) {
        String propertyName = System.getProperty("user.dir");
        String admin = "mall-admin";
        FastAutoGenerator fastAutoGenerator = FastAutoGenerator.create(DB_URL, DB_USERNAME, DB_PASSWORD);
        System.out.println(propertyName + "/" + admin + "/src/main/java");
        fastAutoGenerator
                .globalConfig(builder -> {
                    builder.author(AUTHOR)
                            .enableSwagger()
                            .outputDir(propertyName + "/" + admin + "/src/main/java")
                            .commentDate("yyyy/MM/dd")
                            .disableOpenDir();
                }).templateConfig(builder -> {
            builder.disable(TemplateType.SERVICE_IMPL)
                    .entity("/code-template/entity.java")
                    .service("/code-template/service.java")
                    .mapper("/code-template/mapper.java")
                    .controller("/code-template/controller.java");
        }).packageConfig(builder -> {
            builder.parent(PACKAGE_NAME)
                    .moduleName(SUB_PACKAGE)
                    .pathInfo(Collections.singletonMap(OutputFile.xml, propertyName + "/" + admin + "/src/main/resources/dao"));
        }).strategyConfig((scanner, builder) -> {
            builder.addInclude(scanner.apply("请输入表名，多个英文逗号分隔"))
                    .addTablePrefix(scanner.apply("请输入表前缀"))
                    .serviceBuilder()
                    .formatServiceFileName("%sService")
                    .entityBuilder()
                    .enableLombok()
                    .logicDeleteColumnName("deleted")
                    .enableTableFieldAnnotation()
                    .controllerBuilder()
                    .formatFileName("%sController")
                    .enableRestStyle()
                    .mapperBuilder()
                    .formatMapperFileName("%sMapper")
                    .enableMapperAnnotation()
                    .formatXmlFileName("%sMapper");
        }).templateEngine(new FreemarkerTemplateEngine())
                .execute();
    }
}
