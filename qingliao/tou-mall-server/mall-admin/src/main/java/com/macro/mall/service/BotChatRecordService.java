package com.macro.mall.service;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.dto.OrderDetailDto;
import com.macro.mall.entity.BotChatRecord;
import com.macro.mall.entity.ChatBot;
import com.macro.mall.entity.Order;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.enums.*;
import com.macro.mall.mapper.BotChatRecordMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.impl.OssServiceImpl;
import com.macro.mall.service.shop.BedService;
import com.macro.mall.service.shop.ShopService;
import com.macro.mall.utils.CozeChatUtil;
import com.macro.mall.utils.DateUtil;
import com.macro.mall.utils.baidu.BaiduAsrUtil;
import lombok.extern.slf4j.Slf4j;
import lombok.var;
import org.apache.logging.log4j.util.Strings;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.*;

/**
 * 扣子对话记录 服务类
 *
 * @author zkl
 * @date 2025/06/13
 */
@Service
@Slf4j
public class BotChatRecordService extends BaseService<BotChatRecordMapper, BotChatRecord> {
    private final static String agentToken = "c5HwC0c*23HuKls,sdh(UeM3eo89fVSt";
    @Autowired
    ChatBotService chatBotService;
    @Autowired
    BaiduAsrUtil baiduAsrUtil;
    @Autowired
    @Lazy
    OrderService orderService;
    @Autowired
    @Lazy
    ProductService productService;
    @Autowired
    @Lazy
    ProjectService projectService;
    @Autowired
    @Lazy
    ShopService shopService;
    @Autowired
    OssServiceImpl ossService;
    @Autowired
    BedService bedService;
    @Autowired
    @Lazy
    CustomerService customerService;

    /**
     * agent外部调佣
     *
     * @param need
     * @param token
     * @return
     */
    public String findArriveTimeList(String need, String token) {
        log.info("agent外部调佣，need={}", need);
        if (!agentToken.equals(token)) {
            return null;
        }
        need = need.replaceAll("\n", "");
        need = need.replaceAll("\\[", "");
        need = need.replaceAll("\\]", "");
        String[] split = need.split("- ");
        String date = getValue(split, "到店日期：").replaceAll("/", "-").replaceAll("年", "-").replaceAll("月", "-").replaceAll("日", "");
        String projectTitle = getValue(split, "服务项目：");
        Integer personCount = Integer.valueOf(getValue(split, "到店人数：").replaceAll("人", "").replaceAll("位", "").replaceAll("个", "").replaceAll("个人", ""));
        Long projectId = projectService.findIdByTitle(projectTitle);
        if (projectId == null) {
            log.error("agent外部调佣,没有查到对应的项目,need={}", need);
        }
        Integer durationMinutes = Integer.valueOf(getValue(split, "放松时长：").replaceAll("分钟", "").replaceAll("min", "").replaceAll("Min", "")
                .replaceAll("MIN", "")
                .replaceAll("分", ""));
        List<JSONObject> arriveTimeList = null;
        try {
            log.info("agent外部调佣，转换参数，date={},projectTitle{},personCount={},durationMinutes={}", date, projectTitle, personCount, durationMinutes);
            arriveTimeList = orderService.findArriveTimeList(date, personCount, projectId, durationMinutes, 1L, null);
            log.info("agent外部调佣,获取到店时间段：{}", JSON.toJSONString(arriveTimeList));
        } catch (Exception e) {
            log.error("agent外部调佣,获取到店时间出错了,need={},message={}", need, e.getMessage());
            e.printStackTrace();
        }
        String result = "实在不好意思，今天店里的床位都已约满，无法为您完成预约，您可以选择其他日期预约到店，感谢您对“Full愈”品牌的支持。";
        if (!CollectionUtils.isEmpty(arriveTimeList)) {
            List<String> strings = new ArrayList<>();
            String startTime = null;
            for (int i = 0; i < arriveTimeList.size(); i++) {
                JSONObject a = arriveTimeList.get(i);
                Integer state = a.getInteger("state");
                String time = a.getString("time");
                if (state != null && state == 1) {
                    if (startTime == null) {
                        startTime = time;
                    }
                } else if (startTime != null) {
                    a = arriveTimeList.get(i - 1);
                    time = a.getString("time");
                    strings.add(startTime.equals(time) ? startTime : startTime + "到" + time);
                    startTime = null;
                }
                if (i == arriveTimeList.size() - 1 && startTime != null) {
                    strings.add(startTime.equals(time) ? startTime : startTime + "到" + time);
                }
            }
            result = String.join("、", strings);
        }
        if (Strings.isBlank(result)) {
            result = "实在不好意思，今天店里的床位都已约满，无法为您完成预约，您可以选择其他日期预约到店，感谢您对“Full愈”品牌的支持。";
            log.error("agent外部调佣,获取到店时间有数据吗，但是不满足,need={}", need);
        } else {
            result = "以下为可预约的时间段：" + result;
        }
        log.info("agent外部调佣,获取到店得到了数据,need={},message={}", need, result);
        return result;
    }

    /**
     * 预约聊天
     *
     * @param message    客户的文本问题
     * @param fileUrl    客户的语音文件地址
     * @param fileUrl    客户的语音文件时长
     * @param customerId
     * @return
     */
    public JSONObject chatReply(String message, String fileUrl, Long customerId, Integer voiceDuration,long shopId) {
        JSONObject object = new JSONObject();
        object.put("state", 0);
        object.put("messageType", "text");
        String answer = "实在不好意思，今天店里的床位都已约满，无法为您完成预约，您可以选择其他日期预约到店，感谢您对“Full愈”品牌的支持。";
        if (Strings.isBlank(message) && Strings.isNotBlank(fileUrl)) {
            message = baiduAsrUtil.discernByUrl(ossService.getFinalUrl(fileUrl));
            object.put("messageType", "voice");
            System.out.println("语音转文字内容=" + message);
        }
        boolean voiceError = Strings.isBlank(message);
        if (voiceError) {
            answer = "不好意思，客服这边没听清您发送的语音内容，您可以重新发送一下吗";
        }
        Map<String, Object> params = new HashMap<>();
        String customerName = customerService.findNameById(customerId);
        if (Strings.isNotBlank(customerName) && !customerName.startsWith("用户1")) {
            params.put("nickname", customerName);
        }
        BotChatRecord botChatRecord = buildReplyContent(customerId, message, params);
        if (!voiceError) {
            answer = botChatRecord.getAnswer();
        }
        String agentParams = botChatRecord.getAgentParams();
        if (Strings.isBlank(agentParams)) {
            agentParams = answer;
        }
        if (agentParams.contains("- 服务项目：") && agentParams.contains("- 到店日期：") && agentParams.contains("- 放松时长：") && agentParams.contains("- 到店时间：") && agentParams.contains("- 到店人数：")) {
            agentParams = agentParams.replaceAll("\n", "");
            agentParams = agentParams.replaceAll("\\[", "");
            agentParams = agentParams.replaceAll("\\]", "");
            String[] split = agentParams.split("- ");
            String date = getValue(split, "到店日期：").replaceAll("/", "-").replaceAll("年", "-").replaceAll("月", "-").replaceAll("日", "");
            String arriveTime = getValue(split, "到店时间：");
            String projectTitle = getValue(split, "服务项目：");
            String gender = getValue(split, "疗愈师性别：");
            Integer personCount = Integer.valueOf(getValue(split, "到店人数：").replaceAll("人", "").replaceAll("位", "").replaceAll("个", "").replaceAll("个人", ""));
            Long projectId = projectService.findIdByTitle(projectTitle);
            if (projectId == null) {
                log.error("智能预约，没有查到对应的项目，projectTitle={}", projectTitle);
                answer = "您稍等，系统这边显示可用床位的数据有些问题，您可以再试一次或者通过“手动预约”方式完成预约";
            } else {
                Integer durationMinutes = Integer.valueOf(getValue(split, "放松时长：").replaceAll("分钟", "").replaceAll("min", ""));
                if(durationMinutes==15){
                    durationMinutes=30;
                }
                if(durationMinutes==45){
                    durationMinutes=60;
                }
                List<JSONObject> arriveTimeList = null;
                try {
                    arriveTimeList = orderService.findArriveTimeList(date, personCount, projectId, durationMinutes, shopId, null);
                } catch (Exception e) {
                    answer = e.getMessage();
                }
                if (!CollectionUtils.isEmpty(arriveTimeList)) {
                    log.info("回复下单，获取到了到店时间，timeList={}",JSONObject.toJSONString(arriveTimeList));
                    JSONObject match = null;
                    JSONObject afterMatch = null;
                    for (JSONObject o : arriveTimeList) {
                        Integer state = o.getInteger("state");
                        if (state == null || state == 0) {
                            continue;
                        }
                        String time = o.getString("time");
                        if (arriveTime.equals(time)) {
                            match = o;
                            break;
                        }
                        if (arriveTime.compareTo(time) < 0) {
                            afterMatch = o;
                            break;
                        }
                    }
                    if (match != null || afterMatch != null) {
                        JSONObject timeObjet = null;
                        if (match != null) {
                            timeObjet = match;
                        } else if (afterMatch != null) {
                            timeObjet = afterMatch;
                        }
                        log.info("回复下单，拿到了匹配时间，object={}",JSONObject.toJSONString(timeObjet));
                        JSONArray shopList = timeObjet.getJSONArray("shopList");
                        if (!CollectionUtils.isEmpty(shopList)) {
                            log.info("回复下单，拿到了店铺数据，shopList={}",JSONObject.toJSONString(shopList));
                            JSONObject o = (JSONObject) shopList.get(0);
                            boolean r = true;
                            OrderDetailDto dto = new OrderDetailDto();
                            Integer state = o.getInteger("state");
                            if (state == null || state == 0) {
                                r = false;
                            } else {
                                JSONObject shop = o.getJSONObject("shop");
                                if (shop == null) {
                                    r = false;
                                } else {
                                   // dto.setShopId(shop.getLong("id"));
                                    dto.setShopId(shopId);
                                }
                            }
                            if (r) {
                                Long productId = productService.findIdByProjectId(projectId);
                                dto.setProductId(productId);
                                dto.setType(OrderType.PRODUCT.getValue());
                                dto.setDurationMinutes(durationMinutes);
                                dto.setPersonCount(personCount);
                                LocalDateTime startTime = DateUtil.string2DateTime(date + " " + arriveTime + ":00");
                                dto.setStartTime(startTime);
                                dto.setCustomerId(customerId);
                                dto.setAppointmentType(AppointmentType.AGENT.getValue());
                                dto.setComment("智能预约下单");
                                dto.setPayType(OrderPayType.WECHAT.getValue());
                                Long orderId = orderService.buildOrder(dto, NormalConst.ORDER_TIMEOUT_SECONDS, false);
                                if (orderId == null) {
                                    answer = "您稍等，系统这边显示可用床位的数据有些问题，您可以再试一次或者通过“手动预约”方式完成预约";
                                } else {
                                    object.put("state", 1);
                                    try {
                                        Order order = orderService.infoWithDetail(orderId);
                                        List<OrderDetail> orderDetailList = order.getOrderDetailList();
                                        OrderDetail detail = orderDetailList.get(0);
                                        botChatRecord.setOrderId(orderId);
                                        object.put("orderId", orderId);
                                        object.put("arriveTime", date + " " + arriveTime);
                                        object.put("personCount", personCount);
                                        object.put("durationMinutes", durationMinutes);
                                        object.put("shopTitle", o.getString("name"));
                                        object.put("bedTitle", bedService.findNameById(detail.getBedId()));
                                        object.put("projectTitle", projectTitle);
                                        object.put("orderState", 1);
                                        answer = "已为您生成订单，请确认";
                                    } catch (Exception e) {
                                        log.error("智能预约下单失败，message{}", e.getMessage());
                                        e.printStackTrace();
                                        answer = "您稍等，系统这边显示可用床位的数据有些问题，您可以再试一次或者通过“手动预约”方式完成预约";
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        answer = answer.replace("output1", "");
        object.put("answer", answer);
        if (botChatRecord.getId() != null) {
            botChatRecord.setFileUrl(fileUrl);
            botChatRecord.setVoiceDuration(voiceDuration);
            object.put("messageType", "voice");
            object.put("fileUrl", fileUrl);
            updateById(botChatRecord);
        }
        return object;
    }

    public static void main(String[] args) {
        String agentParams = "没问题哈，您的预约已经成功啦~下面是您的预约信息：\n" +
                "- 服务项目：[沉浸头疗]\n" +
                "- 到店人数：[1]\n" +
                "- 到店日期：[2025年06月27日]\n" +
                "- 到店时间：[17:00]\n" +
                "- 放松时长：[45分钟]\n" +
                "- 疗愈师性别：[空]\n" +
                "\n" +
                "我们明天下午5点在店里等着您，祝您生活愉快！";


        if (agentParams.contains("- 服务项目：") && agentParams.contains("- 到店日期：") && agentParams.contains("- 放松时长：") && agentParams.contains("- 到店时间：") && agentParams.contains("- 到店人数：")) {
            System.out.println("有项目");
        }
//        answer = answer.replaceAll("\n", "");
//        answer = answer.replaceAll("\\[", "");
//        answer = answer.replaceAll("\\]", "");
//        String[] split = answer.split("- ");
//        String date = getValue(split, "到店日期：").replaceAll("/", "-").replaceAll("年", "-").replaceAll("月", "-").replaceAll("日", "");
//        String arriveTime = getValue(split, "到店时间：");
//        String projectTitle = getValue(split, "服务项目：");
//        String gender = getValue(split, "疗愈师性别：");
//        Integer personCount = Integer.valueOf(getValue(split, "到店人数：").replaceAll("人", "").replaceAll("位", "").replaceAll("个", "").replaceAll("个人", ""));
//
//        System.out.println(date);
//        System.out.println(arriveTime);
//        System.out.println(projectTitle);
//        System.out.println(gender);
//        System.out.println(personCount);
    }

    public String uploadVoiceFile(MultipartFile multipartFile) {
        try {
            File tempFile = File.createTempFile("tempVoice" + System.currentTimeMillis(), ".mp3");
            try (var inputStream = multipartFile.getInputStream()) {
                Files.copy(inputStream, tempFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
            }
            String s = ossService.uploadFile(tempFile, "voice");

            if (tempFile != null) {
                tempFile.delete();
            }
            return s;
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    private static String getValue(String[] split, String key) {
        for (String s : split) {
            if (s.contains(key)) {
                String[] split1 = s.split(key);
                if (split1.length > 1) {
                    return split1[1].replaceAll(" ","");
                }
                return null;
            }
        }
        return null;
    }

    /**
     * 获取回复内容
     *
     * @param customerId 客户id
     * @param message    客户的问题
     * @param params     额外参数（扣子变量）
     * @return 回复的答案
     */
    private BotChatRecord buildReplyContent(Long customerId, String message, Map<String, Object> params) {
        BotChatRecord botChatRecord = new BotChatRecord();
        botChatRecord.setQuestion(message);
        botChatRecord.setCustomerId(customerId);
        String answer = "抱歉，系统服务出了点小问题，请您重新表达您的预约需求或者通过“手动预约”方式完成预约";
        botChatRecord.setAnswer(answer);
        ChatBot chatBot = chatBotService.findBotByType(CozeBotType.REPLY_MESSAGE.getValue());
        if (chatBot == null) {
            log.error("扣子获取答案失败，没有chatBot，customerId={},message={}", customerId, message);
            save(botChatRecord);
            return botChatRecord;
        }
        String botId = chatBot.getBotId();
        if (Strings.isBlank(botId)) {
            log.error("扣子获取答案失败，没有botId，customerId={},message={}", customerId, message);
            save(botChatRecord);
            return botChatRecord;
        }
        String botVersion = chatBot.getVersion();
        String secretToken = chatBot.getSecretToken();
        if (Strings.isBlank(secretToken)) {
            log.error("扣子获取答案失败，没有secretToken，customerId={},message={}", customerId, message);
            save(botChatRecord);
            return botChatRecord;
        }
        try {
            List<BotChatRecord> historyChats = findLastChat(customerId, botVersion, botId,null);
            String conversationId = null;
            if (!CollectionUtils.isEmpty(historyChats)) {
                BotChatRecord lastChat = historyChats.get(historyChats.size() - 1);
                if (lastChat != null && botId.equals(lastChat.getBotId())) {
                    conversationId = lastChat.getConversationId();
                }
            }
            String userId = null;
            String chatId = null;
            JSONObject chat = new JSONObject();
            CozeChatUtil.init(chatBot);
            userId = botId + customerId + DateUtil.getCurrentDateCode().replaceAll("-","");
            if (params == null) {
                params = new HashMap<>();
            }
            if (Strings.isNotBlank(message)) {
                chat = CozeChatUtil.askBotAndGetAnswer(message, userId, conversationId, params, null);
                if (chat == null) {
                    save(botChatRecord);
                    return botChatRecord;
                }
                chatId = chat.getString("chatId");
                conversationId = chat.getString("conversationId");
                if (Strings.isBlank(chatId)) {
                    log.error("获取答案失败，customerId={},message={}", customerId, message);
                    save(botChatRecord);
                    return botChatRecord;
                }
                answer = chat.getString("answer");
            } else {
                log.error("扣子获取答案失败，没有输入问题，customerId={},message={}", customerId, message);
            }
            if (Strings.isBlank(answer)) {
                log.error("扣子获取答案失败，没有答案，customerId={},message={}", customerId, message);
                save(botChatRecord);
                return botChatRecord;
            }
            botChatRecord.setCustomerId(customerId);
            botChatRecord.setConversationId(conversationId);
            botChatRecord.setBotVersion(botVersion);
            botChatRecord.setChatId(chatId);
            botChatRecord.setState(2);
            botChatRecord.setAnswer(answer);
            botChatRecord.setQuestion(message);
            botChatRecord.setAgentParams(chat.getString("params"));
            botChatRecord.setBotId(botId);
            botChatRecord.setCreateTime(LocalDateTime.now());
            save(botChatRecord);
            return botChatRecord;
        } catch (Exception e) {
            log.error("扣子获取答案失败，customerId={},message={}", customerId, message);
            e.printStackTrace();
            saveOrUpdate(botChatRecord);
            return botChatRecord;
        }
    }

    @Override
    protected QueryWrapper<BotChatRecord> buildWrapper(Map<String, Object> params, QueryWrapper<BotChatRecord> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .equal("customer_id")
                .ge("create_time")
                .getQueryWrapper();

    }

    private List<BotChatRecord> findLastChat(Long customerId, String botVersion, String botId, Integer historyCount) {
        LambdaQueryWrapper<BotChatRecord> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(BotChatRecord::getCustomerId, customerId);
        queryWrapper.eq(BotChatRecord::getBotId, botId);
        if (Strings.isNotBlank(botVersion)) {
            queryWrapper.eq(BotChatRecord::getBotVersion, botVersion);
        }
        queryWrapper.orderByAsc(BotChatRecord::getId);
        queryWrapper.select(BotChatRecord::getId, BotChatRecord::getConversationId, BotChatRecord::getBotId, BotChatRecord::getCreateTime, BotChatRecord::getQuestion, BotChatRecord::getAnswer);
        if (historyCount == null) {
            historyCount = 1;
        }
        queryWrapper.last("limit " + historyCount);
        return list(queryWrapper);
    }

    public List<JSONObject> pageList(Map<String, Object> params) {
        Object customerIdObj = params.get("customerId");
        if (customerIdObj == null){
            return Collections.emptyList();
        }
        List<JSONObject> result = new ArrayList<>();
        PageInfo<BotChatRecord> pageInfo = page(params);
        List<BotChatRecord> list = pageInfo.getList();
        if (!CollectionUtils.isEmpty(list)) {
            list.forEach(r -> {
                JSONObject q = new JSONObject();
                q.put("userType", "customer");
                q.put("answer", r.getQuestion());
                q.put("messageType", "text");
                q.put("state", 0);
                String fileUrl = r.getFileUrl();
                if (Strings.isNotBlank(fileUrl)) {
                    q.put("messageType", "voice");
                    q.put("voiceDuration", r.getVoiceDuration());
                    q.put("fileUrl", ossService.getFinalUrl(fileUrl));
                }
                JSONObject a = new JSONObject();
                a.put("userType", "bot");
                a.put("answer", r.getAnswer());
                a.put("messageType", "text");
                a.put("state", 0);
                if (r.getOrderId() != null) {
                    a.put("state", 1);
                    a.put("orderId", r.getOrderId());
                    Order order = orderService.infoWithDetail(r.getOrderId());
                    List<OrderDetail> orderDetailList = order.getOrderDetailList();
                    OrderDetail detail = orderDetailList.get(0);
                    LocalDateTime startTime = detail.getStartTime();
                    String time = DateUtil.toStandString(startTime);
                    a.put("arriveTime", time.substring(0, 16));
                    a.put("personCount", order.getOrderDetailList().size());
                    a.put("durationMinutes", detail.getDuration());
                    a.put("shopTitle", shopService.findNameById(order.getShopId()));
                    a.put("bedTitle", bedService.findNameById(detail.getBedId()));
                    String projectTitle = projectService.findTitleById(detail.getProjectId());
                    a.put("projectTitle", projectTitle);
                    a.put("orderState", OrderState.NOT_PAY.getValue().equals(order.getState()) ? "1":"0");
                }
                result.add(q);
                result.add(a);
            });
        }
        return result;
    }
}