package com.macro.mall.consts;

/**
 * @author jinlong
 * @date 2022/3/3
 */
public class NormalConst {
    /**
     * 七牛云文件名分隔符：获取文件名时，不能用String.split,直接使用本类的getFileName方法
     */
    public final static String FILE_NAME_SPLIT = "(._.)";

    public final static String bookingLockKey = "buildOrder".intern();

    public final static String giftCardLockKey = "receive";

    // 每个券包次数消耗的分钟数
    public static final int PER_COUPON_COST_MINUTES = 30;
    //卡券订单超时时间（秒）
    public static final int COUPON_ORDER_TIMEOUT_SECONDS = 60;//30
    //订单超时时间（秒）
    public static final int ORDER_TIMEOUT_SECONDS = 300;
    //一天秒数
    public static final int ONE_DAY_SECONDS = 86400;
    //送券
    public static final Long GIVE_COUPON_ID = 1L;
    //送券
    public static final int GIVE_COUPON_VALID_DATE = 30;
    //订单完成通知时间（秒）
    public static final int ORDER_FINISH_NOTICE_SECONDS = 30;

    /**
     * 获取文件名
     *
     * @param fileKey 含有文件分割付的非完整路径
     * @return
     */
    public static String getFileName(String fileKey) {
        return fileKey.substring(fileKey.indexOf(FILE_NAME_SPLIT) + FILE_NAME_SPLIT.length());
    }

}
