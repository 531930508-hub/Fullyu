package com.macro.mall.common.exception;

/**
 * 业务逻辑异常
 *
 * @Author: jinlong
 * @Date: 2020/4/26 9:39
 */
public class BusinessException extends RuntimeException {
    protected int status = 500;

    public int getStatus() {
        return status;
    }

    public void setStatus(int status) {
        this.status = status;
    }

    public BusinessException() {
    }

    public BusinessException(String message, int status) {
        super(message);
        this.status = status;
    }

    public BusinessException(String message) {
        super(message);
    }

    public BusinessException(String message, Throwable cause) {
        super(message, cause);
    }

    public BusinessException(Throwable cause) {
        super(cause);
    }

    public BusinessException(String message, Throwable cause, boolean enableSuppression, boolean writableStackTrace) {
        super(message, cause, enableSuppression, writableStackTrace);
    }
}