package com.macro.mall.pay;

/**
 * 退款受理结果。
 *
 * <p>退款不是「成功 / 失败」两态：网关超时、签名后网络断开时，渠道可能已经受理，
 * 只是我们没拿到应答。这种单必须落成 {@link Status#UNKNOWN} 等回调/查询收敛，
 * 绝不能当成失败让运营重点一次——那正是重复退款的来源。</p>
 */
public class RefundPayResult {

    public enum Status {
        /** 渠道明确受理且已成功 */
        ACCEPTED,
        /** 渠道明确受理，处理中，等回调或查询 */
        PROCESSING,
        /** 渠道明确拒绝（余额不足、参数错等），可以安全重试 */
        FAILED,
        /** 请求已发出但结果未知（网络异常、应答异常），禁止直接重发 */
        UNKNOWN
    }

    private final Status status;
    private final String hfSeqId;
    private final String reqSeqId;
    private final String code;
    private final String message;

    private RefundPayResult(Status status, String hfSeqId, String reqSeqId, String code, String message) {
        this.status = status;
        this.hfSeqId = hfSeqId;
        this.reqSeqId = reqSeqId;
        this.code = code;
        this.message = message;
    }

    public static RefundPayResult accepted(String hfSeqId, String reqSeqId, String code) {
        return new RefundPayResult(Status.ACCEPTED, hfSeqId, reqSeqId, code, null);
    }

    public static RefundPayResult processing(String hfSeqId, String reqSeqId, String code) {
        return new RefundPayResult(Status.PROCESSING, hfSeqId, reqSeqId, code, null);
    }

    public static RefundPayResult failed(String code, String message) {
        return new RefundPayResult(Status.FAILED, null, null, code, message);
    }

    public static RefundPayResult unknown(String code, String message) {
        return new RefundPayResult(Status.UNKNOWN, null, null, code, message);
    }

    public boolean isFailed() {
        return Status.FAILED == status;
    }

    public boolean isUnknown() {
        return Status.UNKNOWN == status;
    }

    public boolean isAccepted() {
        return Status.ACCEPTED == status || Status.PROCESSING == status;
    }

    public Status getStatus() {
        return status;
    }

    public String getHfSeqId() {
        return hfSeqId;
    }

    public String getReqSeqId() {
        return reqSeqId;
    }

    public String getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }
}
