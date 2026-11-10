package com.macro.mall.service;

import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.mapper.MassagistSchedulesMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.utils.DateUtil;
import com.macro.mall.utils.RedisUtil;
import org.apache.logging.log4j.util.Strings;
import org.checkerframework.checker.units.qual.Mass;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import javax.validation.constraints.NotNull;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 疗愈师排班 服务类
 *
 * @author zkl
 * @date 2025/06/05
 */
@Service
public class MassagistSchedulesService extends BaseService<MassagistSchedulesMapper, MassagistSchedules> {
    @Override
    protected QueryWrapper<MassagistSchedules> buildWrapper(Map<String, Object> params, QueryWrapper<MassagistSchedules> queryWrapper) {

        Object shopId = params.get("shop_id");
        if (shopId != null) {
            if (Boolean.TRUE.equals(params.get("include_target"))) queryWrapper.and(q -> q.eq("shop_id",shopId).or().eq("target_shop_id",shopId));
            else queryWrapper.eq("shop_id",shopId);
        }
        Object status = params.get("status");
        if (status != null) {
            int value = Integer.parseInt(status.toString());
            if (value < 0 || value > 3) throw new BusinessException("合作状态不正确");
            queryWrapper.inSql("massagist_id", "select id from s_massagist where status=" + value);
        }
        return WrapperBuilder.init(queryWrapper, params)
                .equal("massagist_id")
                .equal("target_shop_id")
                .equal("day")
                .getQueryWrapper();
    }

    @Autowired
    @Lazy
    MassagistService massagistService;
    @Autowired
    @Lazy
    OrderDetailService orderDetailService;
    @Autowired
    RedisUtil redisUtil;

    @Autowired
    @Lazy
    RoundScheduleService roundScheduleService;

    @Autowired
    ControllerLogService controllerLogService;

    private final String massagistIdSortKey = "massagistIdSort";

    /** 同一事务内保存前后快照，日志失败时不得把清班当作成功。 */
    public void recordScheduleChange(String action, Long shopId, Long massagistId, Object before, Object after) {
        com.macro.mall.entity.ControllerLog entry = new com.macro.mall.entity.ControllerLog();
        entry.setTitle("排班变更:" + shopId + ":" + massagistId + ":" + action);
        entry.setSource("schedule-audit");
        entry.setCreateTime(LocalDateTime.now());
        JSONObject values = new JSONObject();
        values.put("action", action); values.put("shopId", shopId); values.put("massagistId", massagistId);
        values.put("before", before); values.put("after", after);
        org.springframework.security.core.Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof com.macro.mall.bo.AdminUserDetails) {
            com.macro.mall.model.UmsAdmin operator = ((com.macro.mall.bo.AdminUserDetails) auth.getPrincipal()).getUmsAdmin();
            entry.setCreateUser(operator.getId());
            values.put("operatorName", StringUtils.hasText(operator.getNickName()) ? operator.getNickName() : operator.getUsername());
        } else {
            values.put("operatorName", "系统");
        }
        entry.setParams(JSONObject.toJSONString(values));
        if (!controllerLogService.save(entry)) throw new BusinessException("排班操作记录保存失败，请重试");
    }

    private void validateSchedule(MassagistSchedules value) {
        if (value == null || value.getMassagistId() == null || value.getShopId() == null || value.getDay() == null)
            throw new BusinessException("请选择疗愈师、门店和排班日期");
        if (value.getStartTime() == null || value.getEndTime() == null || !value.getEndTime().isAfter(value.getStartTime()))
            throw new BusinessException("排班结束时间必须晚于开始时间");
    }

    /** 仅清除指定人、指定原店、开始时刻尚未生效的排班，保留历史和正在执行的排班。 */
    @Transactional(rollbackFor = Exception.class)
    public int clearFuture(Long massagistId, Long shopId, LocalDateTime now) {
        if (massagistId == null || shopId == null || now == null) throw new BusinessException("请选择疗愈师和门店");
        synchronized (NormalConst.bookingLockKey.intern()) {
            List<MassagistSchedules> candidates = list(new LambdaQueryWrapper<MassagistSchedules>()
                    .eq(MassagistSchedules::getMassagistId, massagistId)
                    .eq(MassagistSchedules::getShopId, shopId).ge(MassagistSchedules::getDay, now.toLocalDate()));
            List<MassagistSchedules> selected = candidates.stream().filter(s -> massagistId.equals(s.getMassagistId())
                    && shopId.equals(s.getShopId()) && s.getDay() != null && s.getStartTime() != null
                    && s.getDay().atTime(s.getStartTime()).isAfter(now)).collect(Collectors.toList());
            if (!selected.isEmpty()) {
                if (!removeByIds(selected.stream().map(MassagistSchedules::getId).collect(Collectors.toList())))
                    throw new BusinessException("清除排班失败，请重试");
                Set<String> resetKeys = new HashSet<>();
                for (MassagistSchedules s : selected) {
                    recordScheduleChange("清除未来未生效排班", shopId, massagistId, s, null);
                    if (s.getTargetShopId() != null && s.getTargetShopId() > 0) clearMassgistSortMap(s.getTargetShopId());
                    if (resetKeys.add(s.getDay() + "|" + shopId)) resetUnstartedRound(s.getDay(), shopId);
                    if (s.getTargetShopId() != null && s.getTargetShopId() > 0
                            && resetKeys.add(s.getDay() + "|" + s.getTargetShopId())) resetUnstartedRound(s.getDay(), s.getTargetShopId());
                }
                clearMassgistSortMap(shopId);
            }
            return selected.size();
        }
    }

    public PageInfo pageInfo(Map<String, Object> params) {
        Map<String,Object> query = new HashMap<>(params);
        query.put("includeTarget",true);
        query.putIfAbsent("status",1);
        int size = query.get("size") == null ? 10 : Integer.parseInt(query.get("size").toString());
        query.put("size",Math.max(1,Math.min(100,size)));
        PageInfo<MassagistSchedules> result = page(query);
        buildDetail(result.getList());
        return result;
    }

    public void buildDetail(List<MassagistSchedules> schedulesList) {
        if (!CollectionUtils.isEmpty(schedulesList)) {
            List<Long> massagistIds = schedulesList.stream().filter(e -> !ObjUtil.isEmpty(e.getMassagistId())).map(MassagistSchedules::getMassagistId).collect(Collectors.toList());
            List<Massagist> massagistList = massagistService.listByIds(massagistIds);
            Map<Long, Massagist> massagistMap = massagistList.stream().collect(Collectors.toMap(Massagist::getId, s -> s));
            schedulesList.forEach(e -> {
                Long massagistId = e.getMassagistId();
                Massagist massagist = massagistMap.get(massagistId);
                if (massagist == null) return;
                e.setMassagistName(massagist.getName());
                e.setMassagistShopId(massagist.getShopId());
                Long effectiveShop = e.getTargetShopId() != null && e.getTargetShopId() > 0 ? e.getTargetShopId() : e.getShopId();
                List<Long> massagistSchedulesList = getMassagistSchedulesList(DateUtil.toYYYYMMDD(e.getDay()), effectiveShop);
                e.setSequence(massagistSchedulesList.indexOf(massagistId) + 1);
            });
            schedulesList.sort(Comparator
                    .comparing(MassagistSchedules::getDay).reversed()
                    .thenComparingInt(MassagistSchedules::getSequence));
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public MassagistSchedules saveOrUpd(MassagistSchedules value) {
        return addOrChange(value);
    }

    /***
     * 获取当天排班表以及调店的人员列表
     * */
    public List<MassagistSchedules> simpleListByDateAndShopId(String day, Long shopId) {
        LambdaQueryWrapper<MassagistSchedules> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(MassagistSchedules::getDay, day);
        if (shopId != null) {
            queryWrapper.and(e ->e.and(t->t.eq(MassagistSchedules::getShopId, shopId).eq(MassagistSchedules::getTargetShopId,0L)).or().eq(MassagistSchedules::getTargetShopId, shopId));

           // queryWrapper.eq(MassagistSchedules::getShopId, shopId);
        }
        queryWrapper.select(MassagistSchedules::getShopId, MassagistSchedules::getMassagistId, MassagistSchedules::getStartTime, MassagistSchedules::getEndTime, MassagistSchedules::getDay);
        return list(queryWrapper);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<MassagistSchedules> batchAdd(MassagistSchedules massagistSchedules) {
        synchronized (NormalConst.bookingLockKey.intern()) {
            if (massagistSchedules == null || massagistSchedules.getShopId() == null)
                throw new BusinessException("请选择门店");
            if (massagistSchedules.getStartTime() == null || massagistSchedules.getEndTime() == null
                    || !massagistSchedules.getEndTime().isAfter(massagistSchedules.getStartTime()))
                throw new BusinessException("排班结束时间必须晚于开始时间");
            if (CollectionUtils.isEmpty(massagistSchedules.getDates())) throw new BusinessException("请选择日期");
            List<String> dates;
            try {
                dates = massagistSchedules.getDates().stream().map(LocalDate::parse)
                        .distinct().sorted().map(LocalDate::toString).collect(Collectors.toList());
            } catch (Exception e) { throw new BusinessException("排班日期格式不正确"); }
            if (CollectionUtils.isEmpty(massagistSchedules.getMassagistIdList())) throw new BusinessException("请选择疗愈师");
            List<Long> massagistIdList = massagistSchedules.getMassagistIdList().stream().distinct().collect(Collectors.toList());
            for (Long id : massagistIdList) {
                Massagist person = id == null ? null : massagistService.getById(id);
                if (person == null || !Objects.equals(person.getShopId(), massagistSchedules.getShopId()))
                    throw new BusinessException("疗愈师与所属门店不一致，跨店请使用调店");
            }
            LambdaQueryWrapper<MassagistSchedules> lqw = new LambdaQueryWrapper<>();
            lqw.in(MassagistSchedules::getMassagistId, massagistIdList);
//            lqw.eq(MassagistSchedules::getShopId, massagistSchedules.getShopId());
            lqw.in(MassagistSchedules::getDay, dates);
            lqw.and(e -> e.lt(MassagistSchedules::getStartTime, massagistSchedules.getEndTime())
                    .gt(MassagistSchedules::getEndTime, massagistSchedules.getStartTime())
            );
            List<MassagistSchedules> dbList = list(lqw);
            if (dbList.size() > 0) {
                List<Massagist> massagistList = massagistService.listByIds(massagistIdList);
                Map<Long, String> massagistNameMap = massagistList.stream().collect(Collectors.toMap(Massagist::getId, Massagist::getName));
                StringBuilder builder = new StringBuilder();
                for (int i = 0; i < dbList.size(); i++) {
                    builder.append(massagistNameMap.get(dbList.get(i).getMassagistId()));
                    if (i < dbList.size() - 1) {
                        builder.append("、");
                    }
                }
                throw new BusinessException(builder.toString() + "已有此时段的排班记录");
            }

            List<MassagistSchedules> list = new ArrayList<>(dates.size() + massagistIdList.size());
            dates.forEach(d -> {
                for (Long mId : massagistIdList) {
                    MassagistSchedules m = new MassagistSchedules();
                    m.setShopId(massagistSchedules.getShopId());
                    m.setStartTime(massagistSchedules.getStartTime());
                    m.setEndTime(massagistSchedules.getEndTime());
                    m.setDay(DateUtil.stringToLocalDate(d));
                    //luxin修改了
                    m.setTargetShopId((long) 0);
                    m.setSchedulesType((long) 0);
                    m.setMassagistId(mId);
                    list.add(m);
                }
            });
            if (!saveBatch(list)) throw new BusinessException("批量保存排班失败");
            for (MassagistSchedules created : list)
                recordScheduleChange("批量新增排班", created.getShopId(), created.getMassagistId(), null, created);
            clearMassgistSortMap(massagistSchedules.getShopId());
            for (String d : dates)
                roundScheduleService.removeExistData(LocalDate.parse(d), massagistSchedules.getShopId());
            return list;
        }
    }

    public List<JSONObject> findBookingDatesForPc(Integer maxCount, String yyyyMMdd, Long shopId) {
        String currentDateCode = DateUtil.getCurrentDateCode();
        QueryWrapper<MassagistSchedules> queryWrapper = new QueryWrapper();
        if (StrUtil.isNotBlank(yyyyMMdd)) {
            queryWrapper.and(e -> e.ge("day", currentDateCode).or().eq("day", yyyyMMdd));
            maxCount++;
        } else {
            queryWrapper.ge("day", currentDateCode);
        }
        queryWrapper.eq("shop_id", shopId);
        queryWrapper.select("distinct day");
        queryWrapper.groupBy("day");
        queryWrapper.last(" limit " + maxCount);
        if (StrUtil.isNotBlank(yyyyMMdd)) {
            queryWrapper.orderByAsc("case when day = '" + yyyyMMdd + "' then 0 else 1 end, day");
        } else {
            queryWrapper.orderByAsc("day");
        }
        List<MassagistSchedules> list = list(queryWrapper);
        List<JSONObject> jsonObjectList = new ArrayList<>();
        LocalDate now = LocalDate.now();
        for (int i = 0; i < list.size(); i++) {
            MassagistSchedules massagistSchedules = list.get(i);
            LocalDate day = massagistSchedules.getDay();
            String mmdd = DateUtil.toMMDD(day);
            if (day.isEqual(now)) {
                mmdd = "今天";
            } else if (day.isEqual(now.plusDays(1))) {
                mmdd = "明天";
            }
            String yyyymmdd = DateUtil.toYYYYMMDD(day);
            jsonObjectList.add(JSONObject.of("label", mmdd, "value", yyyymmdd));
        }
        return jsonObjectList;
    }

    //luxin 新增
    public  List<JSONObject> findBookingDatesForPcNew(long shopId, Integer maxCount, String yyyyMMdd) {
        String currentDateCode = DateUtil.getCurrentDateCode();
        QueryWrapper<MassagistSchedules> queryWrapper = new QueryWrapper();
        queryWrapper.eq("shop_id",shopId);
        if (StrUtil.isNotBlank(yyyyMMdd)) {
            queryWrapper.and(e -> e.ge("day", currentDateCode).or().eq("day", yyyyMMdd));
            maxCount++;
        } else {
            queryWrapper.ge("day", currentDateCode);
        }
        queryWrapper.select("distinct day");
        queryWrapper.groupBy("day");
        queryWrapper.last(" limit " + maxCount);
        if (StrUtil.isNotBlank(yyyyMMdd)) {
            queryWrapper.orderByAsc("case when day = '" + yyyyMMdd + "' then 0 else 1 end, day");
        } else {
            queryWrapper.orderByAsc("day");
        }
        List<MassagistSchedules> list = list(queryWrapper);
        List<JSONObject> jsonObjectList = new ArrayList<>();
        LocalDate now = LocalDate.now();
        for (int i = 0; i < list.size(); i++) {
            MassagistSchedules massagistSchedules = list.get(i);
            LocalDate day = massagistSchedules.getDay();
            String mmdd = DateUtil.toMMDD(day);
            if (day.isEqual(now)) {
                mmdd = "今天";
            } else if (day.isEqual(now.plusDays(1))) {
                mmdd = "明天";
            }
            String yyyymmdd = DateUtil.toYYYYMMDD(day);
            jsonObjectList.add(JSONObject.of("label", mmdd, "value", yyyymmdd));
        }
        return jsonObjectList;
    }


    public List<JSONObject> findBookingDates(Integer maxCount, Long shopId) {
        String currentDateCode = DateUtil.getCurrentDateCode();
        QueryWrapper<MassagistSchedules> queryWrapper = new QueryWrapper();
        queryWrapper.eq("shop_id", shopId);
        queryWrapper.ge("day", currentDateCode);
        queryWrapper.select("distinct day");
        queryWrapper.groupBy("day");
        queryWrapper.last(" limit " + maxCount);
        queryWrapper.orderByAsc("day");
        List<MassagistSchedules> list = list(queryWrapper);
        List<JSONObject> jsonObjectList = new ArrayList<>();
        LocalDate now = LocalDate.now();
        for (int i = 0; i < list.size(); i++) {
            MassagistSchedules massagistSchedules = list.get(i);
            LocalDate day = massagistSchedules.getDay();
            String englishLabel = null;
            String mmdd = DateUtil.toMMDD(day);
            if (day.isEqual(now)) {
                mmdd = "今天";
                englishLabel = "Today";
            } else if (day.isEqual(now.plusDays(1))) {
                mmdd = "明天";
                englishLabel = "Tmmr";
            }
            String yyyymmdd = DateUtil.toYYYYMMDD(day);
            jsonObjectList.add(JSONObject.of("label", mmdd, "englishLabel", englishLabel, "value", yyyymmdd));
        }
        return jsonObjectList;
    }

    @Transactional(rollbackFor = Exception.class)
    public MassagistSchedules addOrChange(MassagistSchedules value) {
        synchronized (NormalConst.bookingLockKey.intern()) {
            validateSchedule(value);
            MassagistSchedules before = value.getId() == null ? null : getById(value.getId());
            if (value.getId() != null && before == null) throw new BusinessException("排班记录不存在");
            if (Objects.equals(value.getSchedulesType(), 1L) || (value.getTargetShopId() != null && value.getTargetShopId() > 0)
                    || (before != null && Objects.equals(before.getSchedulesType(), 1L)))
                throw new BusinessException("临时调店请使用调店入口");
            Massagist person = massagistService.getById(value.getMassagistId());
            if (person == null || !Objects.equals(person.getShopId(), value.getShopId()))
                throw new BusinessException("疗愈师与所属门店不一致，跨店请使用调店");
            value.setSchedulesType(0L); value.setTargetShopId(0L);
            LambdaQueryWrapper<MassagistSchedules> query = new LambdaQueryWrapper<MassagistSchedules>()
                    .eq(MassagistSchedules::getMassagistId, value.getMassagistId())
                    .eq(MassagistSchedules::getDay, value.getDay())
                    .lt(MassagistSchedules::getStartTime, value.getEndTime())
                    .gt(MassagistSchedules::getEndTime, value.getStartTime());
            if (value.getId() != null) query.ne(MassagistSchedules::getId, value.getId());
            if (getOnlyOne(query) != null) throw new BusinessException("该疗愈师在此时段已有排班，请先核对或清除未来排班");
            if (!saveOrUpdate(value)) throw new BusinessException("保存排班失败");
            recordScheduleChange(before == null ? "新增排班" : "编辑排班", value.getShopId(), value.getMassagistId(), before, value);
            clearMassgistSortMap(value.getShopId());
            if (before != null && !Objects.equals(before.getShopId(), value.getShopId())) clearMassgistSortMap(before.getShopId());
            resetUnstartedRound(value.getDay(), value.getShopId());
            if (before != null && !Objects.equals(before.getDay(), value.getDay())) resetUnstartedRound(before.getDay(), before.getShopId());
            return value;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        synchronized (NormalConst.bookingLockKey.intern()) {
            MassagistSchedules before = getById(id);
            if (before == null) throw new BusinessException("排班记录不存在");
            if (!removeById(id)) throw new BusinessException("删除排班失败");
            recordScheduleChange("删除排班",before.getShopId(),before.getMassagistId(),before,null);
            clearMassgistSortMap(before.getShopId());
            if (before.getTargetShopId() != null && before.getTargetShopId() > 0) clearMassgistSortMap(before.getTargetShopId());
            resetUnstartedRound(before.getDay(), before.getShopId());
            resetUnstartedRound(before.getDay(), before.getTargetShopId());
        }
    }

    public List<MassagistSchedules> listByMassagistIdsAndDay(List<Long> massagistIds, LocalDate localDate, Long shopId) {
        LambdaQueryWrapper<MassagistSchedules> lqw = new LambdaQueryWrapper<>();
        lqw.in(MassagistSchedules::getMassagistId, massagistIds);
        lqw.in(MassagistSchedules::getDay, localDate);
        lqw.eq(MassagistSchedules::getShopId, shopId);
        lqw.eq(MassagistSchedules::getTargetShopId, 0);
        List<MassagistSchedules> list = list(lqw);
        return list;
    }

    /** 人员当天变动后，重置该店当天尚未开始派单的最新轮次，使轮牌按新名单重建（与批量新增一致）。 */
    private void resetUnstartedRound(LocalDate day, Long shopId) {
        if (day == null || shopId == null || shopId <= 0) return;
        roundScheduleService.removeExistData(day, shopId);
    }

    /**
     * 清除排班队列
     *
     * @param shopId
     */
    public void clearMassgistSortMap(Long shopId) {
        if (shopId == null) {
            return;
        }
        String key = massagistIdSortKey + "-" + shopId + ":";
        Set<String> keys = redisUtil.getKeys(key);
        redisUtil.batchDelete(keys);
    }

    /**
     * 根据日期获取排班，并加入缓存
     *
     * @param day
     * @param shopId
     * @return
     */
    public List<Long> getMassagistSchedulesList(String day, Long shopId) {
        List<Long> massagistIdList;
        String key = massagistIdSortKey + "-" + shopId + ":" + day;
        String massagistIds = redisUtil.getString(key);
        if (Strings.isNotBlank(massagistIds)) {
            massagistIdList = JSONArray.parseArray(massagistIds, Long.class);
        } else {
            List<Long> nativeIds = findSortIdList(day, shopId);
            LinkedHashSet<Long> merged = new LinkedHashSet<>(getMassagistSchedulesListDiaoDian(day, shopId));
            merged.addAll(nativeIds);
            List<Long> sortLinkList = new ArrayList<>(merged);
            if (CollectionUtils.isEmpty(sortLinkList)) {
                throw new BusinessException("没有排班记录");
            }
            massagistIdList = sortLinkList;
            redisUtil.setStringDay(key, JSONObject.toJSONString(sortLinkList), 1);
        }
        return massagistIdList;
    }
    public List<Long> getMassagistSchedulesListDiaoDian(String day, Long shopId){
        LambdaQueryWrapper<MassagistSchedules> lqw = new LambdaQueryWrapper<>();
        lqw.in(MassagistSchedules::getDay, day);
        lqw.eq(MassagistSchedules::getTargetShopId, shopId);
        lqw.eq(MassagistSchedules::getSchedulesType, 1);
        List<MassagistSchedules> list = list(lqw);
        List<Long> massagistIdList = new ArrayList<>();
        list.forEach(s -> {
            massagistIdList.add(s.getMassagistId());
        }
        );
        return massagistIdList;
    }

    /**
     * 根据日期获取排班
     *
     * @param day
     * @return
     */
    private List<Long> findSortIdList(String day, Long shopId) {
        List<Massagist> sortMassagistList = massagistService.sortList(shopId);
        if (CollectionUtils.isEmpty(sortMassagistList)) return new ArrayList<>();
        String sequenceEnableDay = DateUtil.getCurrentDateCode();
        Massagist massagist = sortMassagistList.stream().filter(s -> StringUtils.hasText(s.getSequenceEnableDay())).findFirst().orElse(null);
        if (massagist != null) {
            sequenceEnableDay = massagist.getSequenceEnableDay();
        }
        LocalDate fromDate = DateUtil.stringToLocalDate(sequenceEnableDay);
        LinkedList<Long> mIdList = new LinkedList<>();
        sortMassagistList.forEach(m -> mIdList.add(m.getId()));
        if (day.equals(sequenceEnableDay)) {
            return mIdList;
        } else if (day.compareTo(sequenceEnableDay) < 0) {
            while (true) {
                LocalDate lastDate = DateUtil.addDate(fromDate, -1);
                String lastDay = DateUtil.toYYYYMMDD(lastDate);
                fromDate = lastDate;
                Long last = mIdList.get(mIdList.size() - 1);
                mIdList.removeLast();
                mIdList.addFirst(last);
                if (day.equals(lastDay)) {
                    return mIdList;
                }
            }
        } else {
            while (true) {
                LocalDate nextDate = DateUtil.addDate(fromDate, 1);
                String nextDay = DateUtil.toYYYYMMDD(nextDate);
                fromDate = nextDate;
                Long first = mIdList.get(0);
                mIdList.remove(0);
                mIdList.add(first);
                if (day.equals(nextDay)) {
                    return mIdList;
                }
            }
        }
    }


    public List<Long> massagistListByTime(LocalDate localDate, LocalTime startTime, LocalTime endTime, Long shopId) {
        LambdaQueryWrapper<MassagistSchedules> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MassagistSchedules::getDay, localDate);
        lqw.le(MassagistSchedules::getStartTime, startTime);
        lqw.ge(MassagistSchedules::getEndTime, endTime);
        lqw.eq(MassagistSchedules::getShopId, shopId);
        List<MassagistSchedules> massagistSchedules = list(lqw);
        if (CollectionUtils.isEmpty(massagistSchedules)) {
            return Collections.emptyList();
        }
        List<Long> collect = massagistSchedules.stream().map(MassagistSchedules::getMassagistId).distinct().collect(Collectors.toList());
        return collect;
    }

    /**
     * 获取周期工作时长，若时间范围包含当天，获取当天工作时长
     *
     * @param startTime
     * @param endTime
     * @return
     */
    public Map<String, JSONObject> periodWorkTimeMapByDateRange(String startTime, String endTime, Long shopId) {
        LambdaQueryWrapper<MassagistSchedules> lqw = new LambdaQueryWrapper<>();
        lqw.between(MassagistSchedules::getDay, startTime, endTime);
        if (shopId != null) {
            lqw.eq(MassagistSchedules::getShopId, shopId);
            //添加调店人员Id
           // lqw.and(e ->e.and(t->t.eq(MassagistSchedules::getShopId, shopId).eq(MassagistSchedules::getTargetShopId,0L)).or().eq(MassagistSchedules::getTargetShopId, shopId));

        }
        List<MassagistSchedules> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return new HashMap<>();
        }
        LocalDate date = LocalDate.now();
        list = list.stream()
                .filter(schedule -> {
                    LocalTime start = schedule.getStartTime();
                    LocalTime end = schedule.getEndTime();
                    return start != null && end != null && !end.isBefore(start);
                }).collect(Collectors.toList());
        Map<String, Double> dateRangeMap = list.stream().collect(Collectors.groupingBy(
                e -> DateUtil.toYYYYMM(e.getDay()) + "|" + e.getMassagistId(),
                Collectors.collectingAndThen(
                        Collectors.summingDouble(schedule -> {
                            LocalTime start = schedule.getStartTime();
                            LocalTime end = schedule.getEndTime();
                            long minutes = DateUtil.diffMinutes(start, end);
                            return minutes / 60.0;
                        }),
                        totalHours -> Math.round(totalHours * 10) / 10.0
                )
        ));
        Map<String, Double> currentDateMap = list.stream().filter(s -> date.equals(s.getDay())).collect(Collectors.groupingBy(
                e -> DateUtil.toYYYYMM(e.getDay()) + "|" + e.getMassagistId(),
                Collectors.collectingAndThen(
                        Collectors.summingDouble(schedule -> {
                            LocalTime start = schedule.getStartTime();
                            LocalTime end = schedule.getEndTime();
                            long minutes = DateUtil.diffMinutes(start, end);
                            return minutes / 60.0;
                        }),
                        totalHours -> Math.round(totalHours * 10) / 10.0
                )
        ));
        Set<String> allMassagistIds = Stream.concat(dateRangeMap.keySet().stream(), currentDateMap.keySet().stream()).collect(Collectors.toSet());
        return allMassagistIds.stream()
                .collect(Collectors.toMap(
                        key -> key,
                        key -> {
                            JSONObject json = new JSONObject();
                            double rangeValue = dateRangeMap.getOrDefault(key, 0.0);
                            double currentValue = currentDateMap.getOrDefault(key, 0.0);
                            json.put("dateRange", rangeValue);
                            json.put("currentDate", currentValue);
                            return json;
                        }
                ));
    }

    public Map<String, JSONObject> periodWorkTimeMapByDateRangeNew(String startTime, String endTime, Long shopId) {
        return periodWorkTimeMapByDateRangeNew(startTime, endTime, shopId, null);
    }

    public Map<String, JSONObject> periodWorkTimeMapByDateRangeNew(String startTime, String endTime, Long shopId, List<Long> massagistIds) {
        if (massagistIds != null && massagistIds.isEmpty()) return Collections.emptyMap();
        LambdaQueryWrapper<MassagistSchedules> lqw = new LambdaQueryWrapper<>();
        lqw.between(MassagistSchedules::getDay, startTime, endTime);
        if (massagistIds != null) lqw.in(MassagistSchedules::getMassagistId, massagistIds);
        if (shopId != null) {
            // lqw.eq(MassagistSchedules::getShopId, shopId);
            //添加调店人员Id
            lqw.and(e ->e.and(t->t.eq(MassagistSchedules::getShopId, shopId).eq(MassagistSchedules::getTargetShopId,0L)).or().eq(MassagistSchedules::getTargetShopId, shopId));

        }
        List<MassagistSchedules> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return new HashMap<>();
        }
        LocalDate date = LocalDate.now();
        list = list.stream()
                .filter(schedule -> {
                    LocalTime start = schedule.getStartTime();
                    LocalTime end = schedule.getEndTime();
                    return start != null && end != null && !end.isBefore(start);
                }).collect(Collectors.toList());
        Map<String, Double> dateRangeMap = list.stream().collect(Collectors.groupingBy(
                e -> DateUtil.toYYYYMM(e.getDay()) + "|" + e.getMassagistId(),
                Collectors.collectingAndThen(
                        Collectors.summingDouble(schedule -> {
                            LocalTime start = schedule.getStartTime();
                            LocalTime end = schedule.getEndTime();
                            long minutes = DateUtil.diffMinutes(start, end);
                            return minutes / 60.0;
                        }),
                        totalHours -> Math.round(totalHours * 10) / 10.0
                )
        ));
        Map<String, Double> currentDateMap = list.stream().filter(s -> date.equals(s.getDay())).collect(Collectors.groupingBy(
                e -> DateUtil.toYYYYMM(e.getDay()) + "|" + e.getMassagistId(),
                Collectors.collectingAndThen(
                        Collectors.summingDouble(schedule -> {
                            LocalTime start = schedule.getStartTime();
                            LocalTime end = schedule.getEndTime();
                            long minutes = DateUtil.diffMinutes(start, end);
                            return minutes / 60.0;
                        }),
                        totalHours -> Math.round(totalHours * 10) / 10.0
                )
        ));
        Set<String> allMassagistIds = Stream.concat(dateRangeMap.keySet().stream(), currentDateMap.keySet().stream()).collect(Collectors.toSet());
        return allMassagistIds.stream()
                .collect(Collectors.toMap(
                        key -> key,
                        key -> {
                            JSONObject json = new JSONObject();
                            double rangeValue = dateRangeMap.getOrDefault(key, 0.0);
                            double currentValue = currentDateMap.getOrDefault(key, 0.0);
                            json.put("dateRange", rangeValue);
                            json.put("currentDate", currentValue);
                            return json;
                        }
                ));
    }

    /**
     * 按「月份|疗愈师|门店」统计排班在岗分钟数，用于接待工时封顶。
     * <p>调店排班计入目标门店；未调店计入所属门店。</p>
     *
     * @param startTime     开始时间，含
     * @param endTime       结束时间，含
     * @param massagistIds  疗愈师 id；为空时不做过滤
     * @return key = yyyy-MM|massagistId|shopId，value = 排班分钟数
     */
    public Map<String, Integer> periodWorkMinutesByShop(String startTime, String endTime, List<Long> massagistIds) {
        LambdaQueryWrapper<MassagistSchedules> lqw = new LambdaQueryWrapper<>();
        lqw.between(MassagistSchedules::getDay, startTime, endTime);
        if (!CollectionUtils.isEmpty(massagistIds)) {
            lqw.in(MassagistSchedules::getMassagistId, massagistIds);
        }
        List<MassagistSchedules> list = list(lqw);
        Map<String, Integer> result = new HashMap<>();
        if (CollectionUtils.isEmpty(list)) {
            return result;
        }
        list.forEach(schedule -> {
            LocalTime start = schedule.getStartTime();
            LocalTime end = schedule.getEndTime();
            if (schedule.getDay() == null || schedule.getMassagistId() == null
                    || start == null || end == null || end.isBefore(start)) {
                return;
            }
            Long shopId = schedule.getTargetShopId() != null && schedule.getTargetShopId() > 0
                    ? schedule.getTargetShopId()
                    : schedule.getShopId();
            if (shopId == null) {
                return;
            }
            int minutes = (int) DateUtil.diffMinutes(start, end);
            String key = DateUtil.toYYYYMM(schedule.getDay()) + "|" + schedule.getMassagistId() + "|" + shopId;
            result.merge(key, minutes, Integer::sum);
        });
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public MassagistSchedules saveTargetShop(MassagistSchedules value) {
        return batchTargetShop(value);
    }

    /** 临时调店仅作用于所选当天：清原店整天排班，未来其它日期不动。 */
    @Transactional(rollbackFor = Exception.class)
    public MassagistSchedules batchTargetShop(MassagistSchedules value) {
        synchronized (NormalConst.bookingLockKey.intern()) {
            validateSchedule(value);
            if (value.getTargetShopId() == null || value.getTargetShopId() <= 0
                    || value.getTargetShopId().equals(value.getShopId())) throw new BusinessException("请选择不同的目标门店");
            Massagist person = massagistService.getById(value.getMassagistId());
            if (person == null || !Objects.equals(person.getShopId(),value.getShopId()))
                throw new BusinessException("所属门店与疗愈师档案不一致，请刷新后重试");
            if (value.getDay().isBefore(LocalDate.now())) throw new BusinessException("不能新增历史调店排班");
            MassagistSchedules before = value.getId() == null ? null : getById(value.getId());
            if (value.getId() != null && (before == null || !Objects.equals(before.getDay(),value.getDay())
                    || !Objects.equals(before.getMassagistId(),value.getMassagistId())
                    || !Objects.equals(before.getShopId(),value.getShopId())))
                throw new BusinessException("编辑调店不可变更日期、疗愈师或所属门店");
            LambdaQueryWrapper<MassagistSchedules> conflict = new LambdaQueryWrapper<MassagistSchedules>()
                    .eq(MassagistSchedules::getMassagistId,value.getMassagistId())
                    .eq(MassagistSchedules::getDay,value.getDay()).eq(MassagistSchedules::getSchedulesType,1L);
            if (value.getId() != null) conflict.ne(MassagistSchedules::getId,value.getId());
            if (getOnlyOne(conflict) != null) throw new BusinessException("该疗愈师当天已有临时调店，请编辑原记录");
            List<MassagistSchedules> original = list(new LambdaQueryWrapper<MassagistSchedules>()
                    .eq(MassagistSchedules::getMassagistId,value.getMassagistId())
                    .eq(MassagistSchedules::getShopId,value.getShopId())
                    .eq(MassagistSchedules::getDay,value.getDay()).eq(MassagistSchedules::getSchedulesType,0L));
            original = original.stream().filter(s -> Objects.equals(s.getMassagistId(),value.getMassagistId())
                    && Objects.equals(s.getShopId(),value.getShopId()) && Objects.equals(s.getDay(),value.getDay())
                    && !Objects.equals(s.getSchedulesType(),1L)).collect(Collectors.toList());
            JSONObject snapshot = new JSONObject(); snapshot.put("transfer",before); snapshot.put("originalDay",original);
            if (!original.isEmpty() && !removeByIds(original.stream().map(MassagistSchedules::getId).collect(Collectors.toList())))
                throw new BusinessException("清除原店当天排班失败");
            value.setSchedulesType(1L);
            if (!saveOrUpdate(value)) throw new BusinessException("保存调店排班失败");
            recordScheduleChange("临时调店",value.getShopId(),value.getMassagistId(),snapshot,value);
            clearMassgistSortMap(value.getShopId()); clearMassgistSortMap(value.getTargetShopId());
            resetUnstartedRound(value.getDay(), value.getShopId());
            resetUnstartedRound(value.getDay(), value.getTargetShopId());
            if (before != null && before.getTargetShopId() != null && !Objects.equals(before.getTargetShopId(), value.getTargetShopId())) {
                clearMassgistSortMap(before.getTargetShopId());
                resetUnstartedRound(before.getDay(), before.getTargetShopId());
            }
            return value;
        }
    }

    public List<MassagistSchedules> listNoPageNew(Map<String, Object> params) {
        List<MassagistSchedules> list = listNoPage(params);
        Map<String, Object> map = new HashMap<>();
        //map.put("",params.)
        return list;
    }

    public List<Massagist> getMassagistSchedulesListByDateShopId(LocalDate date, Long shopId) {
        LambdaQueryWrapper<MassagistSchedules> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MassagistSchedules::getDay, date);
        lqw.eq(MassagistSchedules::getTargetShopId, shopId);
        List<MassagistSchedules> massagistSchedulesList = list(lqw);
        List<Massagist> massagistList = new ArrayList<>();
        massagistSchedulesList.stream().forEach(e -> {
            List<MassagistSchedules> mas = new ArrayList<>();
            mas.add(e);
            Massagist massagist = massagistService.getById(e.getMassagistId());
            massagist.setSchedulesList(mas);
            massagistList.add(massagist);
        });
        List<Long> massagistIds = massagistSchedulesList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList());
        return massagistList;
    }

    public List<MassagistSchedules> listByMassagistIdAndShopIdAndDate(Long massagistId, Long shopId, LocalDate yyyymmdd) {
        LambdaQueryWrapper<MassagistSchedules> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MassagistSchedules::getMassagistId, massagistId);
        lqw.eq(MassagistSchedules::getShopId, shopId);
        lqw.eq(MassagistSchedules::getDay, yyyymmdd);
        return list(lqw);
    }
    public List<MassagistSchedules> listMassagistSchedulesByDate(String yyyymmdd, Long massagistId) {
        LambdaQueryWrapper<MassagistSchedules> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MassagistSchedules::getDay, yyyymmdd);
        lqw.eq(MassagistSchedules::getMassagistId, massagistId);
        //根据end_time 降序排序
        lqw.orderByDesc(MassagistSchedules::getEndTime);
        return list(lqw);
    }

    /** 订单结束晚于当天下班时间时，按订单门店顺延对应排班的下班时间（只延长不缩短），返回实际更新条数。 */
    public int extendShiftForOrders(Collection<com.macro.mall.entity.OrderDetail> details) {
        if (CollectionUtils.isEmpty(details)) return 0;
        int updated = 0;
        for (com.macro.mall.entity.OrderDetail d : details) {
            if (d == null || d.getMassagistId() == null || d.getStartTime() == null) continue;
            List<MassagistSchedules> shifts = listMassagistSchedulesByDate(DateUtil.toYYYYMMDD(d.getStartTime()), d.getMassagistId());
            MassagistSchedules hit = com.macro.mall.utils.BookingAvailability.shiftToExtend(d, shifts);
            if (hit == null) continue;
            // 只写 end_time，避免实体默认值（sequence=0）覆盖排序
            com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<MassagistSchedules> uw =
                    new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<>();
            uw.set(MassagistSchedules::getEndTime, hit.getEndTime())
              .eq(MassagistSchedules::getId, hit.getId())
              .lt(MassagistSchedules::getEndTime, hit.getEndTime());
            if (update(uw)) updated++;
        }
        return updated;
    }
}