package com.macro.mall.crm.brand;

/**
 * 品牌会员卡对外统一名称。
 *
 * <p>CRM 卡版本里仍存着旧名（Full愈年卡 / Full愈月卡），只用于 CRM 后台对账；
 * 轻疗端的产品目录、卡面、支付单与订单一律展示「Full愈大会员」，
 * 年卡 / 月卡只作为卡期（validDays）与价格上的区分。改名只需改这一处。</p>
 */
public final class BrandMemberNaming {
    /** 对外统一展示名；改名只改这里。 */
    public static final String DISPLAY_NAME = "Full愈大会员";

    private BrandMemberNaming() {
    }
}