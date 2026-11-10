package com.macro.mall.common.exception;

/**
 * Created by oahnus on 2025/6/17
 *
 * @author oahnus
 */
public class MyOptimisticLockException extends RuntimeException {
    public MyOptimisticLockException() {
        super("数据已更新");
    }
    public MyOptimisticLockException(String message) {
        super(message);
    }
}
