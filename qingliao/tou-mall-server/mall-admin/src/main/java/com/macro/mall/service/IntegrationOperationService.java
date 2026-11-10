package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.Integration;
import com.macro.mall.entity.IntegrationOperation;
import com.macro.mall.mapper.IntegrationOperationMapper;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.utils.ExcelUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 积分管理：单笔调增调减、批量导入，并为每次变动记录操作人、时间与结果。
 *
 * <p>调减前先校验可用余额，不足直接报错，不再按旧导入逻辑"有多少扣多少"。</p>
 */
@Service
public class IntegrationOperationService extends BaseService<IntegrationOperationMapper, IntegrationOperation> {
    static final long MAX_ABS_SCORE = 100000L;
    private static final DateTimeFormatter BATCH = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    @Autowired
    IntegrationService integrationService;
    @Autowired
    CustomerService customerService;

    @Transactional(rollbackFor = Exception.class)
    public IntegrationOperation adjust(String phone, Long score, String reason, UmsAdmin operator) {
        requireOperator(operator);
        String cleanReason = validate(score, reason);
        String cleanPhone = phone == null ? "" : phone.trim();
        Customer customer = StringUtils.hasText(cleanPhone) ? customerService.getByPhone(cleanPhone) : null;
        if (customer == null || customer.getId() == null) throw new BusinessException("未找到该手机号对应的客户");
        IntegrationOperation log = base(IntegrationOperation.ADJUST, newBatchNo("A"), operator);
        log.setCustomerId(customer.getId());
        log.setPhone(cleanPhone);
        log.setScore(score);
        log.setReason(cleanReason);
        log.setIntegrationId(apply(customer.getId(), score, cleanReason));
        log.setSuccess(true);
        if (!save(log)) throw new BusinessException("积分操作记录保存失败");
        return log;
    }

    /** 逐行处理并全部留痕；格式错误或余额不足的行记失败、不影响其他行。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importFile(MultipartFile file, UmsAdmin operator) {
        requireOperator(operator);
        if (file == null || file.isEmpty()) throw new BusinessException("请选择要导入的文件");
        List<Map<Integer, String>> rows = ExcelUtil.doReadExcelMapList(file, 0, 0);
        if (rows == null || rows.isEmpty()) throw new BusinessException("导入文件为空");
        Integer phoneKey = null, scoreKey = null, reasonKey = null;
        for (Map.Entry<Integer, String> e : rows.get(0).entrySet()) {
            String label = e.getValue() == null ? "" : e.getValue().trim();
            if ("手机号".equals(label)) phoneKey = e.getKey();
            else if ("变动积分数".equals(label)) scoreKey = e.getKey();
            else if ("变动原因".equals(label)) reasonKey = e.getKey();
        }
        if (phoneKey == null) throw new BusinessException("未检测到[手机号]列存在，导入失败");
        if (scoreKey == null) throw new BusinessException("未检测到[变动积分数]列存在，导入失败");
        if (reasonKey == null) throw new BusinessException("未检测到[变动原因]列存在，导入失败");

        String batchNo = newBatchNo("I");
        List<IntegrationOperation> logs = new ArrayList<>();
        List<Map<String, Object>> failures = new ArrayList<>();
        int success = 0;
        for (int i = 1; i < rows.size(); i++) {
            Map<Integer, String> row = rows.get(i);
            String phone = trim(row.get(phoneKey));
            String rawScore = trim(row.get(scoreKey));
            String reason = trim(row.get(reasonKey));
            if (phone.isEmpty() && rawScore.isEmpty() && reason.isEmpty()) continue;
            IntegrationOperation log = base(IntegrationOperation.IMPORT, batchNo, operator);
            log.setPhone(phone);
            log.setReason(reason);
            try {
                Long score = parseScore(rawScore);
                log.setScore(score);
                if (phone.isEmpty()) throw new BusinessException("手机号为空");
                String cleanReason = validate(score, reason);
                Customer customer = customerService.getByPhone(phone);
                if (customer == null) {
                    customer = customerService.initCustomer(phone);
                    customerService.save(customer);
                }
                log.setCustomerId(customer.getId());
                log.setIntegrationId(apply(customer.getId(), score, cleanReason));
                log.setSuccess(true);
                success++;
            } catch (PointsBalanceChangedException e) {
                throw e;
            } catch (BusinessException e) {
                log.setSuccess(false);
                log.setMessage(e.getMessage());
                Map<String, Object> f = new LinkedHashMap<>();
                f.put("row", i + 1); f.put("phone", phone); f.put("message", e.getMessage());
                failures.add(f);
            }
            logs.add(log);
        }
        if (logs.isEmpty()) throw new BusinessException("导入文件没有数据行");
        if (!saveBatch(logs)) throw new BusinessException("积分操作记录保存失败");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("batchNo", batchNo);
        result.put("total", logs.size());
        result.put("success", success);
        result.put("failed", logs.size() - success);
        result.put("failures", failures);
        return result;
    }

    @Override
    protected QueryWrapper<IntegrationOperation> buildWrapper(Map<String, Object> params, QueryWrapper<IntegrationOperation> qw) {
        String phone = str(params.get("phone"));
        if (!phone.isEmpty()) qw.like("phone", phone);
        String type = str(params.get("op_type"));
        if (!type.isEmpty()) qw.eq("op_type", type);
        String success = str(params.get("success"));
        if (!success.isEmpty()) qw.eq("success", success);
        String operatorName = str(params.get("operator_name"));
        if (!operatorName.isEmpty()) qw.like("operator_name", operatorName);
        String batchNo = str(params.get("batch_no"));
        if (!batchNo.isEmpty()) qw.eq("batch_no", batchNo);
        String start = str(params.get("start_time"));
        if (!start.isEmpty()) qw.ge("create_time", start.length() == 10 ? start + " 00:00:00" : start);
        String end = str(params.get("end_time"));
        if (!end.isEmpty()) {
            if (end.length() == 10) qw.lt("create_time", LocalDate.parse(end).plusDays(1).toString() + " 00:00:00");
            else qw.le("create_time", end);
        }
        return qw;
    }

    private Long apply(Long customerId, Long score, String reason) {
        if (score > 0) {
            integrationService.addIntegration(score, null, customerId, reason);
            return null;
        }
        long need = -score;
        Long balance = integrationService.getIntegrationByCustomerId(customerId);
        long available = balance == null ? 0L : balance;
        if (available < need) throw new BusinessException("积分不足，当前可用 " + available + " 分，需扣减 " + need + " 分");
        Integration used = integrationService.useIntegration(need, customerId, reason);
        if (used == null || used.getScore() == null || used.getScore() != need) {
            // 并发消耗导致只扣到部分：抛出非业务异常，整笔事务回滚，不留半扣状态。
            throw new BalanceChangedException("积分余额已变化，请刷新后重试");
        }
        return used.getId();
    }

    private String validate(Long score, String reason) {
        if (score == null || score == 0) throw new BusinessException("变动积分数不能为 0");
        if (Math.abs(score) > MAX_ABS_SCORE) throw new BusinessException("单次变动不能超过 " + MAX_ABS_SCORE + " 分");
        String r = reason == null ? "" : reason.trim();
        if (r.isEmpty()) throw new BusinessException("请填写变动原因");
        if (r.length() > 200) throw new BusinessException("变动原因不能超过 200 字");
        return r;
    }

    private Long parseScore(String raw) {
        String s = raw.replace("积分", "").replace("分", "").replace(" ", "");
        if (!s.matches("[+-]?\\d{1,9}")) throw new BusinessException("变动积分数格式错误：" + raw);
        return Long.parseLong(s.startsWith("+") ? s.substring(1) : s);
    }

    private void requireOperator(UmsAdmin operator) {
        if (operator == null || operator.getId() == null) throw new BusinessException("登录状态已失效，请重新登录");
    }

    private IntegrationOperation base(Integer type, String batchNo, UmsAdmin operator) {
        IntegrationOperation log = new IntegrationOperation();
        log.setOpType(type);
        log.setBatchNo(batchNo);
        log.setOperatorId(operator.getId());
        log.setOperatorName(StringUtils.hasText(operator.getNickName()) ? operator.getNickName() : operator.getUsername());
        log.setCreateTime(LocalDateTime.now());
        return log;
    }

    private String newBatchNo(String prefix) {
        return prefix + LocalDateTime.now().format(BATCH) + (int) (Math.random() * 900 + 100);
    }

    private static String trim(String s) { return s == null ? "" : s.trim(); }
    private static String str(Object o) { return o == null ? "" : o.toString().trim(); }

    /** 扣减过程中余额被并发改动：必须整体回滚，不可在导入循环里被当作单行失败吞掉 */
    public static class BalanceChangedException extends PointsBalanceChangedException {
        public BalanceChangedException(String message) { super(message); }
    }
}
