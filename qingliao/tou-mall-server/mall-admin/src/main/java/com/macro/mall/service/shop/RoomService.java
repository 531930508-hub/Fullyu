package com.macro.mall.service.shop;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.entity.Bed;
import com.macro.mall.entity.Room;
import com.macro.mall.mapper.RoomMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 服务类
 *
 * @author zkl
 * @date 2025/05/30
 */
@Service
public class RoomService extends BaseService<RoomMapper, Room> {
    @Override
    protected QueryWrapper<Room> buildWrapper(Map<String, Object> params, QueryWrapper<Room> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .like("name")
                .like("serialNumber")
                .equal("status")
                .equal("type")
                .equal("shop_id")
                .getQueryWrapper();
    }

    @Autowired
    BedService bedService;

    public List<Room> listByShopId(Long shopId) {
        LambdaQueryWrapper<Room> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Room::getShopId, shopId);
        return list(lqw);
    }

    @Transactional(rollbackFor = Exception.class)
    public void remove(Long id) {
        List<Bed> bedList = bedService.listByRoomId(id);
        if (!CollectionUtils.isEmpty(bedList)) {
            List<Long> bedIds = bedList.stream().map(Bed::getId).collect(Collectors.toList());
            bedService.removeBatchByIds(bedIds);
        }
        removeById(id);
    }
}