package com.macro.mall.service;

import cn.hutool.core.date.DateTime;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.*;
import com.macro.mall.utils.DateUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.enums.FlowState;
import com.macro.mall.enums.approval.FlowCategoryCode;
import com.macro.mall.mapper.MassagistLeaveMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.ObjectUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
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
        if (massagistLeave.getId() != null) {
            MassagistLeave stored = getById(massagistLeave.getId());
            if (stored == null || stored.getMassagistId() != massagistLeave.getMassagistId()
                    || !Objects.equals(stored.getCreateUser(), massagistLeave.getCreateUser()))
                throw new BusinessException("原休息申请不存在或申请人不一致");
            massagistLeave.setApprovalId(stored.getApprovalId());
        }
        List<MassagistSchedules> shifts = massagistSchedulesService.list(new LambdaQueryWrapper<MassagistSchedules>()
                .eq(MassagistSchedules::getMassagistId, massagistLeave.getMassagistId())
                .in(MassagistSchedules::getDay, (Object[]) dates));
        for (String raw : dates) {
            LocalDate date;
            try { date = LocalDate.parse(raw); } catch (Exception e) { throw new BusinessException("申请日期格式不正确"); }
            boolean scheduled = shifts.stream().anyMatch(s -> Long.valueOf(massagistLeave.getMassagistId()).equals(s.getMassagistId())
                    && date.equals(s.getDay()) && s.getStartTime() != null && s.getEndTime() != null
                    && massagistLeave.getStartTime().isBefore(s.getEndTime())
                    && s.getStartTime().isBefore(massagistLeave.getEndTime()));
            if (!scheduled) throw new BusinessException(raw + " 该时段没有排班，无需申请休息");
        }
        LambdaQueryWrapper<MassagistLeave> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MassagistLeave::getMassagistId, massagistLeave.getMassagistId());
        if(massagistLeave.getId()!=null){
            lqw.ne(MassagistLeave::getId, massagistLeave.getId());
        }
        //获取当天的日期，格式为yyyy-mm-dd
        LocalDate today = LocalDate.now();
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
        String startDatetime=DateUtil.toDateMinute(massagistLeave.getStartDatetime());
        String endDatetime= DateUtil.toDateMinute(massagistLeave.getEndDatetime());
        String marks= massagistLeave.getMarks();

        //luxin新增 检查技师请假时间段内是否有订单
        //oms_order_detail
       // if(massagistLeave.getMassagistId()!=null)
        long MassagistId=massagistLeave.getMassagistId();
        List<OrderDetail> list=orderDetailService.getOrderByMassagistId(MassagistId,massagistLeave.getStartDatetime(),massagistLeave.getEndDatetime());

        Object obj=new Object(){
            public String getStartDatetime() {
                return startDatetime;
            }
            public String getEndDatetime() {
                return endDatetime;
            }
            public String getMarks() {
                return marks;
            }
            public String getCount() {
                return list.size()+"";
            }
        };
        return obj;
    }

    public Object findMassagistLeaveDetailByApprovalId(Long approvalId) {
        LambdaQueryWrapper<MassagistLeave> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MassagistLeave::getApprovalId, approvalId);
        MassagistLeave massagistLeave = getOnlyOne(lqw);
        if(massagistLeave!=null){
          /*  String[] datas=
            massagistLeave.setDates();*//**/
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
}
