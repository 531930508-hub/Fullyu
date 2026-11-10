package com.macro.mall.portal.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
//import org.springframework.data.mongodb.core.index.Indexed;
//import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;

/**
 * 会员品牌关注
 * Created by macro on 2018/8/2.
 */
@Getter
@Setter
public class MemberBrandAttention {
    @Id
    private String id;
    private Long memberId;
    private String memberNickname;
    private String memberIcon;
    private Long brandId;
    private String brandName;
    private String brandLogo;
    private String brandCity;
    private Date createTime;
}
