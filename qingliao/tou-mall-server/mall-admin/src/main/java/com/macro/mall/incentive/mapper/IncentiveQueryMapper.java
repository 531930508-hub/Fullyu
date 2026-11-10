package com.macro.mall.incentive.mapper;

import com.macro.mall.incentive.model.CustomerVisit;
import com.macro.mall.incentive.model.ServiceDetailRow;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 激励口径专用的只读查询。所有方法都已内置有效服务订单过滤：
 * 已支付、已到店/已完成、产品单、非券包单、手机号非空、排除内部账号。
 */
public interface IncentiveQueryMapper {

    List<ServiceDetailRow> selectServiceDetails(@Param("shopIds") List<Long> shopIds,
                                                @Param("massagistId") Long massagistId,
                                                @Param("start") LocalDateTime start,
                                                @Param("end") LocalDateTime end);

    List<ServiceDetailRow> selectServiceDetailsForMassagists(@Param("shopIds") List<Long> shopIds,
                                                            @Param("massagistIds") List<Long> massagistIds,
                                                            @Param("start") LocalDateTime start,
                                                            @Param("end") LocalDateTime end);

    List<ServiceDetailRow> selectServiceDetailsByPayDate(@Param("shopIds") List<Long> shopIds,
                                                         @Param("massagistId") Long massagistId,
                                                         @Param("start") LocalDate start,
                                                         @Param("end") LocalDate end);

    List<CustomerVisit> selectVisits(@Param("shopIds") List<Long> shopIds,
                                     @Param("massagistId") Long massagistId,
                                     @Param("start") LocalDateTime start,
                                     @Param("end") LocalDateTime end);

    List<CustomerVisit> selectVisitsByPhones(@Param("phones") List<String> phones,
                                             @Param("historyStart") LocalDateTime historyStart,
                                             @Param("end") LocalDateTime end);

    LocalDate selectEarliestServiceDate(@Param("massagistId") Long massagistId);
}
