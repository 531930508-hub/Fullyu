package com.macro.mall.incentive.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class AssessmentSubmitRequest {

    private Long massagistId;

    private String projectKey;

    private LocalDate assessDate;

    /**
     * 1 通过，0 不通过。
     */
    private Integer result;

    private String remark;

    /**
     * 在岗证明照片：先走 /aliyun/oss/generatePreSignedUrl 拿到 OSS key 再上传，这里传 key 列表。
     */
    private List<String> proofPhotos = new ArrayList<>();
}
