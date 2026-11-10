package com.macro.mall.utils;

import com.baomidou.mybatisplus.core.toolkit.Constants;
import org.apache.commons.io.FileUtils;

import javax.imageio.ImageIO;
import javax.net.ssl.HttpsURLConnection;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLDecoder;

/**
 * @author HeDaJiang
 * @date 2025/6/26
 */
public class ImageUtil {

    public static File merge(File inputFile) {
        try {
            File qrFile2 = File.createTempFile(System.currentTimeMillis() + "qroutput", ".png");
            // 去除白色部分
            BufferedImage transparentImage = makeWhiteTransparent(ImageIO.read(inputFile));
            ImageIO.write(transparentImage, "png", qrFile2);
            File bgFile = url2File("https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/poster-bg01.jpg");
            BufferedImage base = ImageIO.read(bgFile);
            BufferedImage overlay = ImageIO.read(qrFile2);
            // 创建与底图同尺寸的新图片
            BufferedImage blended = new BufferedImage(
                    base.getWidth(),
                    base.getHeight(),
                    BufferedImage.TYPE_4BYTE_ABGR
            );
            Graphics2D g2d = blended.createGraphics();
            // 先画底图
            g2d.drawImage(base, 0, 0, null);
            // 设置透明度：0.5表示50%透明（范围0.0~1.0）
            float alpha = 1f;
            g2d.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, alpha));
            // 画叠加图（可调整位置，比如居中：(base.getWidth()-overlay.getWidth())/2 ）
            int x = (base.getWidth() - overlay.getWidth()) / 2;
            int y = (base.getHeight() - overlay.getHeight()) - 300;
            g2d.drawImage(overlay, x, y, null);
            g2d.dispose(); // 释放资源
            File file = File.createTempFile(System.currentTimeMillis()+"ima", ".png");
            // 保存
            ImageIO.write(blended, "png", file);
            qrFile2.delete();
            bgFile.delete();
            return file;
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    private static File url2File(String urlStr) {
        InputStream inputStream = null;
        try {
            //url解码
            String decode = URLDecoder.decode(urlStr, Constants.UTF_8).replace(" ", "%20");
            URL url = new URL(decode);
            URLConnection connection;
            if (urlStr.contains("https")) {
                // 绕过https验证失效，改为http下载
                urlStr = urlStr.replace("https", "http");
                HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
                connection = conn;
            } else {
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                connection = conn;
            }
            // 设置是否使用缓存
            connection.setUseCaches(true);
            //设置超时间为6秒
            connection.setConnectTimeout(6 * 1000);
            //防止屏蔽程序抓取而返回403错误
            connection.setRequestProperty("User-Agent", "Mozilla/4.0 (compatible; MSIE 5.0; Windows NT; DigExt)");
            // 连接
            connection.connect();
            //得到输入流
            inputStream = connection.getInputStream();
            // 存为临时文件
            File tempFile = File.createTempFile(System.currentTimeMillis() + "temp", ".jpg");
            FileUtils.copyInputStreamToFile(inputStream, tempFile);
//            return IOUtils.toByteArray(inputStream);
            return tempFile;
        } catch (IOException e) {
            e.printStackTrace();
            return null;
        } finally {
            if (inputStream != null) {
                try {
                    inputStream.close();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }
    }

    /**
     * 将图片中的白色区域转换为透明
     *
     * @param image     输入的图片
     * @param threshold 白色阈值 (0-255)，值越小识别的"白色"范围越广
     * @return 处理后的透明图片
     */
    public static BufferedImage makeWhiteTransparent(BufferedImage image, int threshold) {
        int width = image.getWidth();
        int height = image.getHeight();

        // 创建支持透明度的新图片
        BufferedImage result = new BufferedImage(width, height, BufferedImage.TYPE_4BYTE_ABGR);

        // 遍历每个像素
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int argb = image.getRGB(x, y);
                Color color = new Color(argb, true);

                // 计算RGB与纯白色的接近程度
                int rgbDistance = 255 - color.getRed() +
                        255 - color.getGreen() +
                        255 - color.getBlue();

                // 如果接近白色，则设置为透明
                if (rgbDistance < threshold) {
                    result.setRGB(x, y, new Color(0, 0, 0, 0).getRGB());
                } else {
                    // 保留原像素，但确保使用支持透明度的类型
                    result.setRGB(x, y, new Color(
                            color.getRed(),
                            color.getGreen(),
                            color.getBlue(),
                            color.getAlpha()
                    ).getRGB());
                }
            }
        }
        return result;
    }

    // 重载方法，使用默认阈值 (例如 30)
    public static BufferedImage makeWhiteTransparent(BufferedImage image) {
        return makeWhiteTransparent(image, 30);
    }
}
