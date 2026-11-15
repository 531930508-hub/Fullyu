package com.macro.mall.service;

import me.chanjar.weixin.mp.bean.template.WxMpTemplateData;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class AdminNoticeTemplateTest {
    @Test void readsFieldsInTemplateOrderAndDeduplicates(){
        String content="标题{{thing1.DATA}} 状态{{phrase2.DATA}} 再来一次{{thing1.DATA}}";
        assertEquals(Arrays.asList("thing1","phrase2"),AdminNoticeTemplate.keys(content));
    }

    @Test void mapsByTypeWhenOperatorUsesGenericFieldNames(){
        // 微信模板默认字段名多为类型+序号，不能要求运营改成业务名。
        assertEquals("status",AdminNoticeTemplate.field("phrase2"));
        assertEquals("person",AdminNoticeTemplate.field("name3"));
        assertEquals("time",AdminNoticeTemplate.field("time4"));
        assertEquals("code",AdminNoticeTemplate.field("character_string5"));
        assertEquals("code",AdminNoticeTemplate.field("number6"));
        assertEquals("title",AdminNoticeTemplate.field("thing1"));
    }

    @Test void mapsBySemanticNameWhenPresent(){
        assertEquals("status",AdminNoticeTemplate.field("approval_status"));
        assertEquals("code",AdminNoticeTemplate.field("thing9_code"));
        assertEquals("person",AdminNoticeTemplate.field("thing_person"));
        assertEquals("remark",AdminNoticeTemplate.field("remark"));
        assertEquals("time",AdminNoticeTemplate.field("time"));
    }

    @Test void truncatesToWechatLimitsAndNeverSendsBlank(){
        assertEquals("待审批",AdminNoticeTemplate.value("phrase","待审批"));
        assertEquals(20,AdminNoticeTemplate.value("thing","很长的标题很长的标题很长的标题很长的标题").length());
        assertEquals(5,AdminNoticeTemplate.value("phrase","这是一段超过五个字的审批状态").length());
        assertEquals("2026-11-12 10:00",AdminNoticeTemplate.value("time","2026-11-12 10:00"));
        assertEquals("0",AdminNoticeTemplate.value("number","无"));
        assertEquals("B",AdminNoticeTemplate.value("letter","编号-B"));
        assertEquals("A",AdminNoticeTemplate.value("letter","编号"));
        assertEquals("-",AdminNoticeTemplate.value("symbol","  "));
        assertFalse(AdminNoticeTemplate.value("thing","\n\t ").isEmpty());
    }

    @Test void stripsControlCharactersThatBreakTemplatePayload(){
        String rendered=AdminNoticeTemplate.value("thing","  标题\r\n第二行\u200B  ");
        assertEquals("标题第二行",rendered);
    }

    @Test void mapsRepeatedGenericFieldsByOccurrence(){
        // 售后工单模板：thing1=项目名称、time2=提交时间、thing3=提交人、character_string7=待处理
        assertEquals("title",AdminNoticeTemplate.field("thing1",1));
        assertEquals("person",AdminNoticeTemplate.field("thing3",2));
        assertEquals("remark",AdminNoticeTemplate.field("thing4",3));
        assertEquals("time",AdminNoticeTemplate.field("time2",1));
        assertEquals("code",AdminNoticeTemplate.field("character_string7",1));
    }

    @Test void rendersApprovalTemplateWithRepeatedThingFields(){
        String content="项目名称:{{thing1.DATA}}\n提交时间:{{time2.DATA}}\n提交人:{{thing3.DATA}}\n待处理:{{character_string7.DATA}}\n";
        Map<String,String> ctx=new HashMap<>();
        ctx.put("title","退款申请");
        ctx.put("person","王小明");
        ctx.put("time","2026-11-11 14:30");
        ctx.put("code","90011");
        List<WxMpTemplateData> data=AdminNoticeTemplate.render(content,ctx);
        assertEquals(4,data.size());
        assertEquals("退款申请",data.get(0).getValue());
        assertEquals("2026-11-11 14:30",data.get(1).getValue());
        assertEquals("王小明",data.get(2).getValue());
        assertEquals("90011",data.get(3).getValue());
    }

    @Test void rendersOneDataPerFieldAndRejectsEmptyTemplate(){
        List<WxMpTemplateData> data=AdminNoticeTemplate.render("{{thing1.DATA}} {{character_string2.DATA}}",
            new HashMap<String,String>(){{put("title","审批待办");put("code","12345");}});
        assertEquals(2,data.size());
        assertEquals("thing1",data.get(0).getName());
        assertEquals("审批待办",data.get(0).getValue());
        assertEquals("12345",data.get(1).getValue());
        assertThrows(IllegalArgumentException.class,()->AdminNoticeTemplate.render("没有占位符",Collections.emptyMap()));
    }
}