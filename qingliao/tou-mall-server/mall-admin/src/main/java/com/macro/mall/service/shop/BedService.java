package com.macro.mall.service.shop;

import cn.hutool.core.date.DateTime;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.entity.Bed;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.enums.NormalState;
import com.macro.mall.mapper.BedMapper;
import com.macro.mall.service.MassagistSchedulesService;
import com.macro.mall.service.MassagistService;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.utils.DateUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 服务类
 *
 * @author zkl
 * @date 2025/05/30
 */
@Service
public class BedService extends BaseService<BedMapper, Bed> {

    @Autowired
    MassagistSchedulesService massagistSchedulesService;
    @Autowired
    MassagistService massagistService;

    @Override
    protected QueryWrapper<Bed> buildWrapper(Map<String, Object> params, QueryWrapper<Bed> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .like("name")
                .like("serialNumber")
                .equal("status")
                .equal("type")
                .equal("shop_id")
                .getQueryWrapper();
    }

    public List<Bed> listByShopId(Long shopId) {
        LambdaQueryWrapper<Bed> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Bed::getShopId, shopId);
        return list(lqw);
    }

    public List<Bed> listByRoomId(Long roomId) {
        LambdaQueryWrapper<Bed> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Bed::getRoomId, roomId);
        return list(lqw);
    }

    public void remove(Long id) {
        synchronized (NormalConst.bookingLockKey.intern()) {
            Bed bed = getById(id);
            bed.setStatus(NormalState.INVALID.getValue());
            updateById(bed);
        }
    }

    public List<Bed> listByStatusAndTypeAndShopId(Integer status, Integer type, Long shopId) {
        LambdaQueryWrapper<Bed> queryWrapper = new LambdaQueryWrapper<>();
        if (status != null) {
            queryWrapper.eq(Bed::getStatus, status);
        }
        queryWrapper.eq(Bed::getType, type);
        if (shopId != null) {
            queryWrapper.eq(Bed::getShopId, shopId);
        }
        return list(queryWrapper);
    }

    public String findNameById(Long bedId) {
        LambdaQueryWrapper<Bed> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(Bed::getId, bedId);
        queryWrapper.select(Bed::getName);
        Bed bed = getOnlyOne(queryWrapper);
        if (bed == null) {
            return null;
        }
        return bed.getName();
    }

    public Map<Long, Integer> findTypeMapByIdList(List<Long> bedIdList) {
        if (CollectionUtils.isEmpty(bedIdList)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<Bed> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.in(Bed::getId, bedIdList);
        queryWrapper.select(Bed::getId, Bed::getType);
        List<Bed> list = list(queryWrapper);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyMap();
        }
        return list.stream().collect(Collectors.toMap(Bed::getId, Bed::getType));
    }

    public Integer findTypeById(Long bedId) {
        LambdaQueryWrapper<Bed> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(Bed::getId, bedId);
        queryWrapper.select(Bed::getType);
        Bed bed = getOnlyOne(queryWrapper);
        if (bed == null) {
            return null;
        }
        return bed.getType();
    }

    /**
     * 获取门店干湿区最大床位数
     *
     * @param shopId
     * @return
     */
    public Long findMaxBedCount(Long shopId, Integer type) {
        LambdaQueryWrapper<Bed> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Bed::getStatus, NormalState.EFFECTIVE.getValue());
        if (shopId != null) {
            queryWrapper.eq(Bed::getShopId, shopId);
        }
        if (type != null) {
            queryWrapper.eq(Bed::getType, type);
        }
        queryWrapper.select(Bed::getId, Bed::getType);
        List<Bed> bedList = list(queryWrapper);
        return bedList.stream().collect(Collectors.groupingBy(Bed::getType, Collectors.counting())).values().stream()
                .max(Long::compare).orElse(1L);
    }

    public List<Bed> findAfterCodeBedList(List<Long> cancelBedIdList) {
        List<Bed> cancelBedList = listByIds(cancelBedIdList);
        if (cancelBedList.size() == 0) {
            return Collections.emptyList();
        }
        List<String> numberList = new ArrayList<>(cancelBedList.size());
        Integer type = null;
        for (Bed bed : cancelBedList) {
            type = bed.getType();
            numberList.add(bed.getSerialNumber());
        }
        LambdaQueryWrapper<Bed> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Bed::getType, type);
        if (!CollectionUtils.isEmpty(numberList)) {
            List<String> collect = numberList.stream().sorted().collect(Collectors.toList());
            queryWrapper.gt(Bed::getSerialNumber, collect.get(0));
        }
        queryWrapper.orderByAsc(Bed::getSerialNumber);
        return list(queryWrapper);
    }

    public Bed addOrChange(Bed bed) {
        synchronized (NormalConst.bookingLockKey.intern()) {
            saveOrUpdate(bed);
            return bed;
        }
    }

    public List<Long> sortById(List<Long> idList) {
        if (CollectionUtils.isEmpty(idList)) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<Bed> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.in(Bed::getId, idList);
        queryWrapper.select(Bed::getId);
        queryWrapper.orderByAsc(Bed::getSerialNumber);
        return list(queryWrapper).stream().map(Bed::getId).collect(Collectors.toList());
    }
    //小程序用判断项目的接单最大人数
    public Long maxMaxPeopleCount(Long shopId, Integer type, String date) {
        Integer projectIdNew=type;
        if(type==3){
            type=2;
            projectIdNew=4;
        }
        Integer projectId=projectIdNew;
        LambdaQueryWrapper<Bed> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Bed::getStatus, NormalState.EFFECTIVE.getValue());
        if (shopId != null) {
            queryWrapper.eq(Bed::getShopId, shopId);
        }
        if (type != null) {
            queryWrapper.eq(Bed::getType, type);
        }
        queryWrapper.select(Bed::getId, Bed::getType);
        List<Bed> bedList = list(queryWrapper);
        long maxBebCount= bedList.stream().collect(Collectors.groupingBy(Bed::getType, Collectors.counting())).values().stream()
                .max(Long::compare).orElse(1L);
        //获取会这个项目的最大人数
        List<Long> massagistIds=massagistService.list().stream().filter(t->t.getProjectArr().contains(projectId.toString())).map(Massagist::getId).collect(Collectors.toList());
        //获取当天值日的人数
        List<MassagistSchedules> massagistSchedulesList=massagistSchedulesService.simpleListByDateAndShopId(date,shopId);
        List<MassagistSchedules> doMassagist=new ArrayList<>();
        if(massagistSchedulesList.size()>0){
            massagistSchedulesList.forEach(t->{
                if(massagistIds.contains(t.getMassagistId())){
                    doMassagist.add(t);
                }
            });
        }
        long poepleCount=doMassagist.size();
        if(poepleCount<maxBebCount){
            return poepleCount;
        }else {
            return maxBebCount;
        }
    }
}