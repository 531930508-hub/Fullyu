package com.macro.mall.consts;

public class RedisKey {

    /**
     * 审批分类
     */
    public final static String APPROVAL_CATEGORY = "approvalCategory:";
    /**
     * 订单编号生成
     */
    public final static String ORDER_ID_GENERATOR_KEY = "orderIdGeneratorKey:";

    public final static String AUTH_KEY = "loginToken:";

    public final static String CANDIDATES = "candidates:";

    /**
     * 支付成功后保存一天订单支付状态
     */
    public final static String ORDER_PAYED = "orderPayed:";

    /**
     * 接待数据
     */
    public final static String RECEPTION_DATA = "receptionData:";
    public final static String RECEPTION_PRIORITY_MASSAGIST = "receptionPriorityMassagist:";

    public final static String MQ_OPENID = "mqOpenid:";

    public final static String FIND_MASSAGIST_NAME_BY_ID = "findMassagistNameById:";

    public final static String FIND_SHOP_NAME_BY_ID = "findShopNameById:";

    public final static String FIND_SHOP_ADDRESS_BY_ID = "findShopAddressById:";

}
