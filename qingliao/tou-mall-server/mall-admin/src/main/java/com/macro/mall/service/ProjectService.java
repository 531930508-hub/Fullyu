package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Project;
import com.macro.mall.enums.NormalState;
import com.macro.mall.mapper.ProjectMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 项目表 服务类
 *
 * @author ST
 * @date 2025/06/04
 */
@Service
public class ProjectService extends BaseService<ProjectMapper, Project> {

    @Override
    protected QueryWrapper<Project> buildWrapper(Map<String, Object> params, QueryWrapper<Project> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .like("title")
                .equal("state")
                .equal("category")
                .getQueryWrapper();
    }

    /**
     * 校验
     *
     * @param project
     */
    public void verify(Project project) {
        LambdaQueryWrapper<Project> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Project::getTitle, project.getTitle());
        lqw.eq(Project::getState, NormalState.EFFECTIVE.getValue());
        Long id = project.getId();
        if (id != null) {
            lqw.ne(Project::getId, id);
        }
        Project onlyOne = getOnlyOne(lqw);
        if (onlyOne != null) {
            throw new BusinessException("项目已存在");
        }
    }

    /**
     * 通过id找到类型
     *
     * @param id
     * @return
     */
    public Integer findTypeById(Long id) {
        LambdaQueryWrapper<Project> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Project::getId, id);
        queryWrapper.select(Project::getType);
        Project project = getOnlyOne(queryWrapper);
        if (project == null) {
            throw new BusinessException("项目类型不存在");
        }
        return project.getType();
    }


    /**
     * 通过类型找到id
     *
     * @param typeList
     * @return
     */
    public Map<Integer, Long> findIdMapByTypeList(List<Integer> typeList) {
        if (CollectionUtils.isEmpty(typeList)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<Project> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.in(Project::getType, typeList);
        queryWrapper.notIn(Project::getId, 4);
        queryWrapper.eq(Project::getCategory, 1);
        queryWrapper.select(Project::getId, Project::getType);
        List<Project> list = list(queryWrapper);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyMap();
        }
        return list.stream().collect(Collectors.toMap(Project::getType, Project::getId));
    }

    /**
     * 通过类型找到id
     *
     * @param type
     * @return
     */
    public Long findIdByType(Integer type) {
        LambdaQueryWrapper<Project> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Project::getType, type);
        queryWrapper.eq(Project::getCategory, 1);
        queryWrapper.select(Project::getId);
        Project project = getOnlyOne(queryWrapper);
        if (project == null) {
            throw new BusinessException("项目类型不存在");
        }
        return project.getId();
    }

    public String findTitleById(Long id) {
        LambdaQueryWrapper<Project> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Project::getId, id);
        queryWrapper.eq(Project::getCategory, 1);
        queryWrapper.select(Project::getTitle);
        Project project = getOnlyOne(queryWrapper);
        if (project == null) {
            throw new BusinessException("项目不存在");
        }
        return project.getTitle();
    }

    public Long findIdByTitle(String title) {
        LambdaQueryWrapper<Project> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Project::getTitle, title);
        queryWrapper.eq(Project::getCategory, 1);
        queryWrapper.select(Project::getId);
        Project project = getOnlyOne(queryWrapper);
        if (project == null) {
            throw new BusinessException("项目不存在");
        }
        return project.getId();
    }

    /**
     * 获取接待项目
     *
     * @return
     */
    public Long getReceptionProjectId() {
        LambdaQueryWrapper<Project> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Project::getCategory, 2);
        queryWrapper.eq(Project::getState, NormalState.EFFECTIVE.getValue());
        Project project = getOnlyOne(queryWrapper);
        if (project == null) {
            throw new BusinessException("接待项目不存在");
        }
        return project.getId();
    }

    /**
     * 是否是接待订单
     *
     * @return
     */
    public Boolean isReceptionOrder(Long id) {
        LambdaQueryWrapper<Project> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Project::getCategory, 2);
        queryWrapper.eq(Project::getState, NormalState.EFFECTIVE.getValue());
        queryWrapper.eq(Project::getId, id);
        return count(queryWrapper) > 0L;
    }
}