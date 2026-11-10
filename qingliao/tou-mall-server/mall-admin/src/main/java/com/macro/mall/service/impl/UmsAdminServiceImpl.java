package com.macro.mall.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.github.pagehelper.PageHelper;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.Asserts;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.common.util.RequestUtil;
import com.macro.mall.dao.UmsAdminRoleRelationDao;
import com.macro.mall.dto.UmsAdminParam;
import com.macro.mall.dto.UpdateAdminPasswordParam;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.entity.Shop;
import com.macro.mall.mapper.UmsAdminLoginLogMapper;
import com.macro.mall.mapper.UmsAdminMapper;
import com.macro.mall.mapper.UmsAdminRoleRelationMapper;
import com.macro.mall.model.*;
import com.macro.mall.security.util.JwtTokenUtil;
import com.macro.mall.security.util.SpringUtil;
import com.macro.mall.service.*;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.shop.ShopService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.ObjectUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 后台用户管理Service实现类
 * Created by macro on 2018/4/26.
 */
@Service
public class UmsAdminServiceImpl extends BaseService<UmsAdminMapper, UmsAdmin> implements UmsAdminService {
    private static final Logger LOGGER = LoggerFactory.getLogger(UmsAdminServiceImpl.class);
    @Autowired
    private JwtTokenUtil jwtTokenUtil;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private UmsAdminMapper adminMapper;
    @Autowired
    private UmsAdminRoleRelationMapper adminRoleRelationMapper;
    @Autowired
    private UmsAdminRoleRelationDao adminRoleRelationDao;
    @Autowired
    private UmsAdminLoginLogMapper loginLogMapper;
    @Autowired
    MassagistService massagistService;
    @Autowired
    MassagistSchedulesService massagistSchedulesService;
    @Autowired
    CustomerService customerService;
    @Autowired
    ShopService shopService;

    @Override
    public UmsAdmin getAdminByUsername(String username) {
        UmsAdmin admin = getCacheService().getAdmin(username);
        if (admin == null) {
            UmsAdminExample example = new UmsAdminExample();
            example.createCriteria().andUsernameEqualTo(username);
            List<UmsAdmin> found = adminMapper.selectByExample(example);
            if (found == null || found.isEmpty()) return null;
            admin = found.get(0);
            getCacheService().setAdmin(admin);
        }
        // 不修改缓存对象；每次请求根据今天的记录解析临时门店，次日自然回到档案归属门店。
        UmsAdmin scoped = new UmsAdmin();
        org.springframework.beans.BeanUtils.copyProperties(admin, scoped);
        Massagist person = massagistService.getByUmsAdminId(admin.getId());
        if (person != null) {
            scoped.setMassagistId(person.getId());
            scoped.setShopId(person.getShopId());
            scoped.setShopIdArr("[" + person.getShopId() + "]");
            MassagistSchedules transfer = massagistSchedulesService.getOnlyOne(new LambdaQueryWrapper<MassagistSchedules>()
                    .eq(MassagistSchedules::getMassagistId, person.getId())
                    .eq(MassagistSchedules::getSchedulesType, 1L)
                    .eq(MassagistSchedules::getDay, java.time.LocalDate.now())
                    .orderByDesc(MassagistSchedules::getId));
            if (transfer != null && transfer.getTargetShopId() != null && transfer.getTargetShopId() > 0) {
                scoped.setShopId(transfer.getTargetShopId());
                scoped.setShopIdArr("[" + transfer.getTargetShopId() + "]");
            }
        }
        return scoped;
    }

    @Override
    public UmsAdmin getAdminByUsernameNew(String username) {
        return getAdminByUsername(username);
    }

    @Override
    public UmsAdmin register(UmsAdminParam umsAdminParam) {
        UmsAdmin umsAdmin = new UmsAdmin();
        BeanUtils.copyProperties(umsAdminParam, umsAdmin);
        umsAdmin.setCreateTime(new Date());
        umsAdmin.setStatus(1);
        umsAdmin.setShopIdArr(umsAdminParam.getShopIdArr());//
        //查询是否有相同用户名的用户
        UmsAdminExample example = new UmsAdminExample();
        example.createCriteria().andUsernameEqualTo(umsAdmin.getUsername());
        List<UmsAdmin> umsAdminList = adminMapper.selectByExample(example);
        if (umsAdminList.size() > 0) {
            throw new BusinessException("账号已经存在，不允许添加");
        }
        //将密码进行加密操作
        String encodePassword = passwordEncoder.encode(umsAdmin.getPassword());
        umsAdmin.setPassword(encodePassword);
        adminMapper.insert(umsAdmin);
        return umsAdmin;
    }

    @Override
    public String login(String username, String password) {
        String token = null;
        //密码需要客户端加密后传递
        String encode = passwordEncoder.encode("12345678");
        System.out.println(encode);

        try {
            UserDetails userDetails = loadUserByUsername(username);
            if (!passwordEncoder.matches(password, userDetails.getPassword())) {
                Asserts.fail("密码不正确");
            }
            if (!userDetails.isEnabled()) {
                Asserts.fail("帐号已被禁用");
            }
            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
            SecurityContextHolder.getContext().setAuthentication(authentication);
            token = jwtTokenUtil.generateToken(userDetails);
//            updateLoginTimeByUsername(username);
            insertLoginLog(username);
        } catch (AuthenticationException e) {
            LOGGER.warn("登录异常:{}", e.getMessage());
        }
        return token;
    }

    /**
     * 添加登录记录
     *
     * @param username 用户名
     */
    private void insertLoginLog(String username) {
        UmsAdmin admin = getAdminByUsername(username);
        if (admin == null) return;
        UmsAdminLoginLog loginLog = new UmsAdminLoginLog();
        loginLog.setAdminId(admin.getId());
        loginLog.setCreateTime(new Date());
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        HttpServletRequest request = attributes.getRequest();
        loginLog.setIp(RequestUtil.getRequestIp(request));
        loginLogMapper.insert(loginLog);
    }

    /**
     * 根据用户名修改登录时间
     */
    private void updateLoginTimeByUsername(String username) {
        UmsAdmin record = new UmsAdmin();
        record.setLoginTime(new Date());
        UmsAdminExample example = new UmsAdminExample();
        example.createCriteria().andUsernameEqualTo(username);
        adminMapper.updateByExampleSelective(record, example);
    }

    @Override
    public String refreshToken(String oldToken) {
        return jwtTokenUtil.refreshHeadToken(oldToken);
    }

    @Override
    public UmsAdmin getItem(Long id) {
        return adminMapper.selectByPrimaryKey(id);
    }

    @Override
    public List<UmsAdmin> list(String keyword, Integer pageSize, Integer pageNum) {
        PageHelper.startPage(pageNum, pageSize," status desc,create_time desc");
        UmsAdminExample example = new UmsAdminExample();
        UmsAdminExample.Criteria criteria = example.createCriteria();
        if (!StrUtil.isEmpty(keyword)) {
            criteria.andUsernameLike("%" + keyword + "%");
            example.or(example.createCriteria().andNickNameLike("%" + keyword + "%"));
        }
        List<UmsAdmin> umsAdmins = adminMapper.selectByExample(example);
        if (!ObjectUtils.isEmpty(umsAdmins)) {
            List<Long> umsAdminIds = umsAdmins.stream().map(UmsAdmin::getId).collect(Collectors.toList());
            List<Massagist> massagists = massagistService.listByUmsAdminIds(umsAdminIds);
            Map<Long, Massagist> collect = massagists.stream().collect(Collectors.toMap(Massagist::getUmsAdminId, Function.identity()));
            umsAdmins.forEach(e -> {
                if (!ObjectUtils.isEmpty(collect.get(e.getId()))) {
                    e.setMassagistId(collect.get(e.getId()).getId());
                    e.setMassagistName(collect.get(e.getId()).getName());
                }

                if(!e.getShopIdArr().isEmpty()){
                    String[] shopIdArr=e.getShopIdArr().replace("[","").replace("]","").replace(" ","").split(",");
                    String ShopName="";
                    for(int i=0;i<shopIdArr.length;i++){
                        Shop obj=shopService.getById(shopIdArr[i]);
                        if(!ObjectUtils.isEmpty(obj)){
                            ShopName+=obj.getName()+"</br>";
                        }
                    }
                    e.setShopIdArrName(ShopName);
                }
            });
        }
        return umsAdmins;
    }

    @Override
    public int update(Long id, UmsAdmin admin) {
        admin.setId(id);
        UmsAdmin rawAdmin = adminMapper.selectByPrimaryKey(id);
        if (rawAdmin.getPassword().equals(admin.getPassword())) {
            //与原加密密码相同的不需要修改
            admin.setPassword(null);
        } else {
            //与原加密密码不同的需要加密修改
            if (StrUtil.isEmpty(admin.getPassword())) {
                admin.setPassword(null);
            } else {
                admin.setPassword(passwordEncoder.encode(admin.getPassword()));
            }
        }
        int count = adminMapper.updateByPrimaryKeySelective(admin);
        getCacheService().delAdmin(id);
        return count;
    }

    @Override
    public int delete(Long id) {
        Massagist massagist = massagistService.getByUmsAdminId(id);
        if (!ObjectUtils.isEmpty(massagist)) {
            throw new BusinessException("此账号已关联疗愈师不允许删除");
        }
        int count = adminMapper.deleteByPrimaryKey(id);
        getCacheService().delAdmin(id);
        getCacheService().delResourceList(id);
        return count;
    }

    @Override
    public int updateRole(Long adminId, List<Long> roleIds) {
        int count = roleIds == null ? 0 : roleIds.size();
        //先删除原来的关系
        UmsAdminRoleRelationExample adminRoleRelationExample = new UmsAdminRoleRelationExample();
        adminRoleRelationExample.createCriteria().andAdminIdEqualTo(adminId);
        adminRoleRelationMapper.deleteByExample(adminRoleRelationExample);
        //建立新关系
        if (!CollectionUtils.isEmpty(roleIds)) {
            List<UmsAdminRoleRelation> list = new ArrayList<>();
            for (Long roleId : roleIds) {
                UmsAdminRoleRelation roleRelation = new UmsAdminRoleRelation();
                roleRelation.setAdminId(adminId);
                roleRelation.setRoleId(roleId);
                list.add(roleRelation);
            }
            adminRoleRelationDao.insertList(list);
        }
        getCacheService().delResourceList(adminId);
        return count;
    }

    @Override
    public List<UmsRole> getRoleList(Long adminId) {
        return adminRoleRelationDao.getRoleList(adminId);
    }

    @Override
    public List<UmsResource> getResourceList(Long adminId) {
        //先从缓存中获取数据
        List<UmsResource> resourceList = getCacheService().getResourceList(adminId);
        if (CollUtil.isNotEmpty(resourceList)) {
            return resourceList;
        }
        //缓存中没有从数据库中获取
        resourceList = adminRoleRelationDao.getResourceList(adminId);
        if (CollUtil.isNotEmpty(resourceList)) {
            //将数据库中的数据存入缓存中
            getCacheService().setResourceList(adminId, resourceList);
        }
        return resourceList;
    }

    @Override
    public int updatePassword(UpdateAdminPasswordParam param) {
        if (StrUtil.isEmpty(param.getUsername())
                || StrUtil.isEmpty(param.getOldPassword())
                || StrUtil.isEmpty(param.getNewPassword())) {
            return -1;
        }
        UmsAdminExample example = new UmsAdminExample();
        example.createCriteria().andUsernameEqualTo(param.getUsername());
        List<UmsAdmin> adminList = adminMapper.selectByExample(example);
        if (CollUtil.isEmpty(adminList)) {
            return -2;
        }
        UmsAdmin umsAdmin = adminList.get(0);
        if (!passwordEncoder.matches(param.getOldPassword(), umsAdmin.getPassword())) {
            return -3;
        }
        umsAdmin.setPassword(passwordEncoder.encode(param.getNewPassword()));
        adminMapper.updateByPrimaryKey(umsAdmin);
        getCacheService().delAdmin(umsAdmin.getId());
        return 1;
    }

    @Override
    public void updatePassword(String username, String oldPassword, String newPassword, String newPassword2) {
        UmsAdmin umsAdmin = getAdminByUsername(username);
        boolean matches = passwordEncoder.matches(oldPassword, umsAdmin.getPassword());
        if (!matches) {
            throw new BusinessException("原密码验证不通过");
        }
        if (!newPassword.equals(newPassword2)) {
            throw new BusinessException("两个新密码验证不一致");
        }
        umsAdmin.setPassword(passwordEncoder.encode(newPassword));
        adminMapper.updateById(umsAdmin);
        getCacheService().delAdmin(umsAdmin.getId());
    }

    @Override
    public UserDetails loadUserByUsername(String username) {
        if (username.startsWith("fully-mini:")) {
            System.out.println(username.split("fully-mini:")[1]);
            Customer customer = customerService.getByPhone(username.split("fully-mini:")[1]);
            if (customer != null) {
                return new AdminUserDetails(customer, Collections.emptyList());
            }
        }
        //获取用户信息
        UmsAdmin admin = getAdminByUsername(username);
        if (admin != null) {
            List<UmsResource> resourceList = getResourceList(admin.getId());
            return new AdminUserDetails(admin, resourceList);
        }
        throw new UsernameNotFoundException("用户名或密码错误");
    }

    @Override
    public UmsAdminCacheService getCacheService() {
        return SpringUtil.getBean(UmsAdminCacheService.class);
    }

    @Override
    public void logout(String username) {
        //清空缓存中的用户相关数据
        UmsAdmin admin = getCacheService().getAdmin(username);
        getCacheService().delAdmin(admin.getId());
        getCacheService().delResourceList(admin.getId());
    }

    public Object listAll(Long shopId) {
        LambdaQueryWrapper<UmsAdmin> lqw = new LambdaQueryWrapper<>();
        lqw.select(UmsAdmin::getId, UmsAdmin::getUsername, UmsAdmin::getNickName);
        lqw.eq(UmsAdmin::getStatus, 1);
        if (!ObjectUtils.isEmpty(shopId)) {
            lqw.eq(UmsAdmin::getShopId, shopId);
        }
        return list(lqw);
    }

    public Long currentId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (ObjectUtils.isEmpty(authentication)) {
            throw new BusinessException("尚未登录");
        }
        AdminUserDetails user = (AdminUserDetails) authentication.getPrincipal();
        if (user == null) {
            throw new BusinessException("用户不存在");
        }
        return user.getUmsAdmin().getId();
    }

    public List<UmsAdmin> GetAdminUserList(Long shopId) {

        LambdaQueryWrapper<UmsAdmin> lqw = new LambdaQueryWrapper<>();
        lqw.select(UmsAdmin::getId, UmsAdmin::getUsername, UmsAdmin::getNickName, UmsAdmin::getShopIdArr);
        lqw.eq(UmsAdmin::getStatus, 1);
        List<UmsAdmin> list = list(lqw);
        List<UmsAdmin> listReturn = new ArrayList<>();
        for (UmsAdmin s : list) {
            String[] shopIdArr = s.getShopIdArr().replace("[", "").replace("]", "").replace(" ", "").split(",");
            for (String s1 : shopIdArr){
                String a=s1;
                String b=shopId.toString();
                if(a.equals(b))
                {
                    int c=0;
                }
                if (s1.equals(shopId.toString()))
                    listReturn.add(s);
            }

        }

        return listReturn;
    }
}
