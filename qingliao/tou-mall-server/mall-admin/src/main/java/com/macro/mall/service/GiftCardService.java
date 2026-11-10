package com.macro.mall.service;

import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.consts.RedisKey;
import com.macro.mall.dto.GiftCardExcel;
import com.macro.mall.entity.Activity;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.GiftCard;
import com.macro.mall.entity.GiftCardPrepaidLog;
import com.macro.mall.enums.GiftCardStatus;
import com.macro.mall.enums.GiftCardType;
import com.macro.mall.mapper.GiftCardMapper;
import com.macro.mall.mapper.GiftCardPrepaidLogMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.utils.CustomUtil;
import com.macro.mall.utils.ExcelUtil;
import com.macro.mall.utils.RedisUtil;
import org.apache.logging.log4j.util.Strings;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.function.IntFunction;
import java.util.stream.Collectors;

/**
 * 礼品卡表 服务类
 *
 * @author zkl
 * @date 2025/07/10
 */
@Service
public class GiftCardService extends BaseService<GiftCardMapper, GiftCard> {
    @Autowired
    RedisUtil redisUtil;
    @Autowired
    CustomerService customerService;
    @Autowired
    ActivityService activityService;
    @Autowired
    @Lazy
    CustomerCouponService customerCouponService;
    @Autowired
    GiftCardPrepaidLogMapper prepaidLogMapper;

    /**
     * 礼品卡预收台账：发放记面值正向，作废已发放未领取的卡记负向。
     * 按 (gift_card_id,event_type) 唯一键 + INSERT IGNORE 幂等，重复调用不会重复入账。
     */
    void recordPrepaid(List<GiftCard> cards, String eventType, Long operator) {
        if (CollectionUtils.isEmpty(cards)) {
            return;
        }
        List<GiftCardPrepaidLog> logs = new ArrayList<>(cards.size());
        for (GiftCard card : cards) {
            BigDecimal amount = card.getAmount() == null ? BigDecimal.ZERO : card.getAmount();
            GiftCardPrepaidLog log = new GiftCardPrepaidLog();
            log.setGiftCardId(card.getId());
            log.setCode(card.getCode());
            log.setActivityId(card.getActivityId());
            log.setShopId(card.getShopId());
            log.setEventType(eventType);
            log.setAmount(GiftCardPrepaidLog.VOID.equals(eventType) ? amount.negate() : amount);
            log.setOperator(operator);
            logs.add(log);
        }
        prepaidLogMapper.insertIgnore(logs);
    }

    @Override
    protected QueryWrapper<GiftCard> buildWrapper(Map<String, Object> params, QueryWrapper<GiftCard> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .like("code")
                .like("password")
                .equal("activity_id")
                .equal("status")
                .equal("type")
                .between("create_time", params.get("start_create_time"), params.get("end_create_time"))
                .between("receive_time", params.get("start_receive_time"), params.get("end_receive_time"))
                .between("failure_time")
                .in("customer_id")
                .like("limitations")
                .getQueryWrapper();
    }

    public PageInfo<GiftCard> pageInfo(Map<String, Object> params) {
        Object phone = params.get("phone");
        if (phone != null && Strings.isNotBlank(phone.toString())) {
            List<Long> customerIdList = customerService.findIdListByPhoneOrName(phone.toString());
            params.put("customerId", CustomUtil.longList2String(customerIdList));
        }
        PageInfo<GiftCard> page = page(params);
        buildCustomer(page.getList());
        return page;
    }

    public void buildCustomer(List<GiftCard> giftCardList) {
        if (CollectionUtils.isEmpty(giftCardList)) {
            return;
        }
        List<Long> customerIds = giftCardList.stream().filter(e -> !ObjUtil.isEmpty(e.getCustomerId())).distinct().map(GiftCard::getCustomerId).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(customerIds)) {
            return;
        }
        List<Customer> customerList = customerService.listByIds(customerIds);
        Map<Long, Customer> customerMap = customerList.stream().collect(Collectors.toMap(Customer::getId, Function.identity()));
        giftCardList.forEach(e -> {
            if (!ObjUtil.isEmpty(e.getCustomerId())) {
                e.setCustomer(customerMap.get(e.getCustomerId()));
            }
        });
    }


    private static final String CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private static final SecureRandom random = new SecureRandom();
    private static final int generateMaxCount = 1000;

    // 生成10位code
    public List<String> generate10DigitCode(int count) {
        return generateBUniqueString("code", 10, count);
    }

    // 生成8位password
    public List<String> generate8DigitPassword(int count) {
        return generateBUniqueString("password", 8, count);
    }

    // 生成单个随机字符串
    private List<String> generateRandomStrings(int length, int count) {
        List<String> result = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            StringBuilder sb = new StringBuilder(length);
            for (int j = 0; j < length; j++) {
                sb.append(CHARACTERS.charAt(random.nextInt(CHARACTERS.length())));
            }
            result.add(sb.toString());
        }
        return result;
    }

    private List<String> generateBUniqueString(String columnName, int length, int count) {
        List<String> candidates = new ArrayList<>();
        String preKey = RedisKey.CANDIDATES + columnName;
        int maxCount = count / 3;
        while (CollectionUtils.isEmpty(candidates)) {
            List<String> preCandidates = generateRandomStrings(length, count < generateMaxCount ? count : maxCount);
            preCandidates = preCandidates.stream().distinct().collect(Collectors.toList());
            for (int i = 0; i < preCandidates.size(); i++) {
                String candidate = preCandidates.get(i);
                String existsKey = preKey + candidate;
                if (redisUtil.hasKey(existsKey)) {
                    preCandidates = preCandidates.stream().filter(e -> !candidate.contains(e)).collect(Collectors.toList());
                    continue;
                }
                redisUtil.setObj(existsKey, 1,1, TimeUnit.DAYS);
            }
            if (CollectionUtils.isEmpty(preCandidates)) {
                continue;
            }
            List<String> existCandidates = existingValues(columnName, preCandidates);
            if (!CollectionUtils.isEmpty(existCandidates)) {
                preCandidates = preCandidates.stream().filter(e -> !existCandidates.contains(e)).collect(Collectors.toList());
            }
            if (!CollectionUtils.isEmpty(preCandidates)) {
                candidates = preCandidates;
            }
        }
        return candidates;
    }

    /**
     * 验证数据库中是否存在值
     *
     * @param columnName
     * @param candidates
     * @return
     */
    private List<String> existingValues(String columnName, List<String> candidates) {
        QueryWrapper<GiftCard> qw = new QueryWrapper<>();
        qw.select("id", "code", "password");
        qw.apply("BINARY " + columnName + " IN (" +
                candidates.stream().map(s -> "'" + s + "'").collect(Collectors.joining(",")) + ")");
        return list(qw).stream()
                .map(gc -> "code".equals(columnName) ? gc.getCode() : gc.getPassword())
                .collect(Collectors.toList());
    }

    @Transactional(rollbackFor = Exception.class)
    public void batchAdd(GiftCard giftCard) {
        Integer cardCount = giftCard.getCardCount();
        if (ObjUtil.isEmpty(cardCount) || cardCount == 0) {
            throw new BusinessException("卡数必须大于0");
        }
        if (cardCount > 5000) {
            throw new BusinessException("卡数必须小于5000张");
        }
        if (ObjUtil.isEmpty(giftCard.getNumber())) {
            throw new BusinessException("单卡兑券数量必填");
        }
        if (ObjUtil.isEmpty(giftCard.getActivityId())) {
            throw new BusinessException("活动编码必填");
        }
        Activity activity = activityService.getById(giftCard.getActivityId());
        if (StrUtil.isBlank(activity.getCode()) || !activityService.codeCheckDoing(activity.getCode())) {
            throw new BusinessException("活动编码已失效，不允许生成礼品卡");
        }
        giftCard.setCouponId(NormalConst.GIVE_COUPON_ID);
        giftCard.setType(GiftCardType.OFFLINE.getValue());
        giftCard.setStatus(GiftCardStatus.TO_BE_DISTRIBUTED.getValue());
        List<GiftCard> giftCardList = new ArrayList<>();
        CompletableFuture<Set<String>> codesFuture = CompletableFuture.supplyAsync(() ->
                generateUniqueValues(cardCount, this::generate10DigitCode));
        CompletableFuture<Set<String>> passwordsFuture = CompletableFuture.supplyAsync(() ->
                generateUniqueValues(cardCount, this::generate8DigitPassword));
        Set<String> generatedCodes = codesFuture.join();
        Set<String> generatedPasswords = passwordsFuture.join();
        Iterator<String> codeIterator = generatedCodes.iterator();
        Iterator<String> passwordIterator = generatedPasswords.iterator();
        for (Integer i = 0; i < cardCount; i++) {
            GiftCard newGiftCard = new GiftCard();
            BeanUtils.copyProperties(giftCard, newGiftCard);
            newGiftCard.setCode(codeIterator.next());
            newGiftCard.setPassword(passwordIterator.next());
            giftCardList.add(newGiftCard);
        }
        try {
            saveBatch(giftCardList);
        } catch (DuplicateKeyException e) {
            cleanUpRedisCandidates(giftCardList);
            throw new BusinessException("生成 code/password 冲突，请重试", e);
        } catch (Exception e) {
            cleanUpRedisCandidates(giftCardList);
            throw new BusinessException(e.getMessage());
        }
    }

    private Set<String> generateUniqueValues(int targetSize, IntFunction<List<String>> generator) {
        Set<String> container = new LinkedHashSet<>(targetSize);
        while (container.size() <= targetSize) {
            List<String> stringList = generator.apply(targetSize);
            container.addAll(stringList);
        }
        return container;
    }

    private void cleanUpRedisCandidates(List<GiftCard> giftCardList) {
        if (CollectionUtils.isEmpty(giftCardList)) {
            return;
        }
        String codePreKey = RedisKey.CANDIDATES + "code";
        String passwordPreKey = RedisKey.CANDIDATES + "password";
        List<String> delKeyList = new ArrayList<>();
        for (int i = 0; i < giftCardList.size(); i++) {
            delKeyList.add(codePreKey + giftCardList.get(i).getCode());
            delKeyList.add(passwordPreKey + giftCardList.get(i).getPassword());
        }
        redisUtil.deleteData(delKeyList);
    }

    @Transactional(rollbackFor = Exception.class)
    public void distribution(Long id, Long distributionUser) {
        GiftCard giftCard = getById(id);
        if (!GiftCardStatus.TO_BE_DISTRIBUTED.getValue().equals(giftCard.getStatus())) {
            throw new BusinessException("此礼品卡当前状态为【" + GiftCardStatus.getLabel(giftCard.getStatus()) + "】,已不允许发放操作");
        }
        giftCard.setStatus(GiftCardStatus.TO_BE_RECEIVED.getValue());
        giftCard.setDistributionTime(LocalDateTime.now());
        giftCard.setDistributionUser(distributionUser);
        updateById(giftCard);
        recordPrepaid(Collections.singletonList(giftCard), GiftCardPrepaidLog.DISTRIBUTE, distributionUser);
    }

    @Transactional(rollbackFor = Exception.class)
    public void batchDistribution(List<Long> ids, Long distributionUser) {
        List<GiftCard> giftCardList = listByIds(ids);
        List<String> codeList = giftCardList.stream().filter(e -> !GiftCardStatus.TO_BE_DISTRIBUTED.getValue().equals(e.getStatus())).map(GiftCard::getCode).collect(Collectors.toList());
        if (!CollectionUtils.isEmpty(codeList)) {
            String collect = codeList.stream().collect(Collectors.joining(","));
            throw new BusinessException("礼品卡码为【" + collect + "】的卡状态不符合发放条件,已不允许发放操作");
        }
        LocalDateTime now = LocalDateTime.now();
        giftCardList.forEach(
                e -> {
                    e.setStatus(GiftCardStatus.TO_BE_RECEIVED.getValue());
                    e.setDistributionTime(now);
                    e.setDistributionUser(distributionUser);
                }
        );
        updateBatchById(giftCardList);
        recordPrepaid(giftCardList, GiftCardPrepaidLog.DISTRIBUTE, distributionUser);
    }

    @Transactional(rollbackFor = Exception.class)
    public void failure(Long id) {
        GiftCard giftCard = getById(id);
        if (GiftCardStatus.EXPIRED.getValue().equals(giftCard.getStatus()) || GiftCardStatus.RECEIVED.getValue().equals(giftCard.getStatus())) {
            throw new BusinessException("此礼品卡当前状态为【" + GiftCardStatus.getLabel(giftCard.getStatus()) + "】,已不允许失效操作");
        }
        boolean wasDistributed = GiftCardStatus.TO_BE_RECEIVED.getValue().equals(giftCard.getStatus());
        giftCard.setFailureTime(LocalDateTime.now());
        giftCard.setStatus(GiftCardStatus.EXPIRED.getValue());
        updateById(giftCard);
        if (wasDistributed) {
            recordPrepaid(Collections.singletonList(giftCard), GiftCardPrepaidLog.VOID, null);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void batchFailure(List<Long> ids) {
        List<GiftCard> giftCardList = listByIds(ids);
        List<String> codeList = giftCardList.stream()
                .filter(e -> GiftCardStatus.EXPIRED.getValue().equals(e.getStatus()) || GiftCardStatus.RECEIVED.getValue().equals(e.getStatus()))
                .map(GiftCard::getCode).collect(Collectors.toList());
        if (!CollectionUtils.isEmpty(codeList)) {
            String collect = codeList.stream().collect(Collectors.joining(","));
            throw new BusinessException("礼品卡码为【" + collect + "】的卡状态不符合失效条件,已不允许失效操作");
        }
        List<GiftCard> distributedCards = giftCardList.stream()
                .filter(e -> GiftCardStatus.TO_BE_RECEIVED.getValue().equals(e.getStatus()))
                .collect(Collectors.toList());
        LocalDateTime now = LocalDateTime.now();
        giftCardList.forEach(
                e -> {
                    e.setFailureTime(now);
                    e.setStatus(GiftCardStatus.EXPIRED.getValue());
                }
        );
        updateBatchById(giftCardList);
        recordPrepaid(distributedCards, GiftCardPrepaidLog.VOID, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public String receive(Long customerId, String password) {
        String lockValue = NormalConst.giftCardLockKey + password;
        synchronized (lockValue.intern()) {
            LambdaQueryWrapper<GiftCard> lqw = new LambdaQueryWrapper<>();
            lqw.eq(GiftCard::getPassword, password);
            GiftCard giftCard = getOnlyOne(lqw);
            if (giftCard == null) {
                throw new BusinessException("券码无效");
            }
            if (!GiftCardStatus.TO_BE_RECEIVED.getValue().equals(giftCard.getStatus())) {
                throw new BusinessException("礼品卡状态异常，不可领取");
            }
            giftCard.setStatus(GiftCardStatus.RECEIVED.getValue());
            giftCard.setCustomerId(customerId);
            giftCard.setReceiveTime(LocalDateTime.now());
            updateById(giftCard);
            customerCouponService.giveCoupon(giftCard);
            int minutes = giftCard.getNumber() * NormalConst.PER_COUPON_COST_MINUTES;
            return "恭喜！成功领取 " + minutes + " 分钟Full愈券";
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void importBatchSave(MultipartFile giftCardFile, Long shopId, Long createUser) {
        List<Map<Integer, String>> mapList = ExcelUtil.doReadExcelMapList(giftCardFile, 0, 0);
        if (CollectionUtils.isEmpty(mapList)) {
            throw new BusinessException("导入文件无数据");
        }
        Integer activityCodeKey = null;
        Integer passwordKey = null;
        Integer numberKey = null;
        Integer validDateKey = null;
        Integer limitationsKey = null;
        Integer amountKey = null;
        Map<Integer, String> heardRow = mapList.get(0);
        for (Integer key : heardRow.keySet()) {
            String value = heardRow.get(key);
            if ("活动编码".equals(value) || "用途code".equals(value)) {
                activityCodeKey = key;
            } else if ("密码".equals(value)) {
                passwordKey = key;
            } else if ("兑换券数量".equals(value)) {
                numberKey = key;
            } else if ("兑换券有效天数".equals(value)) {
                validDateKey = key;
            } else if ("使用限制".equals(value)) {
                limitationsKey = key;
            } else if ("面值".equals(value)) {
                amountKey = key;
            }
        }
        if (activityCodeKey == null) {
            throw new BusinessException("未检测到活动编码列存在，导入失败");
        }
        if (passwordKey == null) {
            throw new BusinessException("未检测到密码列存在，导入失败");
        }
        if (numberKey == null) {
            throw new BusinessException("未检测到兑换券数量列存在，导入失败");
        }
        if (validDateKey == null) {
            throw new BusinessException("未检测到兑换券有效天数列存在，导入失败");
        }
        if (limitationsKey == null) {
            //throw new BusinessException("未检测到使用限制列存在，导入失败");
        }
        List<Map<Integer, String>> resultList = mapList.subList(1, mapList.size());
        if (resultList.size() > 5000) {
            throw new BusinessException("卡数必须小于5000张");
        }
        Integer finalActivityCodeKey = activityCodeKey;
        List<String> activityCodes = resultList.stream().filter(e -> !ObjUtil.isEmpty(e.get(finalActivityCodeKey))).map(e -> e.get(finalActivityCodeKey)).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(activityCodes)) {
            throw new BusinessException("未检测到活动编码列有值存在，导入失败");
        }
        if (activityCodes.size() != resultList.size()) {
            throw new BusinessException("检测到code列有空值存在，导入失败");
        }
        Integer finalPasswordKey = passwordKey;
        List<String> passwordList = resultList.stream().filter(e -> !ObjUtil.isEmpty(e.get(finalPasswordKey))).map(e -> e.get(finalPasswordKey)).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(passwordList)) {
            throw new BusinessException("未检测到密码列有值存在，导入失败");
        }
        if (passwordList.size() != resultList.size()) {
            throw new BusinessException("检测到密码列有空值存在，导入失败");
        }
        long noDistinctCount = passwordList.stream().distinct().count();
        int size = passwordList.size();
        if (size != noDistinctCount) {
            throw new BusinessException("密码存在重复值，请检查数据之后重新提交");
        }
        Integer finalNumberKey = numberKey;
        List<String> numberList = resultList.stream().filter(e -> !ObjUtil.isEmpty(e.get(finalNumberKey))).map(e -> e.get(finalNumberKey)).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(numberList)) {
            throw new BusinessException("未检测到兑换券数量列有值存在，导入失败");
        }
        if (numberList.size() != resultList.size()) {
            throw new BusinessException("检测到兑换券数量列有空值存在，导入失败");
        }
        try {
            numberList.stream()
                    .map(Integer::parseInt)
                    .collect(Collectors.toList());
        } catch (NumberFormatException e) {
            throw new BusinessException("检测到兑换券数量列有不是数字值存在，导入失败");
        }
        Integer finalValidDateKey = validDateKey;
        List<String> validDateList = resultList.stream().filter(e -> !ObjUtil.isEmpty(e.get(finalValidDateKey))).map(e -> e.get(finalValidDateKey)).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(validDateList)) {
            throw new BusinessException("未检测到兑换券有效天数列有值存在，导入失败");
        }
        if (validDateList.size() != resultList.size()) {
            throw new BusinessException("检测到兑换券有效天数列有空值存在，导入失败");
        }
        try {
            validDateList.stream()
                    .map(Integer::parseInt)
                    .collect(Collectors.toList());
        } catch (NumberFormatException e) {
            throw new BusinessException("检测到兑换券有效天数列有不是数字值存在，导入失败");
        }
        activityCodes = activityCodes.stream().distinct().collect(Collectors.toList());
        List<Activity> activityList = activityService.listByCodes(activityCodes);
        if (CollectionUtils.isEmpty(activityList)) {
            throw new BusinessException("无法根据传入的活动编码查询到活动");
        }
        if (activityList.size() != activityCodes.size()) {
            List<String> collect = activityList.stream().map(Activity::getCode).collect(Collectors.toList());
            List<String> noExistList = activityCodes.stream().filter(e -> !collect.contains(e)).collect(Collectors.toList());
            String noExistCodeStr = noExistList.stream().collect(Collectors.joining(","));
            throw new BusinessException("活动编码【" + noExistCodeStr + "】在活动表内不存在，请检查数据之后重新提交");
        }
        checkByPasswordList(passwordList);
        Map<String, Long> activityMap = activityList.stream().collect(Collectors.toMap(Activity::getCode, Activity::getId));
        List<GiftCard> newGiftCardList = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        Set<String> generatedCodes = generateUniqueValues(resultList.size(), this::generate10DigitCode);
        Iterator<String> codeIterator = generatedCodes.iterator();
        for (int i = 0; i < resultList.size(); i++) {
            Map<Integer, String> map = resultList.get(i);
            GiftCard newGiftCard = new GiftCard();
            newGiftCard.setActivityId(activityMap.get(map.get(finalActivityCodeKey)));
            newGiftCard.setShopId(shopId);
            newGiftCard.setCode(codeIterator.next());
            newGiftCard.setPassword(map.get(finalPasswordKey));
            newGiftCard.setCouponId(NormalConst.GIVE_COUPON_ID);
            newGiftCard.setNumber(Integer.valueOf(map.get(finalNumberKey)));
            newGiftCard.setValidDate(Integer.valueOf(map.get(finalValidDateKey)));
            newGiftCard.setStatus(GiftCardStatus.TO_BE_RECEIVED.getValue());
            newGiftCard.setType(GiftCardType.MALL.getValue());
            newGiftCard.setDistributionTime(now);
            newGiftCard.setDistributionUser(createUser);
            if (limitationsKey != null) {
                newGiftCard.setLimitations(map.get(limitationsKey));
            }
            newGiftCard.setAmount(parseFaceValue(amountKey == null ? null : map.get(amountKey), i + 2));
            newGiftCard.setCreateUser(createUser);
            newGiftCardList.add(newGiftCard);
        }
        try {
            saveBatch(newGiftCardList);
        } catch (DuplicateKeyException e) {
            cleanUpRedisCandidates(newGiftCardList);
            throw new BusinessException("生成 code/password 冲突，请重试", e);
        } catch (Exception e) {
            cleanUpRedisCandidates(newGiftCardList);
            throw new BusinessException(e.getMessage());
        }
        // 导入即视为已发放（状态待领取），按面值记预收
        recordPrepaid(newGiftCardList, GiftCardPrepaidLog.DISTRIBUTE, createUser);
    }

    /** 面值列可选：空或缺列记 0；非数字或负数直接拒绝导入，避免预收台账出现错账。 */
    private BigDecimal parseFaceValue(String raw, int excelRow) {
        if (raw == null || raw.trim().isEmpty()) {
            return BigDecimal.ZERO;
        }
        try {
            BigDecimal value = new BigDecimal(raw.trim()).setScale(2, BigDecimal.ROUND_HALF_UP);
            if (value.signum() < 0) {
                throw new BusinessException("第" + excelRow + "行面值不能为负数，导入失败");
            }
            return value;
        } catch (NumberFormatException e) {
            throw new BusinessException("第" + excelRow + "行面值不是数字，导入失败");
        }
    }

    /** 预收台账分页 + 按当前筛选条件的汇总（汇总不受分页影响）。 */
    public Map<String, Object> prepaidPage(Map<String, Object> params) {
        int pageNum = parsePositive(params.get("pageNum"), 1);
        int pageSize = Math.min(parsePositive(params.get("pageSize"), 20), 200);
        Map<String, Object> query = new HashMap<>();
        for (String key : new String[]{"startTime", "endTime", "eventType", "code"}) {
            Object v = params.get(key);
            if (v != null && StrUtil.isNotBlank(v.toString())) {
                query.put(key, v.toString().trim());
            }
        }
        Object activityId = params.get("activityId");
        if (activityId != null && StrUtil.isNotBlank(activityId.toString())) {
            query.put("activityId", Long.valueOf(activityId.toString().trim()));
        }
        query.put("offset", (pageNum - 1) * pageSize);
        query.put("size", pageSize);
        Map<String, Object> summary = prepaidLogMapper.summary(query);
        Map<String, Object> result = new HashMap<>();
        result.put("list", prepaidLogMapper.page(query));
        result.put("pageNum", pageNum);
        result.put("pageSize", pageSize);
        result.put("total", summary == null ? 0 : summary.get("total"));
        result.put("summary", summary);
        return result;
    }

    private int parsePositive(Object raw, int fallback) {
        try {
            int v = raw == null ? fallback : Integer.parseInt(raw.toString().trim());
            return v > 0 ? v : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    public Boolean checkByPasswordList(List<String> passwordList) {
        LambdaQueryWrapper<GiftCard> lqw = new LambdaQueryWrapper<>();
        lqw.in(GiftCard::getPassword, passwordList);
        List<GiftCard> list = list(lqw);
        if (!CollectionUtils.isEmpty(list)) {
            String collect = list.stream().map(GiftCard::getPassword).collect(Collectors.joining(","));
            throw new BusinessException("密码【" + collect + "】在礼品卡表内已存在，请检查数据之后重新提交");
        }
        return true;
    }

    public void export(Map<String, Object> params) {
        List<GiftCard> giftCardList = listNoPage(params);
        if (CollectionUtils.isEmpty(giftCardList)) {
            throw new BusinessException("无法根据当前参数查询到数据");
        }
        buildCustomer(giftCardList);
        List<Activity> activityList = activityService.list();
        if (CollectionUtils.isEmpty(activityList)) {
            throw new BusinessException("活动列表无数据，无法导出");
        }
        Map<Long, String> activityTitleMap = activityList.stream().collect(Collectors.toMap(Activity::getId, Activity::getTitle));
        List<GiftCardExcel> giftCardExcels = giftCardList.stream().map(e -> {
            GiftCardExcel cardExcel = new GiftCardExcel();
            BeanUtils.copyProperties(e, cardExcel);
            Long activityId = e.getActivityId();
            cardExcel.setActivityTitle(activityTitleMap.get(activityId));
            cardExcel.setNumberLabel(e.getNumber() + "张");
            cardExcel.setStatusLabel(GiftCardStatus.getLabel(e.getStatus()));
            cardExcel.setTypeLabel(GiftCardType.getLabel(e.getType()));
            if (e.getValidDate() == null || e.getValidDate() == 0) {
                cardExcel.setValidDateStr("永久");
            } else {
                cardExcel.setValidDateStr(e.getValidDate() + "天");
            }
            if (e.getCustomerId() != null && e.getCustomer() != null) {
                cardExcel.setCustomerNickname(customerService.findCustomerNickname(e.getCustomer()));
                cardExcel.setCustomerPhone(e.getCustomer().getPhone());
            }
            return cardExcel;
        }).collect(Collectors.toList());
        ExcelUtil.export(giftCardExcels, GiftCardExcel.class, "礼品卡列表.xlsx");

    }
}