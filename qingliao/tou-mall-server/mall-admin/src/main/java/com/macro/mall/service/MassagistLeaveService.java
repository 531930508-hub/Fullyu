package com.macro.mall.service;

import cn.hutool.core.date.DateTime;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.*;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.utils.DateUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.enums.FlowState;
import com.macro.mall.enums.FlowUserType;
import com.macro.mall.enums.approval.FlowCategoryCode;
import com.macro.mall.mapper.MassagistLeaveMapper;
import com.macro.mall.mapper.UmsAdminMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.ObjectUtils;
import org.apache.commons.lang3.StringUtils;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import com.alibaba.fastjson2.JSONObject;
import com.alibaba.fastjson2.JSONArray;
import com.macro.mall.consts.NormalConst;
import org.springframework.beans.BeanUtils;

@Service
public class MassagistLeaveService extends BaseService<MassagistLeaveMapper, MassagistLeave>  implements ApprovalRelation {
    @Autowired
    ApprovalDetailService approvalDetailService;

    @Autowired
    OrderDetailService orderDetailService;
    @Autowired
    MassagistSchedulesService massagistSchedulesService;
    @Autowired
    MassagistService massagistService;
    @Autowired
    ApprovalService approvalService;
    @Autowired
    UmsAdminMapper umsAdminMapper;

    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    @Override
    protected QueryWrapper<MassagistLeave> buildWrapper(Map<String, Object> params, QueryWrapper<MassagistLeave> queryWrapper) {

        return WrapperBuilder.init(queryWrapper, params)
                .equal("create_time")
                .equal("start_datetime")
                .equal("end_datetime")
                .equal("create_user")
                .equal("approval_id")
                .getQueryWrapper();
    }
    //获取技师真正的店铺Id
    public Long getMessagistShopId(Long massagistId){
        Massagist massagistList = massagistService.getById(massagistId);
        if(massagistList!=null){
            return massagistList.getShopId();
        }
        return 0L;
    }
    //luxin新增
    @Transactional(rollbackFor = Exception.class)
    public MassagistLeave add(MassagistLeave massagistLeave) {
        if (massagistLeave == null) throw new BusinessException("休息申请不能为空");
        if (massagistLeave.getMassagistId() <= 0) throw new BusinessException("请选择疗愈师");
        if (massagistLeave.getCreateUser() == null || massagistLeave.getCreateUser() <= 0)
            throw new BusinessException("申请人不能为空");
        if (massagistLeave.getDates() == null || massagistLeave.getDates().length == 0)
            throw new BusinessException("请选择申请日期");
        if (massagistLeave.getStartTime() == null || massagistLeave.getEndTime() == null
                || !massagistLeave.getEndTime().isAfter(massagistLeave.getStartTime()))
            throw new BusinessException("结束时间必须晚于开始时间");
        SortedSet<LocalDate> selectedDates = new TreeSet<>();
        for (String raw : massagistLeave.getDates()) {
            if (raw == null || !raw.matches("\\d{4}-\\d{2}-\\d{2}"))
                throw new BusinessException("申请日期格式不正确");
            try { selectedDates.add(LocalDate.parse(raw)); }
            catch (Exception e) { throw new BusinessException("申请日期格式不正确"); }
        }
        String[] dates = selectedDates.stream().map(LocalDate::toString).toArray(String[]::new);
        massagistLeave.setDates(dates);
        Massagist person = massagistService.getById(massagistLeave.getMassagistId());
        if (person == null || person.getShopId() == null || person.getShopId() <= 0)
            throw new BusinessException("疗愈师不存在或未关联门店");
        massagistLeave.setShopId(person.getShopId());
        MassagistLeave stored = null;
        // 已通过的申请在审批通过时已从排班中扣减，再次编辑时不能再要求“落在现有排班内”。
        boolean approvedBefore = false;
        if (massagistLeave.getId() != null) {
            stored = getById(massagistLeave.getId());
            if (stored == null || stored.getMassagistId() != massagistLeave.getMassagistId()
                    || !Objects.equals(stored.getCreateUser(), massagistLeave.getCreateUser()))
                throw new BusinessException("原休息申请不存在或申请人不一致");
            massagistLeave.setApprovalId(stored.getApprovalId());
            approvedBefore = FlowState.PASSED.getValue().equals(approvalDetailService.getApprovalState(stored.getApprovalId()));
        }
        Set<String> storedDates = new HashSet<>();
        if (stored != null && StringUtils.isNotBlank(stored.getDatesStr())) {
            for (String raw : stored.getDatesStr().split(",")) storedDates.add(raw.trim());
        }
        List<MassagistSchedules> shifts = massagistSchedulesService.list(new LambdaQueryWrapper<MassagistSchedules>()
                .eq(MassagistSchedules::getMassagistId, massagistLeave.getMassagistId())
                .in(MassagistSchedules::getDay, (Object[]) dates));
        LocalDate today = LocalDate.now();
        for (String raw : dates) {
            LocalDate date;
            try { date = LocalDate.parse(raw); } catch (Exception e) { throw new BusinessException("申请日期格式不正确"); }
            if (approvedBefore) continue;
            if (date.isBefore(today) && !storedDates.contains(raw))
                throw new BusinessException(raw + " 已经是过去日期，不能申请休息");
            List<MassagistSchedules> dayShifts = shifts.stream()
                    .filter(s -> Long.valueOf(massagistLeave.getMassagistId()).equals(s.getMassagistId())
                            && date.equals(s.getDay()) && s.getStartTime() != null && s.getEndTime() != null)
                    .collect(Collectors.toList());
            if (dayShifts.isEmpty()) throw new BusinessException(raw + " 当天没有排班，无需申请休息");
            // 休息时段必须落在同一条排班内，避免只休掉排班中间一段后产生无法解释的空档。
            boolean covered = dayShifts.stream().anyMatch(s ->
                    !s.getStartTime().isAfter(massagistLeave.getStartTime())
                            && !s.getEndTime().isBefore(massagistLeave.getEndTime()));
            if (!covered) {
                String window = dayShifts.stream()
                        .map(s -> s.getStartTime().format(HH_MM) + "-" + s.getEndTime().format(HH_MM))
                        .distinct().collect(Collectors.joining("、"));
                throw new BusinessException(raw + " 的休息时段需在排班时段内（当天排班 " + window + "）");
            }
        }
        LambdaQueryWrapper<MassagistLeave> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MassagistLeave::getMassagistId, massagistLeave.getMassagistId());
        if(massagistLeave.getId()!=null){
            lqw.ne(MassagistLeave::getId, massagistLeave.getId());
        }
        //获取当天的日期，格式为yyyy-mm-dd
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        String formattedDate = today.format(formatter);
        int number=1;
        if(massagistLeave.getDates().length>0){
            if(Arrays.asList(massagistLeave.getDates()).contains(formattedDate)){
                number=2;
            }
        }
        LocalDateTime from = LocalDate.parse(dates[0]).atTime(massagistLeave.getStartTime());
        LocalDateTime to = LocalDate.parse(dates[dates.length - 1]).atTime(massagistLeave.getEndTime());
        String dtStart = from.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String dtEnd = to.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        lqw.lt(MassagistLeave::getStartDatetime, to)
                .gt(MassagistLeave::getEndDatetime, from);
        for (MassagistLeave existing : list(lqw)) {
            if (existing.getMassagistId() != massagistLeave.getMassagistId()
                    || Objects.equals(existing.getId(), massagistLeave.getId()) && existing.getId() != null) continue;
            for (LocalDate date : selectedDates) {
                if (overlapsSelectedDate(existing, date, massagistLeave.getStartTime(), massagistLeave.getEndTime()))
                    throw new BusinessException(date + " 已有此时段的休息申请");
            }
        }

        //新增审核
        if(massagistLeave.getId()==null){
            Long flowApprovalId = approvalDetailService.addRelationMassagistLeaveId(massagistLeave.getShopId(), FlowCategoryCode.ASK_FOR_LEAVE, massagistLeave.getCreateUser(),number);
            massagistLeave.setCreateTime(DateUtil.string2DateTime(DateUtil.nowString()));
            massagistLeave.setApprovalId(flowApprovalId);
            massagistLeave.setCreateUser(massagistLeave.getCreateUser());
        }

        //增加或修改请假内容
        massagistLeave.setStartDate(DateUtil.stringToLocalDate(massagistLeave.getDates()[0]));
        massagistLeave.setEndDate(DateUtil.stringToLocalDate(massagistLeave.getDates()[massagistLeave.getDates().length - 1]));
        massagistLeave.setStartDatetime(DateUtil.string2DateTime(dtStart));
        massagistLeave.setEndDatetime(DateUtil.string2DateTime(dtEnd));
        massagistLeave.setDatesStr(String.join(",", massagistLeave.getDates()));
        //抄送人：申请页可增减流程默认抄送人，先落审批明细再提交，保证提醒与抄送一致
        approvalDetailService.replaceCcUsers(massagistLeave.getApprovalId(), massagistLeave.getCcIdList());
        if(massagistLeave.getId()==null){
            if (!save(massagistLeave)) throw new BusinessException("保存休息申请失败，请重试");
        }else{
            if (!updateById(massagistLeave)) throw new BusinessException("更新休息申请失败，请重试");
            approvalDetailService.reSubmit(massagistLeave.getApprovalId());
        }
        return massagistLeave;
    }

    /** 已有申请只在其实际选中的日期、每日时段上与新申请重叠才算重复。 */
    private boolean overlapsSelectedDate(MassagistLeave existing, LocalDate date, LocalTime start, LocalTime end) {
        if (existing.getStartTime() != null && existing.getEndTime() != null && existing.getDatesStr() != null
                && !existing.getDatesStr().trim().isEmpty()) {
            boolean selected = false;
            for (String raw : existing.getDatesStr().split(",")) {
                try { if (date.equals(LocalDate.parse(raw.trim()))) { selected = true; break; } }
                catch (Exception e) { throw new BusinessException("已有休息申请日期不完整，请联系门店核对"); }
            }
            return selected && existing.getStartTime().isBefore(end) && start.isBefore(existing.getEndTime());
        }
        if (existing.getStartDatetime() == null || existing.getEndDatetime() == null)
            throw new BusinessException("已有休息申请时段不完整，请联系门店核对");
        return existing.getStartDatetime().isBefore(date.atTime(end)) && date.atTime(start).isBefore(existing.getEndDatetime());
    }



    @Override
    @Transactional(rollbackFor = Exception.class)
    public void changeRelateRecordState(Long approvalId, FlowState state) {
        if (state != FlowState.PASSED) return;
        synchronized (NormalConst.bookingLockKey.intern()) {
            MassagistLeave leave = getOnlyOne(new LambdaQueryWrapper<MassagistLeave>()
                    .eq(MassagistLeave::getApprovalId, approvalId));
            if (leave == null) throw new BusinessException("休息申请不存在");
            Set<LocalDate> selected;
            try {
                selected = Arrays.stream(leave.getDatesStr().split(",")).map(LocalDate::parse).collect(Collectors.toSet());
            } catch (Exception e) { throw new BusinessException("申请日期不完整，请核对"); }
            if (leave.getStartTime() == null || leave.getEndTime() == null
                    || !leave.getEndTime().isAfter(leave.getStartTime())) throw new BusinessException("申请时段不正确");
            List<MassagistSchedules> shifts = massagistSchedulesService.list(new LambdaQueryWrapper<MassagistSchedules>()
                    .eq(MassagistSchedules::getMassagistId, leave.getMassagistId()).in(MassagistSchedules::getDay, selected));
            List<MassagistSchedules> before = new ArrayList<>();
            List<MassagistSchedules> after = new ArrayList<>();
            for (MassagistSchedules shift : shifts) {
                if (!Objects.equals(shift.getMassagistId(), leave.getMassagistId()) || !selected.contains(shift.getDay())
                        || shift.getStartTime() == null || shift.getEndTime() == null
                        || !shift.getStartTime().isBefore(leave.getEndTime()) || !leave.getStartTime().isBefore(shift.getEndTime())) continue;
                MassagistSchedules snapshot = new MassagistSchedules(); BeanUtils.copyProperties(shift, snapshot); before.add(snapshot);
                if (shift.getStartTime().isBefore(leave.getStartTime())) {
                    MassagistSchedules left = new MassagistSchedules(); BeanUtils.copyProperties(shift, left);
                    left.setId(null); left.setEndTime(leave.getStartTime()); after.add(left);
                }
                if (leave.getEndTime().isBefore(shift.getEndTime())) {
                    MassagistSchedules right = new MassagistSchedules(); BeanUtils.copyProperties(shift, right);
                    right.setId(null); right.setStartTime(leave.getEndTime()); after.add(right);
                }
            }
            if (before.isEmpty()) return;
            if (!massagistSchedulesService.removeByIds(before.stream().map(MassagistSchedules::getId).collect(Collectors.toList())))
                throw new BusinessException("调整排班失败");
            if (!after.isEmpty() && !massagistSchedulesService.saveBatch(after)) throw new BusinessException("保存剩余排班失败");
            massagistSchedulesService.recordScheduleChange("休息审批#" + approvalId, before.get(0).getShopId(),
                    leave.getMassagistId(), before, after);
            for (MassagistSchedules shift : before) {
                massagistSchedulesService.clearMassgistSortMap(shift.getShopId());
                if (shift.getTargetShopId() != null && shift.getTargetShopId() > 0)
                    massagistSchedulesService.clearMassgistSortMap(shift.getTargetShopId());
            }
        }
    }

    @Override
    public void deleteByApprovalId(Long approvalId) {

    }
//luxin新增
    @Override
    public Object detail(Long approvalId) {
        LambdaQueryWrapper<MassagistLeave> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MassagistLeave::getApprovalId, approvalId);
        MassagistLeave massagistLeave = getOnlyOne(lqw);
        if (massagistLeave == null) throw new BusinessException("休息申请不存在");
        String startDatetime = DateUtil.toDateMinute(massagistLeave.getStartDatetime());
        String endDatetime = DateUtil.toDateMinute(massagistLeave.getEndDatetime());

        //luxin新增 检查技师请假时间段内是否有订单
        long massagistId = massagistLeave.getMassagistId();
        List<OrderDetail> list = orderDetailService.getOrderByMassagistId(massagistId,
                massagistLeave.getStartDatetime(), massagistLeave.getEndDatetime());
        Massagist person = massagistService.getById(massagistId);
        String personName = person == null ? "" : (StringUtils.isNotBlank(person.getName()) ? person.getName()
                : (StringUtils.isNotBlank(person.getRealName()) ? person.getRealName() : ""));

        //待办中心需要按天展示请假日期与每日时段，这里统一给出勾选日期、时间点和请假人
        JSONObject detail = new JSONObject();
        detail.put("startDatetime", startDatetime);
        detail.put("endDatetime", endDatetime);
        detail.put("marks", massagistLeave.getMarks());
        detail.put("count", list.size() + "");
        detail.put("dates", leaveDates(massagistLeave));
        detail.put("startTime", timePoint(massagistLeave.getStartTime(), massagistLeave.getStartDatetime()));
        detail.put("endTime", timePoint(massagistLeave.getEndTime(), massagistLeave.getEndDatetime()));
        detail.put("massagistName", personName);
        detail.put("createUser", massagistLeave.getCreateUser());
        //提交人姓名取用户账号上的员工姓名（昵称），不用户档案里的疗愈师姓名
        detail.put("createUserName", applicantName(massagistLeave.getCreateUser()));
        //当天请假：审批链路已提到店长及以上，详情页打标提醒
        detail.put("sameDay", isSameDayLeave(massagistLeave));
        return detail;
    }

    /** 请假申请提交人姓名：取用户账号上的员工姓名（nickName），没有再退登录账号 */
    private String applicantName(Long createUser) {
        if (createUser != null && createUser > 0) {
            UmsAdmin admin = umsAdminMapper.selectById(createUser);
            if (admin != null) {
                if (StringUtils.isNotBlank(admin.getNickName())) return admin.getNickName();
                if (StringUtils.isNotBlank(admin.getUsername())) return admin.getUsername();
            }
        }
        return "";
    }

    /** 请假日期：优先取申请时勾选的日期，历史数据退回起止日期区间。排班周视图与列表复用。 */
    public List<String> leaveDates(MassagistLeave leave) {
        List<String> dates = new ArrayList<>();
        if (StringUtils.isNotBlank(leave.getDatesStr())) {
            for (String raw : leave.getDatesStr().split(",")) {
                if (StringUtils.isBlank(raw)) continue;
                try { dates.add(LocalDate.parse(raw.trim()).toString()); } catch (Exception e) { /*忽略历史脏数据，页面按可用日期展示*/ }
            }
        }
        if (!dates.isEmpty()) return dates;
        if (leave.getStartDate() != null && leave.getEndDate() != null && !leave.getStartDate().isAfter(leave.getEndDate())) {
            for (LocalDate day = leave.getStartDate(); !day.isAfter(leave.getEndDate()); day = day.plusDays(1)) {
                dates.add(day.toString());
                if (dates.size() >= 62) break;
            }
        }
        return dates;
    }

    /** 当天请假：勾选日期里包含今天（审批链路需提到店长及以上，列表/详情打标）。 */
    public boolean isSameDayLeave(MassagistLeave leave) {
        if (leave == null) return false;
        return leaveDates(leave).contains(LocalDate.now().toString());
    }

    private String timePoint(LocalTime time, LocalDateTime datetime) {
        if (time != null) return time.format(DateTimeFormatter.ofPattern("HH:mm"));
        return datetime == null ? "" : datetime.format(DateTimeFormatter.ofPattern("HH:mm"));
    }

    public Object findMassagistLeaveDetailByApprovalId(Long approvalId) {
        LambdaQueryWrapper<MassagistLeave> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MassagistLeave::getApprovalId, approvalId);
        MassagistLeave massagistLeave = getOnlyOne(lqw);
        if(massagistLeave!=null){
            //回填抄送人，修改申请时保持页面原有勾选
            massagistLeave.setCcIdList(approvalDetailService
                    .findByApprovalIdAndUserType(approvalId, FlowUserType.CC).stream()
                    .map(ApprovalDetail::getTargetUserId).filter(Objects::nonNull)
                    .collect(Collectors.toList()));
        }

        return massagistLeave;
    }
    //技师取消请假
    @Transactional(rollbackFor = Exception.class)
    public Object cancelLeave(Long approvalId) {
        synchronized (NormalConst.bookingLockKey.intern()) {
            LambdaQueryWrapper<MassagistLeave> query = new LambdaQueryWrapper<MassagistLeave>()
                    .eq(MassagistLeave::getApprovalId, approvalId);
            MassagistLeave leave = getOnlyOne(query);
            if (leave == null) throw new BusinessException("休息申请不存在");
            if (approvalDetailService.getApprovalState(approvalId) == FlowState.PASSED.getValue()) {
                List<ControllerLog> audit = massagistSchedulesService.controllerLogService.list(new QueryWrapper<ControllerLog>()
                        .eq("source", "schedule-audit")
                        .apply("title like {0}", "%:" + leave.getMassagistId() + ":休息审批#" + approvalId)
                        .orderByDesc("id").last("limit 1"));
                if (audit.isEmpty()) throw new BusinessException("历史申请没有原排班快照，请联系门店核对后人工调整，系统不会重建默认排班");
                JSONObject payload = JSONObject.parseObject(audit.get(0).getParams());
                List<MassagistSchedules> originals = payload.getJSONArray("before").toJavaList(MassagistSchedules.class);
                List<MassagistSchedules> expected = payload.getJSONArray("after").toJavaList(MassagistSchedules.class);
                Set<LocalDate> dates = originals.stream().map(MassagistSchedules::getDay).collect(Collectors.toSet());
                List<MassagistSchedules> current = massagistSchedulesService.list(new LambdaQueryWrapper<MassagistSchedules>()
                        .eq(MassagistSchedules::getMassagistId, leave.getMassagistId()).in(MassagistSchedules::getDay, dates));
                Set<Long> expectedIds = expected.stream().map(MassagistSchedules::getId).collect(Collectors.toSet());
                if (expectedIds.contains(null)) throw new BusinessException("原排班快照不完整，请联系门店核对");
                for (MassagistSchedules fragment : expected) {
                    if (current.stream().noneMatch(s -> sameShift(fragment, s)))
                        throw new BusinessException("审批后排班已变更，请联系门店核对，不能自动覆盖");
                }
                for (MassagistSchedules original : originals) {
                    boolean conflict = current.stream().anyMatch(s -> !expectedIds.contains(s.getId())
                            && Objects.equals(s.getDay(), original.getDay()) && s.getStartTime() != null && s.getEndTime() != null
                            && s.getStartTime().isBefore(original.getEndTime()) && original.getStartTime().isBefore(s.getEndTime()));
                    if (conflict) throw new BusinessException("恢复时段已有其它排班，请联系门店核对");
                }
                if (!expectedIds.isEmpty() && !massagistSchedulesService.removeByIds(expectedIds))
                    throw new BusinessException("移除审批后排班失败");
                if (!massagistSchedulesService.saveBatch(originals)) throw new BusinessException("恢复原排班失败");
                massagistSchedulesService.recordScheduleChange("撤回休息#" + approvalId, originals.get(0).getShopId(),
                        leave.getMassagistId(), expected, originals);
                for (MassagistSchedules s : originals) {
                    massagistSchedulesService.clearMassgistSortMap(s.getShopId());
                    if (s.getTargetShopId() != null && s.getTargetShopId() > 0) massagistSchedulesService.clearMassgistSortMap(s.getTargetShopId());
                }
            }
            if (!remove(query)) throw new BusinessException("撤回休息申请失败");
            approvalDetailService.deleteByApprovalId(approvalId);
            return leave;
        }
    }

    private boolean sameShift(MassagistSchedules a, MassagistSchedules b) {
        return Objects.equals(a.getId(), b.getId()) && Objects.equals(a.getMassagistId(), b.getMassagistId())
                && Objects.equals(a.getShopId(), b.getShopId()) && Objects.equals(a.getTargetShopId(), b.getTargetShopId())
                && Objects.equals(a.getSchedulesType(), b.getSchedulesType()) && Objects.equals(a.getDay(), b.getDay())
                && Objects.equals(a.getStartTime(), b.getStartTime()) && Objects.equals(a.getEndTime(), b.getEndTime());
    }

    /**
     * 门店周视图的休息看板：区间内每位疗愈师已通过 / 审批中的休息时段，以及折算后的休息天数。
     *
     * <p>折算口径：休息分钟数 ÷（休息分钟数 + 当天剩余排班分钟数）。审批通过时休息时段
     * 已从排班中扣减，剩余排班即“上班部分”，两者相加可还原当天原排班时长，因此
     * 休息半天就记 0.5 天，整天休息记 1 天。</p>
     */
    public JSONObject weekBoard(Long shopId, String dayStartStr, String dayEndStr) {
        if (shopId == null || shopId <= 0) throw new BusinessException("请选择门店");
        LocalDate dayStart;
        LocalDate dayEnd;
        try {
            dayStart = LocalDate.parse(dayStartStr);
            dayEnd = LocalDate.parse(dayEndStr);
        } catch (Exception e) {
            throw new BusinessException("查询日期格式不正确");
        }
        if (dayEnd.isBefore(dayStart)) throw new BusinessException("查询日期区间不正确");
        if (ChronoUnit.DAYS.between(dayStart, dayEnd) > 30) throw new BusinessException("单次最多查看 31 天");

        // 看板涉及的人：本店疗愈师 + 本周调店到本店的人，避免借调期间休息在两家门店都看不到。
        Set<Long> massagistIds = new LinkedHashSet<>();
        for (Massagist massagist : massagistService.list(new LambdaQueryWrapper<Massagist>()
                .eq(Massagist::getShopId, shopId))) {
            if (massagist.getId() != null) massagistIds.add(massagist.getId());
        }
        List<MassagistSchedules> boardShifts = massagistSchedulesService.list(new LambdaQueryWrapper<MassagistSchedules>()
                .between(MassagistSchedules::getDay, dayStart, dayEnd)
                .and(w -> w.eq(MassagistSchedules::getShopId, shopId).or().eq(MassagistSchedules::getTargetShopId, shopId)));
        for (MassagistSchedules shift : boardShifts) {
            if (shift.getMassagistId() != null) massagistIds.add(shift.getMassagistId());
        }

        JSONArray leaves = new JSONArray();
        Map<Long, Map<LocalDate, Integer>> approvedMinutes = new HashMap<>();
        Map<Long, Set<LocalDate>> pendingDates = new HashMap<>();
        if (!massagistIds.isEmpty()) {
            List<MassagistLeave> rows = list(new LambdaQueryWrapper<MassagistLeave>()
                    .in(MassagistLeave::getMassagistId, massagistIds)
                    .le(MassagistLeave::getStartDate, dayEnd)
                    .ge(MassagistLeave::getEndDate, dayStart));
            List<Long> approvalIds = rows.stream().map(MassagistLeave::getApprovalId)
                    .filter(id -> id != null && id > 0).distinct().collect(Collectors.toList());
            Map<Long, Integer> stateMap = new HashMap<>();
            if (!approvalIds.isEmpty()) {
                for (Approval approval : approvalService.listByIds(approvalIds)) {
                    if (approval.getId() != null) stateMap.put(approval.getId(), approval.getState());
                }
            }
            for (MassagistLeave leave : rows) {
                Integer state = stateMap.get(leave.getApprovalId());
                boolean pending = FlowState.APPROVING.getValue().equals(state);
                if (!pending && !FlowState.PASSED.getValue().equals(state)) continue;
                if (leave.getStartTime() == null || leave.getEndTime() == null
                        || !leave.getEndTime().isAfter(leave.getStartTime())) continue;
                long leaveMinutes = Duration.between(leave.getStartTime(), leave.getEndTime()).toMinutes();
                for (String raw : leaveDates(leave)) {
                    LocalDate day;
                    try { day = LocalDate.parse(raw); } catch (Exception e) { continue; }
                    if (day.isBefore(dayStart) || day.isAfter(dayEnd)) continue;
                    JSONObject item = new JSONObject();
                    item.put("massagistId", leave.getMassagistId());
                    item.put("approvalId", leave.getApprovalId());
                    item.put("day", day.toString());
                    item.put("startTime", leave.getStartTime().format(HH_MM));
                    item.put("endTime", leave.getEndTime().format(HH_MM));
                    item.put("state", state);
                    item.put("pending", pending);
                    item.put("fullDay", false);
                    leaves.add(item);
                    if (pending) {
                        pendingDates.computeIfAbsent(leave.getMassagistId(), k -> new HashSet<>()).add(day);
                    } else {
                        approvedMinutes.computeIfAbsent(leave.getMassagistId(), k -> new HashMap<>())
                                .merge(day, (int) leaveMinutes, Integer::sum);
                    }
                }
            }
        }

        // 剩余排班：审批通过后的班表已扣掉休息时段，用来还原当天原排班并判断是否整天休息。
        Map<Long, Map<LocalDate, Integer>> remainingMinutes = new HashMap<>();
        if (!massagistIds.isEmpty()) {
            for (MassagistSchedules shift : massagistSchedulesService.list(new LambdaQueryWrapper<MassagistSchedules>()
                    .in(MassagistSchedules::getMassagistId, massagistIds)
                    .between(MassagistSchedules::getDay, dayStart, dayEnd))) {
                if (shift.getMassagistId() == null || shift.getDay() == null
                        || shift.getStartTime() == null || shift.getEndTime() == null) continue;
                long minutes = Duration.between(shift.getStartTime(), shift.getEndTime()).toMinutes();
                if (minutes <= 0) continue;
                remainingMinutes.computeIfAbsent(shift.getMassagistId(), k -> new HashMap<>())
                        .merge(shift.getDay(), (int) minutes, Integer::sum);
            }
        }
        for (int i = 0; i < leaves.size(); i++) {
            JSONObject item = leaves.getJSONObject(i);
            if (item.getBooleanValue("pending")) continue;
            Long massagistId = item.getLong("massagistId");
            LocalDate day = LocalDate.parse(item.getString("day"));
            int remaining = remainingMinutes.getOrDefault(massagistId, Collections.emptyMap()).getOrDefault(day, 0);
            item.put("fullDay", remaining <= 0);
        }

        JSONObject stats = new JSONObject();
        for (Long massagistId : massagistIds) {
            Map<LocalDate, Integer> approved = approvedMinutes.getOrDefault(massagistId, Collections.emptyMap());
            Map<LocalDate, Integer> remaining = remainingMinutes.getOrDefault(massagistId, Collections.emptyMap());
            double restDays = 0;
            for (Map.Entry<LocalDate, Integer> entry : approved.entrySet()) {
                int leaveMinutes = entry.getValue();
                int remain = remaining.getOrDefault(entry.getKey(), 0);
                restDays += remain <= 0 ? 1.0 : Math.min(1.0, leaveMinutes / (double) (leaveMinutes + remain));
            }
            JSONObject stat = new JSONObject();
            stat.put("restDays", Math.round(restDays * 100) / 100.0);
            stat.put("approvedDates", approved.size());
            stat.put("pendingDates", pendingDates.getOrDefault(massagistId, Collections.emptySet()).size());
            stats.put(String.valueOf(massagistId), stat);
        }

        JSONObject result = new JSONObject();
        result.put("dayStart", dayStart.toString());
        result.put("dayEnd", dayEnd.toString());
        result.put("leaves", leaves);
        result.put("stats", stats);
        return result;
    }
}
