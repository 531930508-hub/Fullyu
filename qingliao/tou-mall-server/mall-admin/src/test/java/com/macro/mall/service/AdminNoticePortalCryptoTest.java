package com.macro.mall.service;

import com.macro.mall.controller.open.AdminNoticePortalController;
import com.macro.mall.mapper.AdminNoticeBindingMapper;
import me.chanjar.weixin.mp.api.WxMpService;
import me.chanjar.weixin.mp.config.impl.WxMpDefaultConfigImpl;
import me.chanjar.weixin.mp.util.crypto.WxMpCryptUtil;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 用真实WxJava 4.6.0 AES加解密走一遍人员绑定回调；全部为合成密钥与身份，不访问微信。 */
class AdminNoticePortalCryptoTest {
    static final String APP="synthetic-app", OPEN="synthetic_openid_0001", NONCE="AbCdEfGhIjKlMnOpQrStUvWxYz012345";
    AdminNoticePortalController portal; AdminNoticeBindingMapper mapper; WxMpDefaultConfigImpl config;

    void setup(){
        config=new WxMpDefaultConfigImpl();config.setAppId(APP);config.setToken("synthetic-token");
        config.setAesKey("abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG");
        WxMpService wx=mock(WxMpService.class);
        when(wx.switchover(APP)).thenReturn(true);when(wx.checkSignature(anyString(),anyString(),eq("url-signature"))).thenReturn(true);
        when(wx.getWxMpConfigStorage()).thenReturn(config);
        AdminNoticeBindingService binding=new AdminNoticeBindingService();mapper=mock(AdminNoticeBindingMapper.class);
        ReflectionTestUtils.setField(binding,"enabled",true);ReflectionTestUtils.setField(binding,"appId",APP);ReflectionTestUtils.setField(binding,"mapper",mapper);
        Map<String,Object> row=new HashMap<>();row.put("appId",APP);row.put("expiresAt",LocalDateTime.now().plusMinutes(10));
        when(mapper.lockChallenge(AdminNoticeBindingService.digest(NONCE))).thenReturn(row);
        when(mapper.candidate(anyString(),anyString(),any())).thenReturn(1);
        portal=new AdminNoticePortalController();
        ReflectionTestUtils.setField(portal,"bindings",binding);ReflectionTestUtils.setField(portal,"wxService",wx);
    }
    String event(long createTime){
        return "<xml><ToUserName><![CDATA[gh_synthetic]]></ToUserName><FromUserName><![CDATA["+OPEN+"]]></FromUserName>"
            +"<CreateTime>"+createTime+"</CreateTime><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[subscribe]]></Event>"
            +"<EventKey><![CDATA[qrscene_admin_notice_"+NONCE+"]]></EventKey></xml>";
    }
    static String field(String xml,String name){
        Matcher m=Pattern.compile("<"+name+">(?:<!\\[CDATA\\[)?(.*?)(?:]]>)?</"+name+">",Pattern.DOTALL).matcher(xml);
        assertTrue(m.find(),name);return m.group(1);
    }
    String post(String body,String msgSignature){
        return portal.post(APP,body,"url-signature",field(body,"TimeStamp"),field(body,"Nonce"),"aes",msgSignature);
    }
    String encrypted(long createTime){return new WxMpCryptUtil(config).encrypt(event(createTime));}

    @Test void genuineEncryptedScanCreatesCandidateForThatIdentity(){
        setup();String body=encrypted(System.currentTimeMillis()/1000);
        assertEquals("success",post(body,field(body,"MsgSignature")));
        verify(mapper).candidate(eq(AdminNoticeBindingService.digest(NONCE)),eq(OPEN),any(LocalDateTime.class));
    }
    @Test void tamperedMessageSignatureNeverReachesBinding(){
        setup();String body=encrypted(System.currentTimeMillis()/1000);
        assertThrows(RuntimeException.class,()->post(body,"0"+field(body,"MsgSignature").substring(1)));
        verify(mapper,never()).lockChallenge(anyString());verify(mapper,never()).candidate(anyString(),anyString(),any());
    }
    @Test void ciphertextFromAnotherKeyIsRejected(){
        setup();WxMpDefaultConfigImpl other=new WxMpDefaultConfigImpl();other.setAppId(APP);other.setToken("synthetic-token");
        other.setAesKey("ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210zyxwvut");
        String forged=new WxMpCryptUtil(other).encrypt(event(System.currentTimeMillis()/1000));
        assertThrows(com.macro.mall.common.exception.BusinessException.class,()->post(forged,field(forged,"MsgSignature")));
        verify(mapper,never()).candidate(anyString(),anyString(),any());
    }
    /** 用正确密钥和正确签名封装一段自定义明文，模拟持有Token者构造的畸形长度字段。 */
    String crafted(int declaredLength,String trailerAppId) throws Exception{
        byte[] key=Base64.getDecoder().decode(config.getAesKey()+"=");
        byte[] xml=event(System.currentTimeMillis()/1000).getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] app=trailerAppId.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();
        out.write("0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        out.write(java.nio.ByteBuffer.allocate(4).putInt(declaredLength).array());out.write(xml);out.write(app);
        int pad=32-(out.size()%32);for(int i=0;i<pad;i++)out.write(pad);
        javax.crypto.Cipher c=javax.crypto.Cipher.getInstance("AES/CBC/NoPadding");
        c.init(javax.crypto.Cipher.ENCRYPT_MODE,new javax.crypto.spec.SecretKeySpec(key,"AES"),new javax.crypto.spec.IvParameterSpec(Arrays.copyOfRange(key,0,16)));
        String encrypt=Base64.getEncoder().encodeToString(c.doFinal(out.toByteArray()));
        String ts=String.valueOf(System.currentTimeMillis()/1000),nonce="synthetic-nonce";
        String[] parts={config.getToken(),ts,nonce,encrypt};Arrays.sort(parts);
        byte[] sha=java.security.MessageDigest.getInstance("SHA-1").digest(String.join("",parts).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder sig=new StringBuilder();for(byte b:sha)sig.append(String.format("%02x",b));
        return "<xml><Encrypt><![CDATA["+encrypt+"]]></Encrypt><MsgSignature><![CDATA["+sig+"]]></MsgSignature><TimeStamp>"+ts+"</TimeStamp><Nonce><![CDATA["+nonce+"]]></Nonce></xml>";
    }
    @Test void oversizedDeclaredLengthIsRejectedWithoutAllocating() throws Exception{
        setup();String body=crafted(0x7FFFFFF0,APP);
        assertThrows(com.macro.mall.common.exception.BusinessException.class,()->post(body,field(body,"MsgSignature")));
        verify(mapper,never()).lockChallenge(anyString());verify(mapper,never()).candidate(anyString(),anyString(),any());
    }
    @Test void negativeDeclaredLengthIsRejected() throws Exception{
        setup();String body=crafted(-5,APP);
        assertThrows(com.macro.mall.common.exception.BusinessException.class,()->post(body,field(body,"MsgSignature")));
        verify(mapper,never()).candidate(anyString(),anyString(),any());
    }
    @Test void wellFormedPayloadForAnotherAppIsRejected() throws Exception{
        setup();String xml=event(System.currentTimeMillis()/1000);
        String body=crafted(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8).length,"other-app");
        assertThrows(com.macro.mall.common.exception.BusinessException.class,()->post(body,field(body,"MsgSignature")));
        verify(mapper,never()).candidate(anyString(),anyString(),any());
    }
    @Test void craftedButCorrectPayloadStillBinds() throws Exception{
        setup();String xml=event(System.currentTimeMillis()/1000);
        String body=crafted(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8).length,APP);
        assertEquals("success",post(body,field(body,"MsgSignature")));
        verify(mapper).candidate(eq(AdminNoticeBindingService.digest(NONCE)),eq(OPEN),any(LocalDateTime.class));
    }
    @Test void anotherKeyIsRejectedEveryTime(){
        setup();WxMpDefaultConfigImpl other=new WxMpDefaultConfigImpl();other.setAppId(APP);other.setToken("synthetic-token");
        other.setAesKey("ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210zyxwvut");
        for(int i=0;i<200;i++){
            String forged=new WxMpCryptUtil(other).encrypt(event(System.currentTimeMillis()/1000));
            assertThrows(com.macro.mall.common.exception.BusinessException.class,()->post(forged,field(forged,"MsgSignature")));
        }
        verify(mapper,never()).candidate(anyString(),anyString(),any());
    }
    @Test void replayedOldEventIsIgnored(){
        setup();String body=encrypted(System.currentTimeMillis()/1000-600);
        assertEquals("success",post(body,field(body,"MsgSignature")));
        verify(mapper,never()).lockChallenge(anyString());verify(mapper,never()).candidate(anyString(),anyString(),any());
    }
}
