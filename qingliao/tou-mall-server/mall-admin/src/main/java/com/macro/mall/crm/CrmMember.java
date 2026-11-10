package com.macro.mall.crm;

/**
 * 会员中心返回的会员摘要。积分只在 CRM 记账，轻疗不再本地累加。
 */
public class CrmMember {
    private String memberId;
    private String memberNo;
    private String name;
    private String status;
    private long balance;
    /** 本次调用是否在 CRM 新建了会员 */
    private boolean created;
    /** 本次调用是否把该业务身份绑定到已有会员 */
    private boolean bound;

    public String getMemberId() {
        return memberId;
    }

    public void setMemberId(String memberId) {
        this.memberId = memberId;
    }

    public String getMemberNo() {
        return memberNo;
    }

    public void setMemberNo(String memberNo) {
        this.memberNo = memberNo;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public long getBalance() {
        return balance;
    }

    public void setBalance(long balance) {
        this.balance = balance;
    }

    public boolean isCreated() {
        return created;
    }

    public void setCreated(boolean created) {
        this.created = created;
    }

    public boolean isBound() {
        return bound;
    }

    public void setBound(boolean bound) {
        this.bound = bound;
    }
}
