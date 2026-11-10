package ${package.Service};

import ${package.Entity}.${entity};
import ${package.Mapper}.${table.mapperName};
import com.macro.mall.service.base.BaseService;
import org.springframework.stereotype.Service;

/**
 * ${table.comment!} 服务类
 * @author ${author}
 * @date ${date}
 */
@Service
public class ${entity}Service extends BaseService<${table.mapperName}, ${entity}> {

}