package com.macro.mall.config;

import com.aliyun.oss.ClientBuilderConfiguration;
import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClient;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.common.auth.CredentialsProvider;
import com.aliyun.oss.common.auth.DefaultCredentialProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OSS对象存储相关配置
 * Created by macro on 2018/5/17.
 */
@Configuration
public class OssConfig {
    @Value("${aliyun.oss.endpoint}")
    private String ENDPOINT;
    @Value("${aliyun.oss.accessKeyId}")
    private String ACCESS_KEY_ID;
    @Value("${aliyun.oss.accessKeySecret}")
    private String ACCESS_KEY_SECRET;
    @Bean
    public OSS ossClient(){
        CredentialsProvider credentialsProvider = new DefaultCredentialProvider(ACCESS_KEY_ID, ACCESS_KEY_SECRET);
        ClientBuilderConfiguration clientBuilderConfiguration = new ClientBuilderConfiguration();
        OSS build = OSSClientBuilder.create()
                .endpoint(ENDPOINT).credentialsProvider(credentialsProvider)
                .clientConfiguration(clientBuilderConfiguration).build();
        return build;
    }
}
