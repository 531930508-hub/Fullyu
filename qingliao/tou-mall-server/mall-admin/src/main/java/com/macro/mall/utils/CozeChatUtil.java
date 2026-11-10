package com.macro.mall.utils;

import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.toolkit.StringUtils;
import com.macro.mall.dto.BotChatRecordDto;
import com.macro.mall.entity.ChatBot;
import lombok.extern.slf4j.Slf4j;
import org.apache.logging.log4j.util.Strings;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.util.CollectionUtils;
import org.springframework.web.client.RestTemplate;

import java.util.*;

/**
 * @author HeDaJiang
 * @date 2025/6/13
 */
@Slf4j
public class CozeChatUtil {

    private static final String baseUrl = "https://api.coze.cn";
    private static String botId = "7511921851254407187";
    private static String authorization = "Bearer pat_fStbvNiNVpkxXme3S8SXTrq9Be55PC7feqomVBw3aPod2LKzRZ0VEGWorlXV5qvd";
    private static String workflowId = "xxx";


    public static void main(String[] args) {
        JSONObject chat = askBotAndGetAnswer("下午4点半左右", "huisdf", "7516827194212024347", null, null);
        System.out.println(chat.getString("answer"));
        System.out.println(chat.getString("conversationId"));
        System.out.println(chat.getString("chatId"));
    }

    public static void init(ChatBot chatBot) {
        botId = chatBot.getBotId();
        authorization = "Bearer " + chatBot.getSecretToken();
    }

    /**
     * 询问并获取答案
     *
     * @param question
     * @param userId
     * @param conversationId
     * @param customVariables
     * @return
     */
    public static JSONObject askBotAndGetAnswer(String question, String userId, String conversationId, Map<String, Object> customVariables, List<BotChatRecordDto> historyChats) {
        JSONObject result = new JSONObject();
        String chatId = null;
        String answer = null;
        JSONObject chat = createChat(question, userId, conversationId, customVariables, historyChats);
        if (chat != null) {
            if (StringUtils.isBlank(conversationId)) {
                conversationId = chat.getString("conversation_id");
            }
            chatId = chat.getString("id");
        } else {
            log.error("询问并获取答案，扣子创建对话失败={}", conversationId);
            return null;
        }

        if (StringUtils.isBlank(conversationId) && StringUtils.isBlank(chatId)) {
            log.error("询问并获取答案,对话和会话id为空，question={},conversationId={}", question, conversationId);
            return null;
        }
        // 等1秒之后取看看处理完成没
        waitSeconds(3);
        int checkCount = 0;
        while (true) {
            int i = checkConversationStatus(conversationId, chatId);
            log.info("检查处理结果={}", conversationId);
            if (i == 1) {
                // 已经处理完了，获取结果
                JSONObject chatObject = fetchConversationResult(conversationId, chatId);
                String output = chatObject.getString("output");
                String output1 = chatObject.getString("output1");
                result.put("params", output);
                if (Strings.isNotBlank(output1)) {
                    answer = output1;
                } else {
                    answer = output;
                }
                if (Strings.isNotBlank(answer) && answer.contains("（")) {
                    answer = removeBracketedText(answer);
                } else if (Strings.isNotBlank(answer) && answer.contains("{\"output:")) {
                    try {
                        JSONObject object = JSONObject.parseObject(answer);
                        String s = object.getString("output");
                        if (Strings.isNotBlank(s)) {
                            answer = object.getString("output");
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
                log.info("获取会话答案结果,conversationId={},answer={}", conversationId, answer);
                break;
            } else if (i == -1) {
                log.info("获取会话答案结果,检查处理结果，处理失败了，conversationId={},answer={}", conversationId, answer);
                // 处理失败
                break;
            }
            // 没处理完，再等两秒之后看看
            waitSeconds(1);
            checkCount++;
            if (checkCount > 200) {
                log.error("获取会话答案结果，重试失败了，question={}", question);
                break;
            }
        }
        result.put("conversationId", conversationId);
        result.put("chatId", chatId);
        result.put("botId", botId);
        result.put("answer", answer);
        return result;
    }

    private static String removeBracketedText(String input) {
        // 定义正则表达式，用于匹配中文括号及其内部的任意内容
        String regex = "（[^）]*）";
        // 使用正则表达式替换匹配到的内容为空字符串
        return input.replaceAll(regex, "");
    }

    /**
     * 将答案分割成多句话
     *
     * @param content
     * @return
     */
    public static List<String> splitWord(String content) {
        if (Strings.isBlank(content)) {
            return null;
        }
        // 低于20个字，就不用分割了
        if (content.length() < 20) {
            return Arrays.asList(content);
        }
        List<String> results = null;
        JSONObject body = new JSONObject();
        body.put("workflow_id", workflowId);
        JSONObject parameters = new JSONObject();
        parameters.put("BOT_USER_INPUT", content);
        body.put("parameters", parameters);
        JSONObject result = doPost("/v1/workflow/run", null, body);
        if (result != null) {
            log.info("扣子拆分答案结果：result={}", result.toJSONString());
        }
        JSONObject data = result.getJSONObject("data");
        if (data != null) {
            JSONArray output = data.getJSONArray("output");
            if (output != null) {
                results = new ArrayList<>(output.size());
                for (Object a : output) {
                    results.add(a.toString());
                }
            }
        }
        return results;
    }

    private static void waitSeconds(int seconds) {
        try {
            Thread.sleep(seconds * 500);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }


    /**
     * 创建对话
     *
     * @param question
     * @param userId
     * @param conversationId
     * @param customVariables
     * @return
     */
    private static JSONObject createChat(String question, String userId, String conversationId, Map<String, Object> customVariables, List<BotChatRecordDto> historyChats) {
        Map<String, Object> params = null;
        if (StringUtils.isNotBlank(conversationId)) {
            params = new HashMap<>();
            params.put("conversation_id", conversationId);
        }
        JSONObject body = new JSONObject();
        body.put("bot_id", botId);
        body.put("user_id", userId);
        if (!CollectionUtils.isEmpty(customVariables)) {
            body.put("custom_variables", customVariables);
        }
        JSONArray additionalMessages = new JSONArray();
        // 上文会话
        if (!CollectionUtils.isEmpty(historyChats)) {
            historyChats.forEach(h -> {
                JSONObject q = new JSONObject();
                q.put("role", "user");
                q.put("content", h.getQuestion());
                q.put("content_type", "text");
                additionalMessages.add(q);
                JSONObject a = new JSONObject();
                a.put("role", "assistant");
                a.put("content", h.getAnswer());
                a.put("content_type", "text");
                a.put("type", "answer");
                additionalMessages.add(a);
            });
        }
        JSONObject message = new JSONObject();
        message.put("role", "user");
        message.put("content", question);
        message.put("content_type", "text");
        additionalMessages.add(message);
        body.put("additional_messages", additionalMessages);
        JSONObject result = doPost("/v3/chat", params, body);
        if (result == null) {
            log.error("扣子创建会话失败,返回对象为空,question={}", question);
        }
        if (requestSuccess(result)) {
            return result.getJSONObject("data");
        } else {
            log.error("扣子创建会话失败，botId={}conversationId={},question={},msg={}", botId, conversationId, question, result.getString("msg"));
        }
        return null;
    }


    /**
     * 检查处理结果
     *
     * @param conversationId
     * @param chatId
     * @return -1处理失败，0处理中，1已完成处理
     */
    private static int checkConversationStatus(String conversationId, String chatId) {
        Map<String, Object> params = new HashMap<>();
        params.put("conversation_id", conversationId);
        params.put("chat_id", chatId);
        JSONObject result = doGet("/v3/chat/retrieve", params);
        log.error("检查会话结果，conversationId={}，result={}", conversationId, result.toJSONString());
        if (requestSuccess(result)) {
            JSONObject data = result.getJSONObject("data");
            if (data == null) {
                return -1;
            }
            String status = data.getString("status");
            if ("completed".equals(status)) {
                return 1;
            }
            if ("in_progress".equals(status)) {
                return 0;
            }
        }
        return -1;
    }

    /**
     * 获取会话答案内容
     *
     * @param conversationId
     * @param chatId
     * @return
     */
    private static JSONObject fetchConversationResult(String conversationId, String chatId) {
        JSONObject object = new JSONObject();
        Map<String, Object> params = new HashMap<>();
        params.put("conversation_id", conversationId);
        params.put("chat_id", chatId);
        JSONObject result = doGet("/v3/chat/message/list", params);
        log.info("扣子获取会话结果:", result.toJSONString());
        if (requestSuccess(result)) {
            JSONArray data = result.getJSONArray("data");
            if (CollectionUtils.isEmpty(data)) {
                return object;
            }
            for (Object d : data) {
                LinkedHashMap<String, String> jsonObject = (LinkedHashMap) d;
                String type = jsonObject.get("type");
                if ("answer".equals(type)) {
                    String content = jsonObject.get("content");
                    System.out.println("扣子返回：" + content);
                    if (StringUtils.isNotBlank(content)) {
                        if (content.contains("output")) {
                            JSONObject parse = JSONObject.parse(content);
                            String output = parse.getString("output");
                            if (Strings.isNotBlank(output)) {
                                object.put("output", output);
                            }
                            String output1 = parse.getString("output1");
                            if (Strings.isNotBlank(output1)) {
                                object.put("output1", output1);
                            }
                            String output2 = parse.getString("output2");
                            if (Strings.isNotBlank(output2)) {
                                object.put("output2", output2);
                            }
                        }
                        return object;
                    }
                }
            }
        }
        return object;
    }

    /**
     * 执行post请求
     *
     * @param path
     * @param params
     * @param body
     * @return
     */
    private static JSONObject doPost(String path, Map<String, Object> params, JSONObject body) {
        HttpHeaders headers = new HttpHeaders();
        headers.add("Authorization", authorization);
        headers.add("Content-Type", "application/json");
        HttpEntity formEntity = new HttpEntity<>(headers);
        String finalUrl = baseUrl + path;
        if (body != null) {
            formEntity = new HttpEntity(body, headers);
        }
        if (!CollectionUtils.isEmpty(params)) {
            finalUrl = buildFinalUrl(params, finalUrl);
        }
        RestTemplate restTemplate = new RestTemplate();
        return restTemplate.postForObject(finalUrl, formEntity, JSONObject.class);
    }

    private static String buildFinalUrl(Map<String, Object> params, String url) {
        StringBuilder builder = new StringBuilder(url + "?");
        String finalUrl;
        if (params != null) {
            params.forEach((k, v) -> {
                builder.append(k);
                builder.append("=");
                builder.append(v);
                builder.append("&");
            });
        }
        finalUrl = builder.substring(0, builder.length() - 1);
        return finalUrl;
    }

    /**
     * 执行get请求
     *
     * @param path
     * @param params
     * @return
     */
    private static JSONObject doGet(String path, Map<String, Object> params) {
        HttpHeaders headers = new HttpHeaders();
        headers.add("Authorization", authorization);
        headers.add("Content-Type", "application/json");
        RestTemplate restTemplate = new RestTemplate();
        HttpEntity formEntity = new HttpEntity<>(headers);
        String finalUrl = baseUrl + path;
        if (!CollectionUtils.isEmpty(params)) {
            finalUrl = buildFinalUrl(params, finalUrl);
        }
        ResponseEntity<JSONObject> exchange = restTemplate.exchange(finalUrl, HttpMethod.GET, formEntity, JSONObject.class);
        return exchange.getBody();
    }

    private static boolean requestSuccess(JSONObject result) {
        Integer code = result.getInteger("code");
        return code != null && code == 0;
    }
}
