package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.JsonNode;
import com.macro.mall.entity.Customer;
import com.macro.mall.mapper.CustomerMapper;
import com.macro.mall.service.impl.OssServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.apache.logging.log4j.util.Strings;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Objects;

/**
 * 会员资料（昵称 / 头像 / 性别 / 生日）统一：CRM 是唯一归档，本端只做镜像。
 *
 * <p>为什么不再各改各的：小程序个人中心、后台预约、品牌卡开通表单原先各存一套，
 * 同一顾客在不同端看到不同称呼。现在所有写入口都经过这里——写 CRM 成功才落本地，
 * 读个人中心前先拉 CRM，CRM 版本更新就覆盖本地。</p>
 *
 * <p>规则：</p>
 * <ul>
 *   <li>顾客主动改（小程序）：CRM 失败或版本冲突直接抛给前端，本地不落库，避免"看着改好了其实没同步"。</li>
 *   <li>后台 / 订单侧顺带改：本地照常保存，CRM 同步失败只记日志，不下单阻塞（{@link #afterLocalChange}）。</li>
 *   <li>拉取：CRM 版本 ≥ 本地版本且 CRM 有资料时以 CRM 为准；CRM 空档且本地有资料时反向补一次。</li>
 *   <li>手机号不参与同步：CRM 侧手机号是身份唯一键，改号只能由 CRM 运营处理。</li>
 * </ul>
 */
@Component
@Slf4j
public class BrandMemberProfileSync {

    /** 与 CRM 侧展示规则对齐：昵称最多 20 个字。 */
    public static final int NICKNAME_MAX = 20;

    /** 显式推过 CRM 后，CustomerService.updateById 的钩子不再重复推一次。 */
    private static final ThreadLocal<Boolean> PUSH_SUPPRESSED = new ThreadLocal<>();

    private final BrandMemberClient client;
    private final CustomerMapper customerMapper;
    private final OssServiceImpl ossService;

    public BrandMemberProfileSync(BrandMemberClient client, CustomerMapper customerMapper,
                                  OssServiceImpl ossService) {
        this.client = client;
        this.customerMapper = customerMapper;
        this.ossService = ossService;
    }

    public boolean isActive() {
        return client.isActive();
    }

    static void suppressPush() {
        PUSH_SUPPRESSED.set(Boolean.TRUE);
    }

    static void resumePush() {
        PUSH_SUPPRESSED.remove();
    }

    static boolean isPushSuppressed() {
        return Boolean.TRUE.equals(PUSH_SUPPRESSED.get());
    }

    /**
     * 顾客主动改资料：先推 CRM，成功（拿到新版本号）才算改成功。
     *
     * <p>版本冲突说明 CRM 侧刚被改过，这里顺手把 CRM 的最新资料拉回本地，
     * 再把异常抛给前端提示刷新。</p>
     */
    public void pushOrThrow(Customer customer) {
        if (!isActive() || customer == null || customer.getId() == null) {
            return;
        }
        RemoteProfile local = RemoteProfile.of(customer);
        try {
            JsonNode node = client.updateProfile(String.valueOf(customer.getId()), local.version,
                    local.nickname, publicAvatar(customer), local.gender, local.birthdayText());
            applyAck(customer, node);
        } catch (BrandMemberException e) {
            if (e.getStatus() == 409) {
                refreshQuietly(customer);
            }
            throw e;
        }
    }

    /**
     * 后台/订单侧顺带改了客户资料：本地已保存，这里尽力把 CRM 拉齐，失败只记日志。
     *
     * <p>只在"更新"时推（新建客户此时 CRM 往往还没有档案，登录时会补推），
     * 且只有资料四项真的变了才发请求，避免每次登录补 openId 都打一次 CRM。</p>
     */
    public void afterLocalChange(Customer before, Customer after) {
        if (!isActive() || isPushSuppressed() || before == null || after == null
                || after.getId() == null) {
            return;
        }
        Customer effective = merged(before, after);
        if (RemoteProfile.of(before).sameProfile(RemoteProfile.of(effective))) {
            return;
        }
        try {
            pushOrThrow(effective);
        } catch (BrandMemberException e) {
            log.warn("会员资料同步 CRM 失败，customerId={} code={} message={}",
                    after.getId(), e.getCode(), e.getMessage());
        }
    }

    /**
     * 后台改资料：本地已保存，返回同步失败的提示语给操作人（成功返回 null）。
     */
    public String afterLocalChangeStrict(Customer before, Customer after) {
        if (!isActive() || before == null || after == null || after.getId() == null) {
            return null;
        }
        Customer effective = merged(before, after);
        if (RemoteProfile.of(before).sameProfile(RemoteProfile.of(effective))) {
            return null;
        }
        try {
            pushOrThrow(effective);
            return null;
        } catch (BrandMemberException e) {
            log.warn("后台改客户资料同步 CRM 失败，customerId={} code={} message={}",
                    after.getId(), e.getCode(), e.getMessage());
            return e.getMessage();
        }
    }

    /**
     * 以 CRM 为准刷新本端资料；CRM 不可达、未建档时静默保留本地，绝不阻塞个人中心。
     */
    public void refreshQuietly(Customer customer) {
        if (!isActive() || customer == null || customer.getId() == null) {
            return;
        }
        RemoteProfile remote;
        try {
            remote = RemoteProfile.parse(client.me(String.valueOf(customer.getId())));
        } catch (BrandMemberException e) {
            if ("MEMBER_NOT_FOUND".equals(e.getCode())) {
                log.info("会员资料拉取跳过：CRM 尚未建档，customerId={}", customer.getId());
            } else {
                log.warn("会员资料拉取失败，保留本地，customerId={} code={} message={}",
                        customer.getId(), e.getCode(), e.getMessage());
            }
            return;
        }
        long localVersion = RemoteProfile.versionOf(customer.getCrmProfileVersion());
        if (remote.version >= localVersion && remote.hasProfile()) {
            if (remote.applyTo(customer)) {
                persist(customer);
            }
            // CRM 里的占位名（会员 / 会员+后四位 / 用户+手机号 / 茶客）不算"有名字"：
            // 本地名字信息量更大就补推上去，否则本地早就改过名的顾客，
            // CRM 会一直停在别处建档时的默认昵称。
            String localNickname = RemoteProfile.trimToNull(customer.getNickname());
            if (nicknameRank(localNickname) > nicknameRank(remote.nickname)) {
                try {
                    pushOrThrow(customer);
                } catch (BrandMemberException e) {
                    log.warn("会员昵称补推失败，customerId={} code={} message={}",
                            customer.getId(), e.getCode(), e.getMessage());
                }
            }
            return;
        }
        // CRM 还没有资料，本地有：把本地补上去，会员中心才不至于空着
        if (remote.version == localVersion && !remote.hasProfile() && RemoteProfile.of(customer).hasProfile()) {
            try {
                pushOrThrow(customer);
            } catch (BrandMemberException e) {
                log.warn("会员资料首次补推失败，customerId={} code={} message={}",
                        customer.getId(), e.getCode(), e.getMessage());
            }
        }
    }

    /** 把 CRM 回执里的资料与版本号写回实体（不动手机号）。 */
    private void applyAck(Customer customer, JsonNode node) {
        RemoteProfile ack = RemoteProfile.parse(node);
        if (!ack.hasProfile()) {
            ack = RemoteProfile.of(customer);
        }
        ack.applyTo(customer);
        customer.setCrmProfileVersion(Math.max(RemoteProfile.versionOf(customer.getCrmProfileVersion()), ack.version));
        persist(customer);
    }

    /**
     * 直接走 mapper：同步过程本身不能再触发 CustomerService.updateById 的同步钩子。
     */
    private void persist(Customer customer) {
        customer.setCrmProfileSyncedAt(LocalDateTime.now());
        customerMapper.updateById(customer);
    }

    private String publicAvatar(Customer customer) {
        if (Strings.isBlank(customer.getAvatar())) {
            return null;
        }
        return ossService.publicUrl(customer.getAvatar());
    }

    /** 局部更新的实体可能只带了部分字段，按"新值优先、旧值兜底"合成完整资料。 */
    private Customer merged(Customer before, Customer after) {
        Customer merged = new Customer();
        merged.setId(after.getId());
        merged.setNickname(firstNonNull(after.getNickname(), before.getNickname()));
        merged.setAvatar(firstNonNull(after.getAvatar(), before.getAvatar()));
        merged.setGender(after.getGender() != null ? after.getGender() : before.getGender());
        merged.setBirthday(after.getBirthday() != null ? after.getBirthday() : before.getBirthday());
        merged.setCrmProfileVersion(after.getCrmProfileVersion() != null
                ? after.getCrmProfileVersion() : before.getCrmProfileVersion());
        return merged;
    }

    private static String firstNonNull(String first, String second) {
        return Strings.isNotBlank(first) ? first : second;
    }

    /**
     * 资料四项 + 版本号。字段名与 CRM {@code PATCH /api/v1/brand-member/profile} 一致，
     * 手机号有意不在其中。
     */
    public static final class RemoteProfile {
        final long version;
        final String nickname;
        final String avatarUrl;
        final Integer gender;
        final LocalDate birthday;

        RemoteProfile(long version, String nickname, String avatarUrl, Integer gender, LocalDate birthday) {
            this.version = version;
            this.nickname = nickname;
            this.avatarUrl = avatarUrl;
            this.gender = gender;
            this.birthday = birthday;
        }

        static long versionOf(Long value) {
            return value == null ? 0L : value;
        }

        static RemoteProfile of(Customer customer) {
            return new RemoteProfile(versionOf(customer.getCrmProfileVersion()),
                    trimToNull(customer.getNickname()), customer.getAvatar(),
                    customer.getGender(), customer.getBirthday());
        }

        /**
         * 兼容 CRM 把资料放在 {@code member.profile} 或直接铺在 {@code member} 上两种返回；
         * 版本号同理会找 {@code profileVersion / version}。
         */
        static RemoteProfile parse(JsonNode node) {
            JsonNode member = node == null ? null : node.path("member");
            if (member == null || !member.isObject()) {
                return new RemoteProfile(0L, null, null, null, null);
            }
            JsonNode profile = member.path("profile").isObject() ? member.path("profile") : member;
            long version = firstLong(member.path("profileVersion"), profile.path("profileVersion"),
                    profile.path("version"));
            return new RemoteProfile(version,
                    trimToNull(text(profile, "nickname")),
                    blankToNull(text(profile, "avatarUrl", "avatar")),
                    integer(profile.path("gender")),
                    date(text(profile, "birthday")));
        }

        boolean hasProfile() {
            return nickname != null || avatarUrl != null || gender != null || birthday != null;
        }

        boolean sameProfile(RemoteProfile other) {
            return Objects.equals(nickname, other.nickname)
                    && Objects.equals(avatarUrl, other.avatarUrl)
                    && Objects.equals(gender, other.gender)
                    && Objects.equals(birthday, other.birthday);
        }

        /**
         * 只覆盖 CRM 给了值的字段：CRM 为空表示"没设"，不清掉本地已有资料。
         * 昵称例外：占位名只升不降（用户+号 → 会员+后四位 → 真名）。CRM 里的占位名
         * 不许盖掉本地真实昵称，也不许把本地「会员+后四位」降回「用户+号」，
         * 否则 CRM 还没回填完时打开个人中心，顾客自己起的名字会被冲掉。
         */
        boolean applyTo(Customer customer) {
            boolean changed = false;
            if (nickname != null && !nickname.equals(trimToNull(customer.getNickname()))
                    && nicknameRank(nickname) >= nicknameRank(customer.getNickname())) {
                customer.setNickname(nickname);
                changed = true;
            }
            if (avatarUrl != null && !avatarUrl.equals(customer.getAvatar())) {
                customer.setAvatar(avatarUrl);
                changed = true;
            }
            if (gender != null && !gender.equals(customer.getGender())) {
                customer.setGender(gender);
                changed = true;
            }
            if (birthday != null && !birthday.equals(customer.getBirthday())) {
                customer.setBirthday(birthday);
                changed = true;
            }
            if (version > versionOf(customer.getCrmProfileVersion())) {
                customer.setCrmProfileVersion(version);
                changed = true;
            }
            return changed;
        }

        String birthdayText() {
            return birthday == null ? null : birthday.toString();
        }

        private static String text(JsonNode node, String... names) {
            for (String name : names) {
                JsonNode value = node.path(name);
                if (value.isTextual() && Strings.isNotBlank(value.asText())) {
                    return value.asText().trim();
                }
            }
            return null;
        }

        private static long firstLong(JsonNode... nodes) {
            for (JsonNode node : nodes) {
                if (node.isNumber()) {
                    return node.asLong();
                }
                if (node.isTextual()) {
                    try {
                        return Long.parseLong(node.asText().trim());
                    } catch (NumberFormatException ignored) {
                        // 继续找下一个
                    }
                }
            }
            return 0L;
        }

        private static Integer integer(JsonNode node) {
            if (node.isNumber()) {
                return node.asInt();
            }
            if (node.isTextual()) {
                String raw = node.asText().trim();
                if ("1".equals(raw) || "MALE".equalsIgnoreCase(raw)) {
                    return 1;
                }
                if ("2".equals(raw) || "FEMALE".equalsIgnoreCase(raw)) {
                    return 2;
                }
            }
            return null;
        }

        private static LocalDate date(String raw) {
            if (raw == null) {
                return null;
            }
            // CRM 可能返回带时间的 ISO 串，只取日期部分
            String day = raw.length() > 10 ? raw.substring(0, 10) : raw;
            try {
                return LocalDate.parse(day);
            } catch (DateTimeParseException e) {
                return null;
            }
        }

        private static String trimToNull(String value) {
            if (value == null) {
                return null;
            }
            String trimmed = value.trim();
            return trimmed.isEmpty() ? null : trimmed;
        }

        private static String blankToNull(String value) {
            return Strings.isBlank(value) ? null : value;
        }
    }

    /**
     * 与 CRM 侧一致的占位名判定：空、「会员」、「会员+后四位」、各业务端历史默认昵称
     * 「用户+手机号/后四位」（含带国际区号落库成「用户+86…」的旧数据）、时叙旧默认名「茶客」。
     * 占位名只是没名字，不是顾客起的名字，不能拿它盖掉真实昵称。
     */
    static boolean isPlaceholderNickname(String nickname) {
        if (nickname == null) {
            return true;
        }
        String trimmed = nickname.trim();
        return trimmed.isEmpty() || "会员".equals(trimmed) || "茶客".equals(trimmed)
                || trimmed.matches("会员\\d{4}") || trimmed.matches("用户\\+?\\d{4,15}");
    }

    /**
     * 占位名的信息量，用来「只升不降」地收敛各端昵称：
     * 真名 3 &gt; 会员+后四位 2 &gt; 用户+号 1 &gt; 会员 / 茶客 / 空 0。
     * 各端默认昵称形状不同，谁的信息更多就留谁，避免最后一个登录的端把好名字冲掉，
     * 也避免本地「会员+后四位」被 CRM 里的旧形状「用户+号」降级。
     */
    static int nicknameRank(String nickname) {
        if (nickname == null) {
            return 0;
        }
        String trimmed = nickname.trim();
        if (trimmed.isEmpty()) {
            return 0;
        }
        if (!isPlaceholderNickname(trimmed)) {
            return 3;
        }
        if (trimmed.matches("会员\\d{4}")) {
            return 2;
        }
        return trimmed.matches("用户\\+?\\d{4,15}") ? 1 : 0;
    }
}