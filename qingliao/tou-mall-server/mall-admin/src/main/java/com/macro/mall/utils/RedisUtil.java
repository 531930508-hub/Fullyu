package com.macro.mall.utils;

import com.alibaba.fastjson2.JSON;
import org.apache.logging.log4j.util.Strings;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.JdkSerializationRedisSerializer;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Component
public class RedisUtil {
    @Autowired
    private StringRedisTemplate stringTemplate;

    /**
     * map操作
     */
    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    public void setStringMonth(String key, String value, int expire) {
        setString(key, value, expire * 30, TimeUnit.DAYS);
    }

    public void setStringDay(String key, String value, int expire) {
        setString(key, value, expire, TimeUnit.DAYS);
    }

    public void setStringMinutes(String key, String value, int expire) {
        setString(key, value, expire, TimeUnit.MINUTES);
    }

    public void multiSetString(Map<String, String> map) {
        stringTemplate.opsForValue().multiSet(map);
    }

    public void batchDelete(Set<String> keys) {
        stringTemplate.delete(keys);
    }

    /**
     * 不设置过期时间
     *
     * @param key
     * @param value
     */
    public void setStringForever(String key, String value) {
        stringTemplate.opsForValue().set(key, value);
    }

    public void setString(String key, String value, long expire) {
        setString(key, value, expire, TimeUnit.SECONDS);
    }

    public void setString(String key, String value, long expire, TimeUnit unit) {
        stringTemplate.opsForValue().set(key, value, expire, unit);
    }

    public void increment(String key) {
        stringTemplate.opsForValue().increment(key);
    }

    /**
     * 查询前缀
     *
     * @param prefix
     * @return 返回keys列表
     */
    public Set<String> getKeys(String prefix) {
        return stringTemplate.keys(prefix.concat("*"));
    }

    /**
     * 缓存
     *
     * @param key
     * @param value
     * @param expire 过期时间，单位为小时
     */
    public void setStringExpireHour(String key, String value, int expire) {
        setString(key, value, expire, TimeUnit.HOURS);
    }

    /**
     * 缓存
     *
     * @param key
     * @param value
     * @param expire 过期时间，单位为分钟
     */
    public void setStringExpireMinutes(String key, String value, int expire) {
        setString(key, value, expire, TimeUnit.MINUTES);
    }

    public String getString(String key) {
        return stringTemplate.opsForValue().get(key);
    }

    /**
     * 通过key前缀匹配查找
     *
     * @param keyPreFix
     * @return
     */
    public Map<String, String> getByPreFix(String keyPreFix) {
        Set<String> keySet = stringTemplate.keys(keyPreFix + "*");
        if (CollectionUtils.isEmpty(keySet)) {
            return Collections.emptyMap();
        }
        List<String> keyList = new ArrayList<>(keySet);
        List<String> valueList = stringTemplate.opsForValue().multiGet(keySet);
        int size = keySet.size();
        HashMap<String, String> map = new HashMap<>(size);
        for (int i = 0; i < size; i++) {
            map.put(keyList.get(i), valueList.get(i));
        }
        return map;
    }

    /**
     * 指定缓存失效时间
     *
     * @param key    键
     * @param expire 时间(秒)
     * @return
     */
    public boolean setExpire(String key, long expire) {
        try {
            if (expire > 0) {
                stringTemplate.expire(key, expire, TimeUnit.SECONDS);
            }
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    /**
     * 根据key 获取过期时间
     *
     * @param key 键 不能为null
     * @return 时间(秒) 返回0代表为永久有效
     */
    public long getExpire(String key) {
        return stringTemplate.getExpire(key, TimeUnit.SECONDS);
    }

    /**
     * 判断key是否存在
     *
     * @param key 键
     * @return true 存在 false不存在
     */
    public boolean hasKey(String key) {
        try {
            return stringTemplate.hasKey(key);
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    /**
     * 存储数据或修改数据
     * 默认缓存1周
     *
     * @param modelMap map名称
     * @param mapName  map数据
     */
    public void setMap(String mapName, Map<String, String> modelMap) {
        setMap(mapName, modelMap, 1, TimeUnit.DAYS);
    }

    public void setMap(String mapName, Map<String, String> modelMap, int timeOut, TimeUnit timeUnit) {
        HashOperations<String, String, Object> hps = redisTemplate.opsForHash();
        hps.putAll(mapName, modelMap);
        redisTemplate.expire(mapName, timeOut, timeUnit);
    }

    /**
     * 获取数据Map
     *
     * @param mapName
     * @return
     */
    public Map<String, String> getMap(String mapName) {
        HashOperations<String, String, String> hps = redisTemplate.opsForHash();
        return hps.entries(mapName);

    }

    /**
     * 获取数据value
     *
     * @param mapName
     * @param hashKey
     * @return
     */
    public Object getMapValue(String mapName, String hashKey) {
        HashOperations<String, String, Object> hps = redisTemplate.opsForHash();
        return hps.get(mapName, hashKey);

    }

    /**
     * 缓存对象
     *
     * @param key
     * @param value
     * @param expire
     * @param unit
     * @param <T>
     */
    public <T> void setObj(String key, T value, long expire, TimeUnit unit) {
        String v = JSON.toJSONString(value);
        stringTemplate.opsForValue().set(key, v, expire, unit);
    }

    public <T> void setObj(String key, T value) {
        String v = JSON.toJSONString(value);
        stringTemplate.opsForValue().set(key, v);
    }

    /**
     * 取对象
     *
     * @param key
     * @param clazz
     * @param <T>
     * @return
     */
    public <T> T getObj(String key, Class<T> clazz) {
        String s = stringTemplate.opsForValue().get(key);
        if (Strings.isBlank(s)) {
            return null;
        }
        return JSON.parseObject(s, clazz);
    }

    /**
     * 批量删除缓存数据
     *
     * @param keys
     */
    public void deleteData(List<String> keys) {
        // 执行批量删除操作时先序列化template
        redisTemplate.setKeySerializer(new JdkSerializationRedisSerializer());
        redisTemplate.delete(keys);
    }

    /**
     * 删除缓存
     *
     * @param key
     * @return
     */
    public boolean delData(String key) {
        return stringTemplate.delete(key);
    }

    /**
     * 删除缓存
     *
     * @param key 可以传一个值 或多个
     */
    @SuppressWarnings("unchecked")
    public void del(String... key) {
        if (key != null && key.length > 0) {
            if (key.length == 1) {
                stringTemplate.delete(key[0]);
            } else {
                stringTemplate.delete((Collection<String>) CollectionUtils.arrayToList(key));
            }
        }
    }

    /**
     * 加锁
     *
     * @param key
     * @return
     */
    public boolean lock(String key) {
        // 10秒后自动解锁
        return lock(key, 10);
    }

    /**
     * 加锁
     *
     * @param key
     * @param seconds 锁释放时间，单位：秒
     * @return
     */
    public boolean lock(String key, int seconds) {
        String value = String.valueOf(System.currentTimeMillis() + seconds * 1000);
        return lock(key, value, seconds);
    }

    /**
     * 解锁
     *
     * @param key
     * @return
     */
    public boolean unLock(String key) {
        return stringTemplate.opsForValue().getOperations().delete(key);
    }

    /**
     * redis对key加锁
     *
     * @param key     要加锁的key
     * @param value   当前时间+超时时间，时间为毫秒
     * @param seconds 锁释放时间，单位：秒
     * @return
     */
    private boolean lock(String key, String value, int seconds) {
        // 如果锁不存在，则直接加锁
        Duration duration = Duration.ofSeconds(seconds);
        if (redisTemplate.opsForValue().setIfAbsent(key, value, duration)) {
            return true;
        }
        // 锁存在，则判断锁是否过期
        String currentValue = redisTemplate.opsForValue().get(key);
        if (Strings.isNotBlank(currentValue) && Long.parseLong(currentValue) < System.currentTimeMillis()) {
            // 锁过期了，拿到上一个锁的过期的时间，再设置新的加锁时间
            String originalValue = redisTemplate.opsForValue().getAndSet(key, value);
            if (Strings.isNotBlank(originalValue) && currentValue.equals(originalValue)) {
                // 如果获取到的加锁时间和原来过期的时间一样，则新时间加锁成功
                redisTemplate.expire(key, duration);
                return true;
            }
        }
        return false;
    }
    /**
     * redis解锁
     *
     * @param key
     * @param value
     * @return
     */
    public boolean unLock(String key, String value) {
        try {
            String currentValue = redisTemplate.opsForValue().get(key);
            if (Strings.isNotBlank(currentValue) && currentValue.equals(value)) {
                return redisTemplate.opsForValue().getOperations().delete(key);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return true;
    }

}