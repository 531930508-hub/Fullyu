package com.macro.mall.incentive.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.incentive.calc.TrainingCertificationPolicy;
import com.macro.mall.incentive.entity.MassagistTrainingAssessment;
import com.macro.mall.incentive.entity.MassagistTrainingCert;
import com.macro.mall.incentive.entity.MassagistTrainingCertLog;
import com.macro.mall.incentive.entity.TrainingProjectConfig;
import com.macro.mall.incentive.mapper.MassagistTrainingAssessmentMapper;
import com.macro.mall.incentive.mapper.MassagistTrainingCertLogMapper;
import com.macro.mall.incentive.mapper.MassagistTrainingCertMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 认证投影的写入与撤销。认证表继续作为奖励计算的唯一读取来源。
 */
@Service
public class TrainingCertificationService {

    @Autowired
    private MassagistTrainingCertMapper certMapper;

    @Autowired
    private MassagistTrainingCertLogMapper certLogMapper;

    @Autowired
    private MassagistTrainingAssessmentMapper assessmentMapper;

    @Autowired
    private IncentiveAccessService accessService;

    @Transactional(rollbackFor = Exception.class)
    public MassagistTrainingCert certifyTeam(Massagist target, TrainingProjectConfig project,
                                             TrainingCertificationPolicy.Decision decision,
                                             Long operatorId, String operatorName) {
        if (!decision.isCertified()) {
            throw new BusinessException("尚未达到三人认证条件");
        }
        if (findByTargetAndProject(target.getId(), project.getProjectKey()) != null) {
            throw new BusinessException("该疗愈师该项目已认证");
        }
        MassagistTrainingCert cert = new MassagistTrainingCert();
        cert.setMassagistId(target.getId());
        cert.setShopId(target.getShopId());
        cert.setProjectKey(project.getProjectKey());
        cert.setPassedAt(decision.getPassedAt());
        cert.setCertifierId(operatorId);
        cert.setCertifierName("内训师团队");
        cert.setRemark("3位内训师考核通过");
        cert.setSource("TEAM");
        cert.setCertifiedAt(LocalDateTime.now());
        cert.setTeamSize(TrainingCertificationPolicy.REQUIRED_TRAINERS);
        certMapper.insert(cert);
        writeLog(cert, "TEAM_CERTIFY", null, cert.getPassedAt(), operatorId, operatorName,
                "内训师ID：" + decision.getTrainerIds());
        return cert;
    }

    @Transactional(rollbackFor = Exception.class)
    public void revoke(Long certId, String reason) {
        accessService.requireSuperAdmin();
        String safeReason = requireReason(reason);
        MassagistTrainingCert cert = certMapper.selectById(certId);
        if (cert == null) {
            throw new BusinessException("考核记录不存在");
        }
        writeLog(cert, "REVOKE", cert.getPassedAt(), null,
                accessService.currentAdmin().getId(), accessService.currentOperatorName(), safeReason);
        assessmentMapper.update(null, new UpdateWrapper<MassagistTrainingAssessment>()
                .eq("massagist_id", cert.getMassagistId())
                .eq("project_key", cert.getProjectKey())
                .eq("voided", 0)
                .set("voided", 1)
                .set("voided_by", accessService.currentAdmin().getId())
                .set("voided_at", LocalDateTime.now())
                .set("void_reason", safeReason));
        certMapper.deleteById(certId);
    }

    @Transactional(rollbackFor = Exception.class)
    public MassagistTrainingCert manualCert(Massagist target, TrainingProjectConfig project,
                                            LocalDate passedAt, String reason) {
        accessService.requireSuperAdmin();
        String safeReason = requireReason(reason);
        if (passedAt == null) {
            throw new BusinessException("通过日期不能为空");
        }
        if (passedAt.isAfter(LocalDate.now())) {
            throw new BusinessException("通过日期不能晚于今天");
        }
        if (findByTargetAndProject(target.getId(), project.getProjectKey()) != null) {
            throw new BusinessException("该疗愈师该项目已认证");
        }
        MassagistTrainingCert cert = new MassagistTrainingCert();
        cert.setMassagistId(target.getId());
        cert.setShopId(target.getShopId());
        cert.setProjectKey(project.getProjectKey());
        cert.setPassedAt(passedAt);
        cert.setCertifierId(accessService.currentAdmin().getId());
        cert.setCertifierName(accessService.currentOperatorName());
        cert.setRemark(safeReason);
        cert.setSource("MANUAL");
        cert.setCertifiedAt(LocalDateTime.now());
        cert.setTeamSize(0);
        certMapper.insert(cert);
        writeLog(cert, "MANUAL_CERTIFY", null, passedAt,
                accessService.currentAdmin().getId(), accessService.currentOperatorName(), safeReason);
        return cert;
    }

    public MassagistTrainingCert findByTargetAndProject(Long massagistId, String projectKey) {
        if (massagistId == null || projectKey == null) {
            return null;
        }
        return certMapper.selectOne(new LambdaQueryWrapper<MassagistTrainingCert>()
                .eq(MassagistTrainingCert::getMassagistId, massagistId)
                .eq(MassagistTrainingCert::getProjectKey, projectKey)
                .last("LIMIT 1"));
    }

    @Transactional(rollbackFor = Exception.class)
    public void voidAssessment(Long assessmentId, String reason) {
        accessService.requireSuperAdmin();
        String safeReason = requireReason(reason);
        MassagistTrainingAssessment row = assessmentMapper.selectById(assessmentId);
        if (row == null) {
            throw new BusinessException("考核记录不存在");
        }
        if (Integer.valueOf(1).equals(row.getVoided())) {
            throw new BusinessException("该记录已作废");
        }
        if (findByTargetAndProject(row.getMassagistId(), row.getProjectKey()) != null) {
            throw new BusinessException("该项目已认证，请先撤销认证再作废单条考核");
        }
        row.setVoided(1);
        row.setVoidedBy(accessService.currentAdmin().getId());
        row.setVoidedAt(LocalDateTime.now());
        row.setVoidReason(safeReason);
        assessmentMapper.updateById(row);
    }

    private void writeLog(MassagistTrainingCert cert, String action, LocalDate oldDate,
                          LocalDate newDate, Long operatorId, String operatorName, String remark) {
        MassagistTrainingCertLog log = new MassagistTrainingCertLog();
        log.setCertId(cert.getId());
        log.setMassagistId(cert.getMassagistId());
        log.setShopId(cert.getShopId());
        log.setProjectKey(cert.getProjectKey());
        log.setAction(action);
        log.setOldPassedAt(oldDate);
        log.setNewPassedAt(newDate);
        log.setOperatorId(operatorId);
        log.setOperatorName(operatorName);
        log.setRemark(remark);
        certLogMapper.insert(log);
    }

    private String requireReason(String reason) {
        if (reason == null || reason.trim().isEmpty()) {
            throw new BusinessException("请填写作废/撤销原因");
        }
        String trimmed = reason.trim();
        if (trimmed.length() > 500) {
            throw new BusinessException("原因不能超过500个字符");
        }
        return trimmed;
    }
}
