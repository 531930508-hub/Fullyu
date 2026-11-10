package com.macro.mall.service.approval;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.GiftCustomerCoupon;
import com.macro.mall.enums.CustomerCouponType;
import com.macro.mall.enums.FlowState;
import com.macro.mall.enums.approval.FlowCategoryCode;
import com.macro.mall.mapper.GiftCustomerCouponMapper;
import com.macro.mall.service.*;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.utils.DateUtil;
import com.macro.mall.utils.ExcelUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.alibaba.excel.EasyExcel;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.util.*;

/**
 * 服务类
 *
 * @author zkl
 * @date 2025/06/20
 */
@Service
public class GiftCustomerCouponService extends BaseService<GiftCustomerCouponMapper, GiftCustomerCoupon> implements ApprovalRelation {
    @Autowired
    CustomerCouponService customerCouponService;
    @Autowired
    ApprovalService approvalService;
    @Autowired
    CouponService couponService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void changeRelateRecordState(Long approvalId, FlowState state) {
        GiftCustomerCoupon gift = getOne(new LambdaQueryWrapper<GiftCustomerCoupon>()
                .eq(GiftCustomerCoupon::getApprovalId, approvalId).last("FOR UPDATE"));
        if (gift == null) throw new BusinessException("赠券申请不存在");
        if (state == null) throw new BusinessException("赠券审批状态不正确");
        if (state.getValue().equals(gift.getState())) return;
        if (FlowState.PASSED.getValue().equals(gift.getState()))
            throw new BusinessException("已发放赠券不可重复修改审批结果");
        if (FlowState.PASSED.equals(state)) {
            validate(gift);
            if (!FlowState.APPROVING.getValue().equals(gift.getState()))
                throw new BusinessException("赠券申请当前不可发放");
            customerCouponService.giveCoupon(gift.getCouponNumber(), gift.getCustomerId(), CustomerCouponType.NORMAL,
                    gift.getCouponId(), gift.getId(), gift.getStartTime(), gift.getEndTime(), gift.getCouponAmount());
        }
        gift.setState(state.getValue());
        if (!updateById(gift)) throw new BusinessException("赠券申请状态保存失败");
    }

    @Override
    public void deleteByApprovalId(Long approvalId) {
        LambdaQueryWrapper<GiftCustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(GiftCustomerCoupon::getApprovalId, approvalId);
        remove(lqw);
    }

    @Override
    public GiftCustomerCoupon detail(Long approvalId) {
        return getGiftCustomerCouponByApprovalId(approvalId);
    }

    private GiftCustomerCoupon getGiftCustomerCouponByApprovalId(Long approvalId) {
        LambdaQueryWrapper<GiftCustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(GiftCustomerCoupon::getApprovalId, approvalId);
        GiftCustomerCoupon onlyOne = getOnlyOne(lqw);
        if (onlyOne == null) throw new BusinessException("赠券申请不存在");
        if (onlyOne.getCustomerId() != null) {
            Customer customer = customerService.getById(onlyOne.getCustomerId());
            onlyOne.setCustomerName(customerService.findCustomerNickname(customer));
        }
        return onlyOne;
    }

    @Autowired
    ApprovalDetailService approvalDetailService;
    @Autowired
    CustomerService customerService;

    @Transactional(rollbackFor = Exception.class)
    public void add(GiftCustomerCoupon gift) {
        validate(gift);
        if (gift.getId() != null) {
            GiftCustomerCoupon stored = getOne(new LambdaQueryWrapper<GiftCustomerCoupon>()
                    .eq(GiftCustomerCoupon::getId, gift.getId()).last("FOR UPDATE"));
            if (stored == null) throw new BusinessException("赠券申请不存在");
            if (!Objects.equals(stored.getCreateUser(), gift.getCreateUser()))
                throw new BusinessException("只能重新提交本人赠券申请");
            gift.setApprovalId(stored.getApprovalId());
            gift.setShopId(stored.getShopId());
            gift.setCouponId(stored.getCouponId());
            approvalDetailService.reSubmit(stored.getApprovalId());
            gift.setCustomerId(findCustomer(gift.getPhone()).getId());
            gift.setState(FlowState.APPROVING.getValue());
            if (!updateById(gift)) throw new BusinessException("赠券申请保存失败");
            return;
        }
        Customer customer = findCustomer(gift.getPhone());
        Long approvalId = approvalDetailService.addRelationCustomerId(customer.getId(), gift.getShopId(),
                FlowCategoryCode.GIFT_COUPON, gift.getCreateUser());
        if (approvalId == null) throw new BusinessException("赠券审批创建失败");
        gift.setApprovalId(approvalId);
        gift.setCustomerId(customer.getId());
        gift.setState(FlowState.APPROVING.getValue());
        if (!save(gift)) throw new BusinessException("赠券申请保存失败");
    }

    private Customer findCustomer(String phone) {
        Customer customer = customerService.getByPhone(phone);
        if (customer == null) {
            customer = customerService.initCustomer(phone);
            if (customer == null || !customerService.save(customer))
                throw new BusinessException("赠券客户保存失败");
        }
        return customer;
    }

    private void validate(GiftCustomerCoupon gift) {
        if (gift == null) throw new BusinessException("赠券申请不能为空");
        if (StrUtil.isBlank(gift.getPhone()) || !gift.getPhone().matches("1[3-9]\\d{9}"))
            throw new BusinessException("客户手机号不正确");
        if (gift.getShopId() == null || gift.getCreateUser() == null) throw new BusinessException("赠券申请身份不完整");
        if (gift.getCouponNumber() == null || gift.getCouponNumber() < 1 || gift.getCouponNumber() > 10000)
            throw new BusinessException("赠券数量须为1至10000的整数");
        if (gift.getStartTime() == null || gift.getEndTime() == null || gift.getEndTime().isBefore(gift.getStartTime()))
            throw new BusinessException("赠券有效期不正确");
        BigDecimal amount = gift.getCouponAmount() == null ? BigDecimal.ZERO : gift.getCouponAmount();
        if (amount.signum() < 0 || amount.stripTrailingZeros().scale() > 2
                || amount.compareTo(new BigDecimal("99999999.99")) > 0)
            throw new BusinessException("单券价值须为非负金额，最多两位小数");
        gift.setCouponAmount(amount.setScale(2));
    }

    @Transactional(rollbackFor = Exception.class)
    public void importAdd(MultipartFile file, Long shopId, Long createUser) {
        if (file == null || file.isEmpty()) throw new BusinessException("请选择赠券Excel文件");
        List<Map<Integer, String>> rows = ExcelUtil.doReadExcelMapList(file, 0, 0);
        if (rows.isEmpty()) throw new BusinessException("赠券Excel没有表头");
        Map<String, Integer> columns = new HashMap<>();
        rows.get(0).forEach((key, value) -> columns.put(value == null ? "" : value.trim(), key));
        for (String label : new String[]{"客户手机号", "赠送数量", "券有效期起", "券有效期止"})
            if (!columns.containsKey(label)) throw new BusinessException("未检测到" + label + "列存在，导入失败");
        Integer amountColumn = columns.containsKey("单券价值（元）") ? columns.get("单券价值（元）") : columns.get("单券价值");
        List<GiftCustomerCoupon> requests = new ArrayList<>();
        // 全文件先校验再写入：坏行不跳过，不提前创建客户或审批。
        for (int i = 1; i < rows.size(); i++) {
            Map<Integer, String> row = rows.get(i);
            if (row.values().stream().allMatch(StrUtil::isBlank)) continue;
            GiftCustomerCoupon gift = new GiftCustomerCoupon();
            try {
                gift.setPhone(cell(row, columns.get("客户手机号")));
                gift.setCouponNumber(new BigDecimal(cell(row, columns.get("赠送数量"))).intValueExact());
                gift.setStartTime(DateUtil.stringToLocalDate(cell(row, columns.get("券有效期起"))));
                gift.setEndTime(DateUtil.stringToLocalDate(cell(row, columns.get("券有效期止"))));
                gift.setLimitations(cell(row, columns.get("使用限制")));
                String value = cell(row, amountColumn);
                gift.setCouponAmount(StrUtil.isBlank(value) ? BigDecimal.ZERO : new BigDecimal(value));
                gift.setShopId(shopId); gift.setCreateUser(createUser);
                validate(gift);
            } catch (RuntimeException e) {
                throw new BusinessException("赠券Excel第" + (i + 1) + "行不正确，请检查手机号、数量、有效期和单券价值");
            }
            requests.add(gift);
        }
        if (requests.isEmpty()) throw new BusinessException("赠券Excel没有有效申请");
        for (GiftCustomerCoupon gift : requests) add(gift);
    }

    private String cell(Map<Integer, String> row, Integer key) {
        String value = key == null ? null : row.get(key);
        return value == null ? "" : value.trim();
    }

    public void template(HttpServletResponse response) throws IOException {
        List<List<String>> head = new ArrayList<>();
        for (String label : new String[]{"客户手机号", "赠送数量", "券有效期起", "券有效期止", "使用限制", "单券价值（元）"})
            head.add(Collections.singletonList(label));
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
        response.setHeader("Content-Disposition", "attachment;filename=" + URLEncoder.encode("批量送券申请.xlsx", "UTF-8"));
        EasyExcel.write(response.getOutputStream()).autoCloseStream(false).head(head).sheet("赠券申请").doWrite(Collections.emptyList());
    }
}