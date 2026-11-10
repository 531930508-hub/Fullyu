package com.macro.mall.pay;

import com.macro.mall.common.utils.Env;

/**
 * Created by oahnus on 2025/6/13
 *
 * 商户号、商户私钥、签名密钥等敏感值一律通过环境变量注入，仓库中不保留真实值。
 * 需要的环境变量见 tou-mall-server/.env.example。
 *
 * @author oahnus
 */
public class PayCert {
    //sysId老的收款
    //sysId1 为总公司
    //sysId2 来福士
    //sysId3 世纪汇

    public static String sysId = Env.get("PAY_SYS_ID");
    public static String sysId1 = Env.get("PAY_SYS_ID_1");
    public static String sysId2 = Env.get("PAY_SYS_ID_2");
    public static String sysId3 = Env.get("PAY_SYS_ID_3");

    public static String productId = "PAYUN";
    public static String productId1 = "EDUSTD";
    public static String productId2 = "EDUSTD";
    public static String productId3 = "EDUSTD";

    // 汇付平台公钥：属于公开信息，可随仓库分发
    public static String payPubKey = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjd6UTGAjqmGbn65hZCyOdW4LTydjKvC1DhDjCfLnC/NfM56jclD7mMTvMzEzTaQ61IVmCF2oKA1XEDi8/vrTZDTsZ9+NvcWCzHvcY48qDaxIDsYz/5359cxtBNao57HAG/jjlI+Dn0gPfVrNKL/aTocR2yOZAU2H+zpiRTWSe+oVWb7HmBPI3tY6SLmtTIYecVdB5cOvjSePtWiQ3ZLqTMiaeR7Mk6B0OhS3yZVeKECOIIYXoX4EG6lAYb1LAZP5/mprid3Q/xRxGBIf+BF3xxz0RhOPwMeAdQe1XPd1vb+F6zRkbM9osVBnGfmzdi1yZyvWmwrNLntU0gP0JLLGXQIDAQAB";
    public static String payPubKey1 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2OmXYxja8meruw68ZfIv9CyHnufxGxo+EziY+22UCFdKxzxLOZhGEnjJpI8yfZNc1Qg5vbEu1VGlfQlw4RIVHnm13HihFIywKNTpWBWm3xCOrEfAmFNGrvh9/W/VqevxA7JL2aUMXs0OGfFxFNSdxc2d3U+rLP0Um/qgmc7PfJBaYou28mToSiXYkWK9k38JbGl0tgqGgw3Gz7HUaOTZKGtXtxwZEe6YVdvfB6XNK6rTuMqlepGAZP+OH7L4yDuBFeDj7Hqv0ZO1GIYdenjWPWF/bNAdrRaHTl+qMoWC56QW492oVhLFB/hCKFQcFgL6CBaX69Mspu+WNiG5qjzLJwIDAQAB";
    public static String payPubKey2 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAks7vV6tLratIXk2FGej3QIgj/3qM7xt+l3v/Chzm4wrgV6eaAJ7+M8T623z1tXzaeRwT9crG3/hzKQEkQPXQvZS034FlCIe9GmE2Nxhgb8cWXr9rnhE7g99lsjIuA8pY4cXg0M7ilyVZEe3DUI/LaKK+Mq7Dt04xb1kvpi/6ldCEXU7UMePVuQZLbdUBPVpqKB1VFDnTd+Qlz9cojPd7+6duOXUJ2maGyWUMUWjbgrYCHO98S5Xr3zqdxh8JkpC+noqHgeVn1g8bv+rck2w1OIFHwUq1ALYsz26uQzZLrAo9aYD7MnziTFo6i/d/wo2AzDqT1H8i3m6I40BwZ3NiwwIDAQAB";
    public static String payPubKey3 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiL837OSIBsPLCGqYnn914h59KLr9PiduX4eKffu5Ht8NxK0Qca4fe7Rd+jqOhK/GmuoOoZFH0iejy4VH+DPEoONKmR4Gj3LmrO9RGoStoKzg7rciBxRjHAJ2mfnaelQ4UDRlJBoEtCBlwv6jsZoA2UHwyxo8K8MrdH6Jr8KgYkecogblw1DzGUY1LRC4HHBH+ssCFdxHecJTuajqdGHzYibd9dkbSnrLymF0vaemEX/Qx6tgpp6MXy1sOnRToflgeuU2Z8ycU1seJmwr404jyAx9wJ7zPXJNxO43kEHfibc0pVFpmq529lE93k3HfuJtquoSmB/mnTO0hi+9WIgURQIDAQAB";

    // 商户 RSA 私钥：必须通过环境变量注入
    public static String paySecret = Env.get("PAY_SECRET");
    public static String paySecret1 = Env.get("PAY_SECRET_1");
    public static String paySecret2 = Env.get("PAY_SECRET_2");
    public static String paySecret3 = Env.get("PAY_SECRET_3");

    public static String wxWpAppId = "wx3b4f1e642bda21a1"; // 公众号id

    public static String signSecret = Env.get("PAY_SIGN_SECRET");
}