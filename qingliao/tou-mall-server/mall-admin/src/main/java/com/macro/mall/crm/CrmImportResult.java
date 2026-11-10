package com.macro.mall.crm;

import java.util.ArrayList;
import java.util.List;

/**
 * 会员导入结果，与 CRM {@code POST /api/external/members/import} 的返回结构对应。
 */
public class CrmImportResult {
    private int submitted;
    private int created;
    private int bound;
    private int unchanged;
    private int migratedMembers;
    private long migratedPoints;
    private List<Failure> failed = new ArrayList<>();

    public void add(CrmImportResult other) {
        if (other == null) {
            return;
        }
        submitted += other.submitted;
        created += other.created;
        bound += other.bound;
        unchanged += other.unchanged;
        migratedMembers += other.migratedMembers;
        migratedPoints += other.migratedPoints;
        if (other.failed != null) {
            failed.addAll(other.failed);
        }
    }

    public int getSubmitted() {
        return submitted;
    }

    public void setSubmitted(int submitted) {
        this.submitted = submitted;
    }

    public int getCreated() {
        return created;
    }

    public void setCreated(int created) {
        this.created = created;
    }

    public int getBound() {
        return bound;
    }

    public void setBound(int bound) {
        this.bound = bound;
    }

    public int getUnchanged() {
        return unchanged;
    }

    public void setUnchanged(int unchanged) {
        this.unchanged = unchanged;
    }

    public int getMigratedMembers() {
        return migratedMembers;
    }

    public void setMigratedMembers(int migratedMembers) {
        this.migratedMembers = migratedMembers;
    }

    public long getMigratedPoints() {
        return migratedPoints;
    }

    public void setMigratedPoints(long migratedPoints) {
        this.migratedPoints = migratedPoints;
    }

    public List<Failure> getFailed() {
        return failed;
    }

    public void setFailed(List<Failure> failed) {
        this.failed = failed;
    }

    public static class Failure {
        private String localUserId;
        private String reason;

        public String getLocalUserId() {
            return localUserId;
        }

        public void setLocalUserId(String localUserId) {
            this.localUserId = localUserId;
        }

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }
    }
}
