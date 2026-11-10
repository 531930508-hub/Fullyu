package com.macro.mall.incentive.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.incentive.calc.IncentiveMath;
import com.macro.mall.incentive.calc.TrainingCertificationPolicy;
import com.macro.mall.incentive.dto.AssessmentSubmitRequest;
import com.macro.mall.incentive.dto.AssessmentSubmitResult;
import com.macro.mall.incentive.entity.MassagistTrainingAssessment;
import com.macro.mall.incentive.entity.TrainingProjectConfig;
import com.macro.mall.incentive.mapper.MassagistTrainingAssessmentMapper;
import com.macro.mall.service.MassagistService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 内训师提交考核。认证判断与写入串行化到被考核疗愈师行，避免两位内训师同时提交时重复认证。
 */
@Service
public class TrainingAssessmentService {

    @Autowired
    private TrainingTeamCertProperties properties;

    @Autowired
    private IncentiveAccessService accessService;

    @Autowired
    private IncentiveConfigService configService;

    @Autowired
    private MassagistService massagistService;

    @Autowired
    private MassagistTrainingAssessmentMapper assessmentMapper;

    @Autowired
    private TrainingCertificationService certificationService;

    @Transactional(rollbackFor = Exception.class)
    public AssessmentSubmitResult submit(AssessmentSubmitRequest request) {
        Massagist trainer = accessService.requireTrainer();
        if (request == null || request.getMassagistId() == null
                || request.getProjectKey() == null || request.getProjectKey().trim().isEmpty()
                || request.getAssessDate() == null || request.getResult() == null) {
            throw new BusinessException("疗愈师、项目、考核日期和结果不能为空");
        }
        if (request.getResult() != 0 && request.getResult() != 1) {
            throw new BusinessException("考核结果不正确");
        }
        if (request.getMassagistId().equals(trainer.getId())) {
            throw new BusinessException("不能给自己做考核");
        }
        LocalDate today = LocalDate.now();
        LocalDate earliest = today.minusDays(properties.backfillDays());
        if (request.getAssessDate().isAfter(today)) {
            throw new BusinessException("考核日期不能晚于今天");
        }
        if (request.getAssessDate().isBefore(earliest)) {
            throw new BusinessException("最多补记" + properties.backfillDays() + "天内的考核");
        }
        String remark = request.getRemark() == null ? null : request.getRemark().trim();
        if (remark != null && remark.length() > 500) {
            throw new BusinessException("备注不能超过500个字符");
        }

        Massagist target = massagistService.getById(request.getMassagistId());
        if (target == null) {
            throw new BusinessException("疗愈师档案不存在");
        }
        if (Integer.valueOf(0).equals(target.getStatus())) {
            throw new BusinessException("该疗愈师已离职，不能考核");
        }

        String projectKey = request.getProjectKey().trim();
        TrainingProjectConfig project = configService.bundleForMonth(IncentiveMath.currentMonth())
                .getTrainingProjects().stream()
                .filter(p -> projectKey.equals(p.getProjectKey())
                        && Integer.valueOf(1).equals(p.getEnabled()))
                .findFirst().orElse(null);
        if (project == null) {
            throw new BusinessException("培训项目不存在或已停用");
        }

        // 认证判断、防重与写入必须串行化到同一目标。
        assessmentMapper.lockMassagist(target.getId());
        // 先判锁定再判防重：已认证是终态，避免刚通过的内训师重试时收到“请勿重复提交”的误导提示。
        if (certificationService.findByTargetAndProject(target.getId(), projectKey) != null) {
            throw new BusinessException("该疗愈师该项目已认证，无需再考核");
        }
        if (assessmentMapper.countRecent(trainer.getId(), target.getId(), projectKey,
                LocalDateTime.now().minusMinutes(properties.duplicateMinutes())) > 0) {
            throw new BusinessException("刚刚已提交过该疗愈师的考核，请勿重复提交");
        }

        MassagistTrainingAssessment row = new MassagistTrainingAssessment();
        row.setMassagistId(target.getId());
        row.setShopId(target.getShopId());
        row.setProjectKey(project.getProjectKey());
        row.setProjectName(project.getProjectName());
        row.setAssessDate(request.getAssessDate());
        row.setResult(request.getResult());
        row.setTrainerMassagistId(trainer.getId());
        row.setTrainerName(trainer.getName());
        row.setTrainerShopId(trainer.getShopId());
        row.setTrainerAdminId(accessService.currentAdmin().getId());
        row.setRemark(remark);
        row.setSubmittedAt(LocalDateTime.now());
        row.setVoided(0);
        row.setCreateTime(LocalDateTime.now());
        assessmentMapper.insert(row);

        List<TrainingCertificationPolicy.Vote> votes = new ArrayList<>();
        for (MassagistTrainingAssessment vote : assessmentMapper.latestVotes(target.getId(), projectKey)) {
            votes.add(new TrainingCertificationPolicy.Vote(vote.getTrainerMassagistId(), vote.getResult(),
                    vote.getAssessDate(), vote.getSubmittedAt(), vote.getId()));
        }
        TrainingCertificationPolicy.Decision decision = new TrainingCertificationPolicy().evaluate(votes);

        AssessmentSubmitResult result = new AssessmentSubmitResult();
        result.setProjectKey(project.getProjectKey());
        result.setProjectName(project.getProjectName());
        if (decision.isCertified()) {
            certificationService.certifyTeam(target, project, decision,
                    accessService.currentAdmin().getId(), accessService.currentOperatorName());
            result.setCertified(true);
            result.setMessage("已记录，该项目已完成三人认证");
        } else {
            result.setMessage("已记录本次考核");
        }
        return result;
    }
}
