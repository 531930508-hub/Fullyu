package com.macro.mall.utils;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.membercard.calc.MemberCardPriceEngine;

import java.time.LocalDate;
import java.util.Objects;

/**
 * 大会员早鸟价（年卡提前价）落单后的改约约束。
 *
 * <p>早鸟价是「提前预约」这个行为换来的折让：服务日期必须晚于今天才成立。
 * 一旦按早鸟价落单，改约只能挪到原预约日期及之后；把日期改早等于用更短的提前期
 * 继续享受提前价，属于绕过比价。要改到更早的日期，只能取消本单后重新下单，
 * 由结算页按新的服务日期重新比价。</p>
 *
 * <p>priceSource 由结算页写入（见 {@link com.macro.mall.service.OrderService} 的
 * selectPriceSource / payCheckout）；前台现金直收、按原价结算的单没有这一列，天然不受限制。</p>
 */
public final class EarlyBirdPrice {

    private EarlyBirdPrice() {
    }

    /**
     * 该优惠来源是否为大会员早鸟价（年卡提前价）。
     */
    public static boolean isEarlyBird(Integer priceSource) {
        return Objects.equals(MemberCardPriceEngine.SOURCE_CARD_ADVANCE, priceSource);
    }

    /**
     * 早鸟价单不允许把预约日期改早，改早直接报错拦截。
     *
     * @param priceSource 订单落单时选中的优惠来源
     * @param bookedDate  原预约日期（优先 s_order.advance_date，老单退回「未被服务明细」里最早的服务日期）
     * @param newDate     改约后的服务日期
     */
    public static void assertNotEarlier(Integer priceSource, LocalDate bookedDate, LocalDate newDate) {
        if (!isEarlyBird(priceSource) || bookedDate == null || newDate == null) {
            return;
        }
        if (newDate.isBefore(bookedDate)) {
            throw new BusinessException("本单已享大会员早鸟价（原预约日期 " + bookedDate
                    + "），不允许改到更早的日期 " + newDate
                    + "。如需改到更早的日期，请取消本单后重新下单预约");
        }
    }
}