package com.macro.mall.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.*;

/** 服务端生成绑定二维码，前端只拿到 dataURL 图片，不引第三方二维码库。 */
public final class AdminNoticeQrCode {
    private AdminNoticeQrCode(){}

    public static String dataUrl(String content,int size){
        if(content==null||content.isEmpty())throw new IllegalArgumentException("二维码内容为空");
        try{
            Map<EncodeHintType,Object> hints=new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.CHARACTER_SET,"UTF-8");
            hints.put(EncodeHintType.ERROR_CORRECTION,ErrorCorrectionLevel.M);
            hints.put(EncodeHintType.MARGIN,1);
            BitMatrix matrix=new QRCodeWriter().encode(content,BarcodeFormat.QR_CODE,size,size,hints);
            BufferedImage image=MatrixToImageWriter.toBufferedImage(matrix);
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            ImageIO.write(image,"PNG",out);
            return "data:image/png;base64,"+Base64.getEncoder().encodeToString(out.toByteArray());
        }catch(Exception e){
            throw new IllegalStateException("二维码生成失败",e);
        }
    }
}