package com.macro.mall.service;

import cn.hutool.core.util.ObjUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.consts.RedisKey;
import com.macro.mall.dto.UmsAdminParam;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.MassagistRate;
import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.enums.JobStatus;
import com.macro.mall.enums.MassagistIdentityCode;
import com.macro.mall.mapper.MassagistMapper;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import com.macro.mall.utils.DateUtil;
import com.macro.mall.utils.RedisUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 服务类
 *
 * @author zkl
 * @date 2025/05/30
 */
@Service
public class MassagistService extends BaseService<MassagistMapper, Massagist> {
    @Autowired
    RedisUtil redisUtil;

    @Autowired
    @Lazy
    RoundScheduleService roundScheduleService;



    @Override
    protected QueryWrapper<Massagist> buildWrapper(Map<String, Object> params, QueryWrapper<Massagist> queryWrapper) {
        QueryWrapper<Massagist> wrapper = WrapperBuilder.init(queryWrapper, params)
                .like("name")
                .in("status")
                .equal("shop_id")
                .getQueryWrapper();
        Object identity = params == null ? null : params.get("identity");
        if ("trainer".equals(identity)) {
            wrapper.exists("SELECT 1 FROM f_massagist_identity i WHERE i.massagist_id = s_massagist.id AND i.code = 'TRAINER'");
        } else if ("manager".equals(identity)) {
            wrapper.exists("SELECT 1 FROM f_massagist_identity i WHERE i.massagist_id = s_massagist.id AND i.code = 'SHOP_MANAGER'");
        } else if ("trainer_pending_account".equals(identity)) {
            wrapper.exists("SELECT 1 FROM f_massagist_identity i WHERE i.massagist_id = s_massagist.id AND i.code = 'TRAINER'")
                    .and(w -> w.isNull("ums_admin_id").or().eq("ums_admin_id", 0));
        }
        return wrapper;
    }

    public List<Massagist> sortList(String day, Long shopId) {
        if (day == null) {
            day = DateUtil.getCurrentDateCode();
        }
        LambdaQueryWrapper<Massagist> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.in(Massagist::getStatus, 1);//, 2 去掉暂挂
        queryWrapper.eq(Massagist::getShopId, shopId);
        List<Massagist> list = list(queryWrapper);
        try {
            List<Long> massagistSchedulesList = massagistSchedulesService.getMassagistSchedulesList(day, shopId);
            list.forEach(s -> s.setSequence(massagistSchedulesList.indexOf(s.getId()) + 1));
            return list.stream().sorted(Comparator.comparing(Massagist::getSequence)).collect(Collectors.toList());
        } catch (Exception e) {
            e.printStackTrace();
        }
        return new ArrayList<>();
    }
    //后台点排序调整列表显示调整，只显示在职员工
    public List<Massagist> sortListNew(String day, Long shopId) {
        if (day == null) {
            day = DateUtil.getCurrentDateCode();
        }
        LambdaQueryWrapper<Massagist> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Massagist::getStatus, 1);
        queryWrapper.eq(Massagist::getShopId, shopId);
        List<Massagist> list = list(queryWrapper);
        try {
            List<Long> massagistSchedulesList = massagistSchedulesService.getMassagistSchedulesList(day, shopId);
            list.forEach(s -> s.setSequence(massagistSchedulesList.indexOf(s.getId()) + 1));
            return list.stream().sorted(Comparator.comparing(Massagist::getSequence)).collect(Collectors.toList());
        } catch (Exception e) {
            e.printStackTrace();
        }
        return new ArrayList<>();
    }

    public List<Massagist> sortList(Long shopId) {
        if (shopId == null) {
            shopId = 1L;
        }
        LambdaQueryWrapper<Massagist> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.in(Massagist::getStatus, 1);//, 2 去掉暂挂技师
        queryWrapper.eq(Massagist::getShopId, shopId);
        queryWrapper.orderByAsc(Massagist::getSequence);
        return list(queryWrapper);
    }

    @Autowired
    @Lazy
    UmsAdminServiceImpl umsAdminService;
    @Autowired
    @Lazy
    MassagistSchedulesService massagistSchedulesService;

    @Autowired
    @Lazy
    MassagistIdentityService massagistIdentityService;

    public void relatedMassagist(Long umsAdminId, Long massagistId) {
        Massagist adminMassagist = getByUmsAdminId(umsAdminId);
        if (!ObjUtil.isEmpty(adminMassagist)) {
            adminMassagist.setUmsAdminId(null);
            updateById(adminMassagist);
        }
        Massagist massagist = getById(massagistId);
        if (ObjUtil.isEmpty(massagist)) {
            throw new BusinessException("疗愈师不存在");
        }
        if (!ObjUtil.isEmpty(massagist.getUmsAdminId()) && !massagist.getUmsAdminId().equals(umsAdminId)) {
            throw new BusinessException("疗愈师已关联账号");
        }
        massagist.setUmsAdminId(umsAdminId);
        updateById(massagist);
    }

    public Massagist getByUmsAdminId(Long umsAdminId) {
        LambdaQueryWrapper<Massagist> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Massagist::getUmsAdminId, umsAdminId);
        return getOnlyOne(lqw);
    }

    public List<Massagist> listByUmsAdminIds(List<Long> umsAdminIds) {
        LambdaQueryWrapper<Massagist> lqw = new LambdaQueryWrapper<>();
        lqw.in(Massagist::getUmsAdminId, umsAdminIds);
        return list(lqw);
    }

    public List<Massagist> listByShopId(Long shopId) {
        LambdaQueryWrapper<Massagist> lqw = new LambdaQueryWrapper<>();
        lqw.in(Massagist::getShopId, shopId);
        return list(lqw);
    }
    //luxin新增 获取所有技师列表
    public List<Massagist> listNotWhere() {
        LambdaQueryWrapper<Massagist> lqw = new LambdaQueryWrapper<>();
        return list(lqw);
    }

    public PageInfo pageInfo(Map<String, Object> params) {
        PageInfo<Massagist> page = page(params);
        List<Massagist> list = page.getList();
        buildUmsAdminUsername(list);
        return page;
    }

    public void buildUmsAdminUsername(List<Massagist> massagistList) {
        if (CollectionUtils.isEmpty(massagistList)) {
            return;
        }
        List<Long> umsAdminIds = massagistList.stream().filter(e -> !ObjUtil.isEmpty(e.getUmsAdminId()))
                .map(Massagist::getUmsAdminId).collect(Collectors.toList());
        Map<Long, UmsAdmin> adminMap = umsAdminIds.isEmpty() ? Collections.emptyMap()
                : umsAdminService.listByIds(umsAdminIds).stream()
                .collect(Collectors.toMap(UmsAdmin::getId, e -> e));
        Map<Long, List<String>> identityMap = massagistIdentityService.codesByMassagistIds(
                massagistList.stream().map(Massagist::getId).collect(Collectors.toList()));
        massagistList.forEach(e -> {
            UmsAdmin admin = adminMap.get(e.getUmsAdminId());
            List<String> codes = identityMap.getOrDefault(e.getId(), Collections.emptyList());
            e.setUmsAdminUsername(admin == null ? null : admin.getUsername());
            e.setIdentities(codes);
            e.setShopManager(codes.contains(MassagistIdentityCode.SHOP_MANAGER.getCode()));
            e.setTrainerAccountReady(admin != null && Integer.valueOf(1).equals(admin.getStatus()));
        });
    }

    public Massagist saveOrUpd(Massagist massagist) {
        return saveOrUpd(massagist, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Massagist saveOrUpd(Massagist massagist, Long operatorId) {
        boolean isSave = ObjUtil.isEmpty(massagist.getId());
        massagist.setProjectArr(Arrays.toString(massagist.getProjectArrPage()));
        Massagist persisted = isSave ? null : getById(massagist.getId());
        if (!isSave && persisted == null) throw new BusinessException("疗愈师档案不存在");
        Long oldShopId = isSave ? massagist.getShopId() : persisted.getShopId();
        Long newShopId = massagist.getShopId();
        if (newShopId == null) throw new BusinessException("请选择所属门店");
        List<String> persistedIdentities = isSave ? new ArrayList<>() : massagistIdentityService.codesOf(persisted.getId());
        if (!isSave) {
            boolean becomingQuit = JobStatus.QUIT.getValue().equals(massagist.getStatus())
                    && !JobStatus.QUIT.getValue().equals(persisted.getStatus());
            if (becomingQuit && persistedIdentities.contains(MassagistIdentityCode.SHOP_MANAGER.getCode())) {
                // 店长离职：先把“店长”身份交给同店在职接班人，否则本店请假审批会失去处理人。
                transferManagerIdentity(persisted, massagist.getSuccessorMassagistId(), operatorId);
            }
        }
        if (isSave) {
            UmsAdminParam umsAdminParam = new UmsAdminParam();
            umsAdminParam.setUsername(massagist.getPhone());
            umsAdminParam.setPassword(massagist.getPhone());
            umsAdminParam.setNickName(massagist.getName());
            umsAdminParam.setShopId(massagist.getShopId());
            umsAdminParam.setShopIdArr("["+ massagist.getShopId()+"]");

            umsAdminParam.setIcon(massagist.getAvatarUrl());
            umsAdminParam.setNote("疗愈师人员");
            UmsAdmin register = umsAdminService.register(umsAdminParam);
            massagist.setUmsAdminId(register.getId());
            oldShopId = umsAdminParam.getShopId();
        } else {
            Long umsAdminId = massagist.getUmsAdminId();
            if (!ObjUtil.isEmpty(umsAdminId)) {
                UmsAdmin umsAdmin = umsAdminService.getById(umsAdminId);
                umsAdmin.setUsername(massagist.getPhone());
                umsAdmin.setNickName(massagist.getName());
                if (!newShopId.equals(umsAdmin.getShopId())) {
                    umsAdmin.setShopId(newShopId);
                    umsAdmin.setShopIdArr("["+ newShopId+"]");
                }
                if (JobStatus.QUIT.getValue().equals(massagist.getStatus())) {
                    umsAdmin.setStatus(0);
                } else {
                    umsAdmin.setStatus(1);
                }
                umsAdminService.update(umsAdmin.getId(), umsAdmin);
            }
        }
        if (!isSave && !Objects.equals(newShopId, oldShopId)) {
            massagistSchedulesService.clearFuture(massagist.getId(), oldShopId, LocalDateTime.now());
            // 永久调店留痕：原店、新店各一条，两边管理者都能在排班变更记录里看到"谁把谁从哪调到哪"。
            Map<String, Object> from = new HashMap<>(); from.put("shopId", oldShopId);
            Map<String, Object> to = new HashMap<>(); to.put("shopId", newShopId);
            massagistSchedulesService.recordScheduleChange("永久调店", oldShopId, massagist.getId(), from, to);
            massagistSchedulesService.recordScheduleChange("永久调店", newShopId, massagist.getId(), from, to);
        }
        // 身份以 identities 为准；旧调用方只传 isTrainer 时，在内训师身份上做增删，保留店长等其他身份。
        List<String> codes;
        if (massagist.getIdentities() != null) {
            codes = new ArrayList<>(MassagistIdentityService.normalize(massagist.getIdentities()));
        } else {
            codes = new ArrayList<>(persistedIdentities);
            Integer explicitTrainer = massagist.getIsTrainer();
            if (explicitTrainer != null) {
                if (Integer.valueOf(1).equals(explicitTrainer)) {
                    if (!codes.contains(MassagistIdentityCode.TRAINER.getCode())) codes.add(MassagistIdentityCode.TRAINER.getCode());
                } else {
                    codes.remove(MassagistIdentityCode.TRAINER.getCode());
                }
            }
        }
        boolean quitting = JobStatus.QUIT.getValue().equals(massagist.getStatus());
        if (quitting) codes.clear();
        boolean trainerFlag = codes.contains(MassagistIdentityCode.TRAINER.getCode());
        massagist.setIsTrainer(trainerFlag ? 1 : 0);
        massagist.setIdentities(codes);
        if (trainerFlag) {
            if (isSave || persisted.getTrainerSince() == null) {
                massagist.setTrainerSince(LocalDate.now());
            } else {
                massagist.setTrainerSince(persisted.getTrainerSince());
            }
        } else {
            massagist.setTrainerSince(null);
        }
        // trainer_since 使用 ALWAYS 更新策略：关闭内训师时会写入 NULL，无需额外 update。
        saveOrUpdate(massagist);
        Long id = massagist.getId();
        massagistIdentityService.replace(id, codes, operatorId);
        if (isSave) {
            massagist.setSequence(100);//将新增的技师排到最后
            saveOrUpdate(massagist);
            addSchedule(newShopId, id);
        } else {
            if (!newShopId.equals(oldShopId)) {
                massagist.setSequence(100);//将新增的技师排到最后
                saveOrUpdate(massagist);
                rerank(newShopId, oldShopId, id);
            } else {
                massagistSchedulesService.clearMassgistSortMap(newShopId);
            }
        }
        redisUtil.delData(RedisKey.FIND_MASSAGIST_NAME_BY_ID + massagist.getId());
        redisUtil.delData(RedisKey.RECEPTION_PRIORITY_MASSAGIST  + massagist.getShopId()  + ":");
        redisUtil.delData(RedisKey.RECEPTION_DATA + massagist.getShopId()  + ":");
        Set<String> keys = redisUtil.getKeys("massagistIdSort" +  "-" + massagist.getShopId() + ":");
        redisUtil.batchDelete(keys);
        return massagist;
    }

    /**
     * 店长离职：把“店长”身份交给同店在职、且后台账号可用的接班人。
     * 校验失败会在事务内整体回滚，不会出现旧店长已离职、新人未接上的中间态。
     */
    private void transferManagerIdentity(Massagist oldManager, Long successorMassagistId, Long operatorId) {
        if (ObjUtil.isEmpty(successorMassagistId)) {
            throw new BusinessException("该疗愈师是本店店长，离职前请选择接班人");
        }
        if (Objects.equals(oldManager.getId(), successorMassagistId)) {
            throw new BusinessException("接班人不能是店长本人");
        }
        Massagist successor = getById(successorMassagistId);
        if (successor == null) throw new BusinessException("接班人不存在");
        if (!Objects.equals(successor.getShopId(), oldManager.getShopId())) {
            throw new BusinessException("接班人必须是本店疗愈师");
        }
        if (JobStatus.QUIT.getValue().equals(successor.getStatus())) {
            throw new BusinessException("接班人已离职，请重新选择");
        }
        if (ObjUtil.isEmpty(successor.getUmsAdminId())) {
            throw new BusinessException("接班人尚未关联后台账号，无法接收审批");
        }
        UmsAdmin successorAdmin = umsAdminService.getById(successor.getUmsAdminId());
        if (successorAdmin == null || !Integer.valueOf(1).equals(successorAdmin.getStatus())) {
            throw new BusinessException("接班人的后台账号不可用，无法接收审批");
        }
        massagistIdentityService.transfer(oldManager.getId(), successor.getId(), MassagistIdentityCode.SHOP_MANAGER, operatorId);
    }

    public List<Massagist> listByShopId(Long shopId, Long massagistId) {
        LambdaQueryWrapper<Massagist> lqw = new LambdaQueryWrapper<>();
        if (!ObjUtil.isEmpty(shopId)) {
            lqw.eq(Massagist::getShopId, shopId);
        }
        if (!ObjUtil.isEmpty(massagistId)) {
            lqw.eq(Massagist::getId, massagistId);
        }
        return list(lqw);
    }

    public List<Massagist> schedulingList(Long shopId, List<Integer> status, LocalDateTime startDateTime) {
        LambdaQueryWrapper<Massagist> lqw = new LambdaQueryWrapper<>();
        if (!ObjUtil.isEmpty(shopId)) {
            lqw.eq(Massagist::getShopId, shopId);
        }
        if (!CollectionUtils.isEmpty(status)) {
            lqw.in(Massagist::getStatus, status);
        }
        List<Massagist> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyList();
        }
        List<Long> massagistIds = list.stream().map(Massagist::getId).collect(Collectors.toList());
        LocalDate localDate = startDateTime.toLocalDate();
        List<MassagistSchedules> schedulesList = massagistSchedulesService.listByMassagistIdsAndDay(massagistIds, localDate, shopId);
        if (!CollectionUtils.isEmpty(schedulesList)) {
            Map<Long, List<MassagistSchedules>> longListMap = schedulesList.stream().collect(Collectors.groupingBy(MassagistSchedules::getMassagistId));
            list.stream().forEach(e -> {
                if (longListMap.get(e.getId()) != null) {
                    e.setSchedulesList(longListMap.get(e.getId()));
                }
            });
        }
        return list;
    }

    /**
     * 添加排序
     *
     * @param shopId
     * @param massagistId
     */
    private void addSchedule(Long shopId, Long massagistId) {
        massagistSchedulesService.clearMassgistSortMap(shopId);
        String day = DateUtil.getCurrentDateCode();
        List<Long> massagistIdList = massagistSchedulesService.getMassagistSchedulesList(day, shopId);
        massagistIdList.remove(massagistId);
        massagistIdList.add(massagistId);
        rerank(day, shopId, massagistIdList);
    }

    /**
     * 重排序
     *
     * @param day
     * @param shopId
     * @param sortMassagistIdList
     */
    @Transactional(rollbackFor = Exception.class)
    public void rerank(String day, Long shopId, List<Long> sortMassagistIdList) {
        if (CollectionUtils.isEmpty(sortMassagistIdList)) {
            return;
        }
        if (day == null) {
            day = DateUtil.getCurrentDateCode();
        }
        List<Massagist> massagistList = listByIds(sortMassagistIdList);
        for (Massagist massagist : massagistList) {
            massagist.setSequenceEnableDay(day);
            massagist.setSequence(sortMassagistIdList.indexOf(massagist.getId()) + 1);
            if (shopId == null) {
                shopId = massagist.getShopId();
            }
        }
        updateBatchById(massagistList);
        massagistSchedulesService.clearMassgistSortMap(shopId);
        try {
            //修改当天日期的排序
            //roundScheduleService.
            LocalDate d = DateUtil.stringToLocalDate(day);
            roundScheduleService.removeExistData(d, shopId);
        } catch (Exception e) {
            log.error("luxin 修改排序", e);
        }
    }

    /**
     * 获取技师姓名对应的id
     *
     * @return
     */
    public Map<String, Long> findName2IdMap() {
        List<Massagist> list = list();
        if (CollectionUtils.isEmpty(list)) {
            return new HashMap<>();
        }
        Map<String, Long> map = new HashMap<>();
        list.forEach(s -> map.put(s.getName(), s.getId()));
        return map;
    }
    public Map<String, Long> findName2ShopIdMap() {
        List<Massagist> list = list();
        if (CollectionUtils.isEmpty(list)) {
            return new HashMap<>();
        }
        Map<String, Long> map = new HashMap<>();
        list.forEach(s -> map.put(s.getName(), s.getShopId()));
        return map;
    }


    /**
     * 获取id对应的技师姓名
     *
     * @return
     */
    public String findNameById(Long id) {
        String name = redisUtil.getString(RedisKey.FIND_MASSAGIST_NAME_BY_ID + id);
        if (StringUtils.hasText(name)) {
            return name;
        }
        LambdaQueryWrapper<Massagist> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Massagist::getId, id);
        lqw.select(Massagist::getName);
        Massagist massagist = getOnlyOne(lqw);
        if (massagist == null) {
            return "未知";
        }
        name = massagist.getName();
        redisUtil.setStringForever(RedisKey.FIND_MASSAGIST_NAME_BY_ID + id, name);
        return name;
    }

    /**
     * 永久调店：调入疗愈师在新门店轮次中排头排。
     * 保留其余疗愈师的原有相对顺序，并去重。
     */
    static List<Long> transferToHead(List<Long> ids, Long massagistId) {
        LinkedHashSet<Long> ranked = new LinkedHashSet<>();
        if (massagistId != null) {
            ranked.add(massagistId);
        }
        if (ids != null) {
            for (Long id : ids) {
                if (id != null) {
                    ranked.add(id);
                }
            }
        }
        return new ArrayList<>(ranked);
    }

    /**
     * 重排序
     *
     * @param newShopId
     * @param oldShopId
     * @param massagistId
     */
    public void rerank(Long newShopId, Long oldShopId, Long massagistId) {
        massagistSchedulesService.clearMassgistSortMap(newShopId);
        List<Massagist> newMassagistList = sortList(null, newShopId);
        List<Long> newMassagistIdList = newMassagistList.stream().map(Massagist::getId).collect(Collectors.toList());
        rerank(null, newShopId, transferToHead(newMassagistIdList, massagistId));

        massagistSchedulesService.clearMassgistSortMap(oldShopId);
        List<Massagist> oldMassagistList = sortList(null, oldShopId);
        List<Long> oldMassagistIdList = oldMassagistList.stream().map(Massagist::getId).collect(Collectors.toList());
        rerank(null, oldShopId, oldMassagistIdList);

    }

    /*public PageInfo pageInfoComent(Map<String, Object> params) {
        PageInfo<Massagist> page = page(params);
        List<Massagist> list = page.getList();
        buildUmsAdminUsernameNew(list);
        return page;
    }
    public void buildUmsAdminUsernameNew(List<Massagist> massagistList) {
        if (!CollectionUtils.isEmpty(massagistList)) {
            List<Long> umsAdminIds = massagistList.stream().filter(e -> !ObjUtil.isEmpty(e.getUmsAdminId())).map(Massagist::getUmsAdminId).collect(Collectors.toList());
            List<UmsAdmin> umsAdminList = umsAdminService.listByIds(umsAdminIds);
            Map<Long, String> umsAdminUserNameMap = umsAdminList.stream().collect(Collectors.toMap(UmsAdmin::getId, UmsAdmin::getUsername));
            massagistList.forEach(e -> {
                e.setUmsAdminUsername(umsAdminUserNameMap.get(e.getUmsAdminId()));
                //评分人数

                List<MassagistRate> massagistRateList=  massagistRateService.list(new LambdaQueryWrapper<MassagistRate>().eq(MassagistRate::getMassagistId, e.getId()));
                if(CollectionUtils.isEmpty(massagistRateList)){
                   e.setAverageScore( BigDecimal.valueOf(0));
                   e.setPeopleCount(0);
                }else{
                    e.setPeopleCount(massagistRateList.size());
                    Double average = massagistRateList.stream()
                            .collect(Collectors.averagingDouble(item -> item.getRating().doubleValue()));
                    e.setAverageScore(BigDecimal.valueOf(average).setScale(2, BigDecimal.ROUND_HALF_UP));
                }
                //平均分
            });
            massagistList.sort(
                    Comparator.comparing(Massagist::getAverageScore, Comparator.reverseOrder())
            );
        }
    }

    public PageInfo pageMassagistApiRating(Map<String, Object> params) {

        PageInfo<MassagistRate> page = massagistRateService.page(params);
        List<MassagistRate> list = page.getList();
        if (!CollectionUtils.isEmpty(list)) {
            list.forEach(e -> {
                e.setMassagistName(findNameById(e.getMassagistId()));
            });
        }
        return  page;
    }*/
}
