package com.macro.mall.service;

import me.chanjar.weixin.mp.bean.template.WxMpTemplateData;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 把公众号后台模板内容解析成可发送字段。
 * 运营在微信后台选模板，字段名和类型由微信决定，这里按字段名和类型自动填充，
 * 避免把模板ID或字段顺序写死在代码里。
 */
public final class AdminNoticeTemplate {
    private static final Pattern PLACEHOLDER=Pattern.compile("\\{\\{\\s*([A-Za-z0-9_]+)\\.DATA\\s*}}");
    private static final Pattern CONTROL=Pattern.compile("[\\p{Cntrl}\\u200B-\\u200F\\u2028\\u2029]");
    private static final int MAX_FIELDS=20;
    private static final String DEFAULT_TITLE="审批待办";
    private static final String DEFAULT_STATUS="待处理";
    private static final String DEFAULT_PERSON="同事";
    private static final String DEFAULT_REMARK="点击查看详情";

    private AdminNoticeTemplate(){}

    /** 模板中出现的字段，按出现顺序去重；超过微信上限视为不可用。 */
    public static List<String> keys(String content){
        List<String> result=new ArrayList<>();
        if(content==null||content.isEmpty())return result;
        Matcher matcher=PLACEHOLDER.matcher(content);
        while(matcher.find()){
            String key=matcher.group(1);
            if(!result.contains(key)){
                if(result.size()>=MAX_FIELDS)return Collections.emptyList();
                result.add(key);
            }
        }
        return result;
    }

    public static List<WxMpTemplateData> render(String content,Map<String,String> context){
        List<String> keys=keys(content);
        if(keys.isEmpty())throw new IllegalArgumentException("消息模板没有可用字段");
        Map<String,String> values=context==null?Collections.<String,String>emptyMap():context;
        List<WxMpTemplateData> data=new ArrayList<>(keys.size());
        Map<String,Integer> occurrences=new HashMap<>();
        for(String key:keys){
            String type=type(key);
            // 同类字段按出现顺序落位：thing1=事项、thing2=提交人、thing3=说明。
            int seq=occurrences.merge(type,1,Integer::sum);
            String raw=values.get(field(key,seq));
            data.add(new WxMpTemplateData(key,value(type,raw)));
        }
        return data;
    }

    /** 字段名前缀即微信模板类型，例如 thing5、time3、character_string1。 */
    static String type(String key){
        String lower=key==null?"":key.toLowerCase(Locale.ROOT);
        int end=0;
        while(end<lower.length()&&(Character.isLetter(lower.charAt(end))||lower.charAt(end)=='_'))end++;
        return end==0?lower:lower.substring(0,end);
    }

    static String field(String key){
        return field(key,1);
    }

    /**
     * seq 是同一类型字段在模板里第几次出现（从 1 开始）。
     * 运营常直接用微信默认字段名（thing1/thing2），同类多个字段时按顺序分配业务含义。
     */
    static String field(String key,int seq){
        String lower=key==null?"":key.toLowerCase(Locale.ROOT);
        if(lower.contains("status")||lower.contains("result")||lower.contains("状态"))return "status";
        if(lower.contains("code")||lower.contains("number")||lower.contains("编号")||lower.contains("id"))return "code";
        if(lower.contains("name")||lower.contains("person")||lower.contains("申请")||lower.contains("员工"))return "person";
        if(lower.contains("time")||lower.contains("date")||lower.contains("时间"))return "time";
        if(lower.contains("remark")||lower.contains("备注")||lower.contains("说明"))return "remark";
        // 微信模板字段名多为类型+序号（thing1/phrase2），没有语义时按类型回退。
        String type=type(lower);
        if("phrase".equals(type))return "status";
        if("name".equals(type))return "person";
        if("time".equals(type))return "time";
        if("character_string".equals(type)||"number".equals(type))return "code";
        if("thing".equals(type)){
            if(seq<=1)return "title";
            if(seq==2)return "person";
            return "remark";
        }
        return "title";
    }

    static String value(String type,String raw){
        String text=clean(raw);
        if("phrase".equals(type)){
            if(text.isEmpty())text=DEFAULT_STATUS;
            return cut(text,5);
        }
        if("name".equals(type)){
            if(text.isEmpty())text=DEFAULT_PERSON;
            return cut(text,10);
        }
        if("thing".equals(type)){
            if(text.isEmpty())text=DEFAULT_TITLE;
            return cut(text,20);
        }
        if("character_string".equals(type)){
            String digits=text.replaceAll("[^0-9A-Za-z]","");
            return cut(digits.isEmpty()?"0":digits,32);
        }
        if("letter".equals(type)){
            String letters=text.replaceAll("[^A-Za-z]","");
            return cut(letters.isEmpty()?"A":letters,32);
        }
        if("symbol".equals(type)){
            String symbols=text.replaceAll("[^0-9A-Za-z,.\\-+/:]","");
            return cut(symbols.isEmpty()?"-":symbols,5);
        }
        if("number".equals(type)){
            String number=text.replaceAll("[^0-9]","");
            return cut(number.isEmpty()?"0":number,22);
        }
        if("time".equals(type))return cut(text.isEmpty()?"2000-01-01 00:00":text,20);
        if(text.isEmpty())text=DEFAULT_TITLE;
        return cut(text,20);
    }

    private static String clean(String raw){
        if(raw==null)return "";
        return CONTROL.matcher(raw).replaceAll("").trim();
    }

    private static String cut(String text,int max){
        if(text.length()<=max)return text;
        return text.substring(0,max);
    }
}