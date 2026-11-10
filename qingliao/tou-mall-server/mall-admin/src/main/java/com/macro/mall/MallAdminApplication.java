package com.macro.mall;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * 应用启动入口
 * Created by macro on 2018/4/26.
 */
@SpringBootApplication
@EnableAsync
@MapperScan({"com.macro.mall.mapper","com.macro.mall.dao","com.macro.mall.incentive.mapper"})
public class MallAdminApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallAdminApplication.class, args);
    }
}
