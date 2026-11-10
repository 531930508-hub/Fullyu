package com.macro.mall.service.impl;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.File;

@SpringBootTest
class OssServiceImplTest {
    @Autowired
    OssServiceImpl service;

    @Test
    void uploadFile() {
        File file=new File("C:\\Users\\32180\\Pictures\\Saved Pictures\\微信图片_20201231111948.jpg");
        System.out.println(file.getName());
        String testFile = service.uploadFile(file, "testFile");
        String finalUrl = service.getFinalUrl(testFile);
        System.out.println(finalUrl);
    }
}