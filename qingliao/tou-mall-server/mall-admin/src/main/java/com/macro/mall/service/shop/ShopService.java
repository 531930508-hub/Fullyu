package com.macro.mall.service.shop;

import cn.hutool.core.util.StrUtil;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.consts.RedisKey;
import com.macro.mall.entity.*;
import com.macro.mall.enums.NormalState;
import com.macro.mall.mapper.ShopMapper;
import com.macro.mall.service.*;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.utils.DateUtil;
import com.macro.mall.utils.PrintUtilNew;
import com.macro.mall.utils.RedisUtil;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.gavaghan.geodesy.GeodeticCurve;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import org.gavaghan.geodesy.Ellipsoid;
import org.gavaghan.geodesy.GeodeticCalculator;
import org.gavaghan.geodesy.GlobalCoordinates;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 服务类
 *
 * @author zkl
 * @date 2025/05/30
 */
@Service
public class ShopService extends BaseService<ShopMapper, Shop> {
    @Autowired
    @Lazy
    OrderService orderService;
    @Autowired
    PrintUtilNew printUtilNew;
    @Autowired
    ShopCollectService shopCollectService;


    @Override
    protected QueryWrapper<Shop> buildWrapper(Map<String, Object> params, QueryWrapper<Shop> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .like("name")
                .like("address")
                .equal("shop_recommend")
                .equal("status")
                .getQueryWrapper();
    }

    @Autowired
    RoomService roomService;
    @Autowired
    BedService bedService;
    @Autowired
    RedisUtil redisUtil;
    @Autowired
    @Lazy
    MassagistService massagistService;

    @Transactional(rollbackFor = Exception.class)
    public void remove(Long id) {
        List<Bed> bedList = bedService.listByShopId(id);
        if (!CollectionUtils.isEmpty(bedList)) {
            List<Long> bedIds = bedList.stream().map(Bed::getId).collect(Collectors.toList());
            bedService.removeBatchByIds(bedIds);
        }
        List<Room> roomList = roomService.listByShopId(id);
        if (!CollectionUtils.isEmpty(roomList)) {
            List<Long> roomIds = roomList.stream().map(Room::getId).collect(Collectors.toList());
            roomService.removeBatchByIds(roomIds);
        }
        removeById(id);
        redisUtil.delData(RedisKey.FIND_SHOP_NAME_BY_ID + id);
        redisUtil.delData(RedisKey.FIND_SHOP_ADDRESS_BY_ID + id);
    }

    /**
     * 添加或者编辑
     *
     * @param shop
     */
    public void saveOrUpd(Shop shop) {
        try{
            printUtilNew.addPrinter(shop.getPrintSn(),shop.getPrintPkey(),shop.getName());
        } catch (IOException e) {
            JSONObject object=JSONObject.parseObject(e.getMessage()) ;
            if(object.getInteger("errorcode")==4){
                throw new BusinessException("打印机编号或KEY错误");
            }
            if(object.getInteger("errorcode")==5){
                //请勿重复添加设备
            }

        }
        saveOrUpdate(shop);
        redisUtil.delData(RedisKey.FIND_SHOP_NAME_BY_ID + shop.getId());
        redisUtil.delData(RedisKey.FIND_SHOP_ADDRESS_BY_ID + shop.getId());
    }

    /**
     * 获取对应门店名
     *
     * @param id
     * @return
     */
    public String findNameById(Long id) {
        if (id == null) {
            id = 1L;
        }
        String name = redisUtil.getString(RedisKey.FIND_SHOP_NAME_BY_ID + id);
        if (StringUtils.hasText(name)) {
            return name;
        }
        LambdaQueryWrapper<Shop> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Shop::getId, id);
        queryWrapper.select(Shop::getName);
        Shop shop = getOnlyOne(queryWrapper);
        if (shop == null) {
            return null;
        }
        name = shop.getName();
        redisUtil.setStringForever(RedisKey.FIND_SHOP_NAME_BY_ID + id, name);
        return name;
    }

    /**
     * 获取对应门店地址
     *
     * @param id
     * @return
     */
    public String findAddressById(Long id) {
        if (id == null) {
            id = 1L;
        }
        String address = redisUtil.getString(RedisKey.FIND_SHOP_ADDRESS_BY_ID + id);
        if (StringUtils.hasText(address)) {
            return address;
        }
        LambdaQueryWrapper<Shop> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Shop::getId, id);
        queryWrapper.select(Shop::getAddress);
        Shop shop = getOnlyOne(queryWrapper);
        if (shop == null) {
            return null;
        }
        address = shop.getAddress();
        redisUtil.setStringForever(RedisKey.FIND_SHOP_ADDRESS_BY_ID + id, address);
        return address;
    }

    /**
     * 找到可用的门店
     *
     * @return
     */
    public List<Shop> findAvailableShopList() {
        LambdaQueryWrapper<Shop> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Shop::getStatus, NormalState.EFFECTIVE.getValue());
        return list(queryWrapper);
    }

    public Shop findAvailableById(Long shopId) {
        LambdaQueryWrapper<Shop> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Shop::getStatus, NormalState.EFFECTIVE.getValue());
        queryWrapper.eq(Shop::getId, shopId);
        return getOnlyOne(queryWrapper);
    }
    public String timeShopEnd(Long id){
        if (id == null) {
            id = 1L;
        }
        Shop shop = getById(id);
        if (shop == null) {
            return null;
        }
        String clockInTime = shop.getClockInTime();
        String clockOutTime = shop.getClockOutTime();
        return clockOutTime;
    }

    public List<String> timeList(Long id) {
        if (id == null) {
            id = 1L;
        }
        Shop shop = getById(id);
        if (shop == null) {
            return null;
        }
        String clockInTime = shop.getClockInTime();
        String clockOutTime = shop.getClockOutTime();
        Integer endHour = Integer.valueOf(clockOutTime.substring(0, 2));
        LocalDate currentDate = LocalDate.now();
        LocalDateTime time = LocalDateTime.of(currentDate, DateUtil.HHmmStrToTime(clockInTime));
        List<String> timeList = new ArrayList<>(40);

        timeList.add(clockInTime);
        while (true) {
            time = DateUtil.findNextTime(time);
            int hour = time.getHour();
            if (hour >= endHour) {
                timeList.add(DateUtil.toHHmm(time));
                break;
            }
            timeList.add(DateUtil.toHHmm(time));
        }

        while (true) {
            time = DateUtil.findNextTime(time);
            int hour = time.getHour();
            if (hour >= 23) {
                if(!timeList.contains("23:00")){
                    timeList.add("23:00");
                }
                timeList.add("23:15");
                timeList.add("23:30");
                break;
            }
            timeList.add(DateUtil.toHHmm(time));
        }

        return timeList;
    }

    public JSONObject receptionData(Long shopId) {
        JSONObject data = new JSONObject();
        String resultStr = redisUtil.getString(RedisKey.RECEPTION_DATA + shopId + ":");
        data.put("currMassagistId", "FULL");
        data.put("currMassagistReceptionTime", null);
        data.put("nextMassagistId", "FULL");
        if (!StrUtil.isBlank(resultStr)) {
            data = JSONObject.parseObject(resultStr);
        }
        Object massagistId = data.get("currMassagistId");
        if (massagistId != null && (massagistId instanceof Integer || massagistId instanceof Long)) {
            Long id = Long.valueOf(String.valueOf(massagistId));
            Massagist massagist = massagistService.getById(id);
            data.put("currMassagistId", massagist.getName());
        }
        Object nextMassagistId = data.get("nextMassagistId");
        if (nextMassagistId != null && (nextMassagistId instanceof Integer || nextMassagistId instanceof Long)) {
            Long id = Long.valueOf(String.valueOf(nextMassagistId));
            Massagist massagist = massagistService.getById(id);
            data.put("nextMassagistId", massagist.getName());
        }
        JSONArray currMassagistReceptionTime = data.getJSONArray("currMassagistReceptionTime");
        if (!CollectionUtils.isEmpty(currMassagistReceptionTime)) {
            String receptionTimeString = currMassagistReceptionTime.getString(1);
            LocalDateTime now = LocalDateTime.now();
            LocalDateTime localDateTime = DateUtil.string2DateTime(receptionTimeString);
            long minutes = ChronoUnit.MINUTES.between(now, localDateTime);
            if (minutes >= 0) {
                data.put("remainingReceptionMinute", minutes == 30 ? minutes : minutes + 1);
            }
        }
        return data;
    }

    public List<Shop> listByLastOrder(Map<String, Object> params, Long customerId) {
        params.put("order", "-id");
        List<Shop> shopList = listNoPage(params);
        Long shopId = orderService.getLastServiceOrderShop(customerId);
        if (shopId != null) {
            Optional<Shop> targetShopOpt = shopList.stream()
                    .filter(shop -> shopId.equals(shop.getId()))
                    .findFirst();
            targetShopOpt.ifPresent(targetShop -> {
                shopList.remove(targetShop);
                shopList.add(0, targetShop);
            });
        }
        return shopList;
    }
    /**
     * 解析后台账号的门店范围。历史数据里 shop_id_arr 可能为 null / 空串 / "null"，
     * 这类账号按“全部门店”处理，避免 NPE 导致门店相关接口整体 500。
     */
    private JSONArray parseShopIdArr(String shopIdArr) {
        if (shopIdArr == null) {
            return null;
        }
        String value = shopIdArr.trim();
        if (value.isEmpty() || "null".equalsIgnoreCase(value) || "undefined".equalsIgnoreCase(value)) {
            return null;
        }
        try {
            JSONArray jsonArray = JSON.parseArray(value.replace(" ", ""));
            return (jsonArray == null || jsonArray.isEmpty()) ? null : jsonArray;
        } catch (Exception e) {
            return null;
        }
    }

    public List<Shop> getShopListByShopIdArr(String shopIdArr) {
        List<Shop> list = new ArrayList<Shop>();
        JSONArray jsonArray = parseShopIdArr(shopIdArr);
        if (jsonArray == null) {
            return listNoPage(new HashMap<String, Object>());
        }
        jsonArray.forEach(item -> {
            int id=(int)item;
            Shop shop = getById(id);
            if (shop != null) {
                list.add(shop);
            }
        });
        return  list;
    }
    public Object listNoPageNew(Map<String, Object> params,String shopIdArr) {
        List<Shop> list=listNoPage(params);
        JSONArray jsonArray = parseShopIdArr(shopIdArr);
        if (jsonArray == null) {
            return list;
        }
        List<Shop> shopList=new ArrayList<>();
        for (int i = 0; i < jsonArray.size(); i++) {
            int id=i;
            list.stream().forEach(item -> {
                if(item.getId()==jsonArray.getBigInteger(id).longValue()){
                    shopList.add(item);
                }
            });
        }
        return  shopList;
    }

    public List<Shop> getMiniShopList(Map<String, Object> params) {
        params.put("status",1);
        List<Shop> shopList = listNoPage(params);
        long customerId =Long.parseLong(params.get("customerId").toString());
        if (params.get("latitude") != null && Double.parseDouble(params.get("latitude").toString()) != 0.0) {
            //计算两点的坐标
            double latitude = Double.parseDouble(params.get("latitude").toString());
            double longitude = Double.parseDouble(params.get("longitude").toString());
            GlobalCoordinates source = new GlobalCoordinates(latitude, longitude);
            shopList.stream().forEach(shop -> {
                try {
                    String key = "OB4BZ-D4W3U-B7VVO-4PJWW-6TKDJ-WPB77"; // 请替换为你的实际密钥
                    String url = String.format("https://apis.map.qq.com/ws/geocoder/v1/?location=%f,%f&key=%s", latitude, longitude, key);
                    String city="";
                    String street="";
                    CloseableHttpClient client = HttpClients.createDefault();
                    HttpGet request = new HttpGet(url);
                    String responseBody = EntityUtils.toString(client.execute(request).getEntity());
                    JSONObject json = JSON.parseObject(responseBody);
                    if (json.getString("status").equals("0")){
                        JSONObject result = json.getJSONObject("result");
                        JSONObject addressComponent = result.getJSONObject("address_component");
                        city = addressComponent.getString("city");
                        String district = addressComponent.getString("district");
                        street = addressComponent.getString("street");
                        String address = city + district + street;
                        System.out.println("地址: " + address);
                    }
                    client.close();

                    // 将角度转换为弧度
                    GlobalCoordinates target = new GlobalCoordinates(shop.getLatitude().doubleValue(), shop.getLongitude().doubleValue());
                    // 创建计算工具，使用WGS84椭球模型
                    GeodeticCalculator geoCalc = new GeodeticCalculator();
                    GeodeticCurve curve = geoCalc.calculateGeodeticCurve(Ellipsoid.WGS84, source, target);

                    // 获取距离，单位为米
                    double distanceInMeters = curve.getEllipsoidalDistance()/1000;
                    System.out.println("WGS84坐标系计算距离: " + distanceInMeters + " 米");
                    distanceInMeters = Math.round(distanceInMeters * 10) / 10.0;
                    shop.setDistanceInMeters(distanceInMeters);
                    shop.setBusPrivateKey(city);//当做城市
                    shop.setBusPublicKey(street);//当做街道
                    shop.setBusProductId("0");//当做是否收藏了
                    shop.setBusSysId("");
                    shop.setPrintPkey("");

                    //如果customerId不等于0说明登录了
                    if(customerId!=0){
                        LambdaQueryWrapper<ShopCollect> lqw = new LambdaQueryWrapper<>();
                        lqw.eq(ShopCollect::getCustomerId, customerId);
                        lqw.eq(ShopCollect::getShopId, shop.getId());
                        ShopCollect checkExit = shopCollectService.getOnlyOne(lqw);
                        if (checkExit != null)
                            shop.setBusProductId("1");//当做是否收藏了
                    }

                    long count1=bedService.findMaxBedCount(shop.getId(), 1);
                    long count2=bedService.findMaxBedCount(shop.getId(), 2);
                    shop.setPrintSn("舒筋"+count2+"位   头疗"+count1+"位 ");
                } catch (Exception e) {
                }
            });
            //根据shopList中的distanceInMeters距离排序
            shopList.sort(Comparator.comparing(Shop::getDistanceInMeters));
        }
        else{
            shopList.stream().forEach(shop -> {
                    shop.setBusPrivateKey("");//当做城市
                    shop.setBusPublicKey("");//当做街道
                    shop.setBusProductId("0");//当做是否收藏了
                    shop.setBusSysId("");
                    shop.setPrintPkey("");
                    //如果customerId不等于0说明登录了
                    if(customerId!=0){
                        LambdaQueryWrapper<ShopCollect> lqw = new LambdaQueryWrapper<>();
                        lqw.eq(ShopCollect::getCustomerId, customerId);
                        lqw.eq(ShopCollect::getShopId, shop.getId());
                        ShopCollect checkExit = shopCollectService.getOnlyOne(lqw);
                        if (checkExit != null)
                            shop.setBusProductId("1");//当做是否收藏了
                    }

                    long count1=bedService.findMaxBedCount(shop.getId(), 1);
                    long count2=bedService.findMaxBedCount(shop.getId(), 2);
                    shop.setPrintSn("舒筋"+count2+"位   头疗"+count1+"位 ");
            });
        }
        return shopList;
    }

    //获取城市和街道
    public Object getMiniCityAndStreet(Map<String, Object> params) {
        Map<String, String> map = new HashMap<>();
        if (params.get("latitude") != null && params.get("latitude") != "") {
            /*//计算两点的坐标
            double latitude = Double.parseDouble(params.get("latitude").toString());
            double longitude = Double.parseDouble(params.get("longitude").toString());

            try {
                String key = "OB4BZ-D4W3U-B7VVO-4PJWW-6TKDJ-WPB77"; // 请替换为你的实际密钥

                String url = String.format("https://apis.map.qq.com/ws/geocoder/v1/?location=%f,%f&key=%s", latitude, longitude, key);
                String city = "";
                String street = "";
                CloseableHttpClient client = HttpClients.createDefault();
                HttpGet request = new HttpGet(url);
                String responseBody = EntityUtils.toString(client.execute(request).getEntity());
                JSONObject json = JSON.parseObject(responseBody);
                if (json.getString("status").equals("0")) {
                    JSONObject result = json.getJSONObject("result");
                    JSONObject addressComponent = result.getJSONObject("address_component");
                    city = addressComponent.getString("city");
                    String district = addressComponent.getString("district");
                    street = addressComponent.getString("street");
                    String address = city + district + street;
                    System.out.println("地址: " + address);
                    map.put("city", city);
                    map.put("street", street);
                }
                client.close();
            } catch (Exception e) {
            }*/
        }
        return map;
    }

    //获取收藏的门店列表
    public Object getMiniShopCollect(long customerId) {
        Map<String, Object> params = new HashMap<>();
        params.put("customerId", customerId);
        List<ShopCollect> shopCollectList =shopCollectService.listNoPage(params);
        Long[] shopIds = shopCollectList.stream()
                .map(ShopCollect::getShopId)  // 假设getShopId()是获取shopid的方法
                .toArray(Long[]::new);
        return shopIds;
    }
    //添加或删除收藏的门店
    public void miniInsterOrDelete(long shopId,long customerId) {
        ShopCollect shopCollect = new ShopCollect();
        shopCollect.setShopId(shopId);
        shopCollect.setCustomerId(customerId);
        shopCollectService.InsterOrDelete(shopCollect);
    }



}