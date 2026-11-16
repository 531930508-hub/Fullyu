#!/usr/bin/env bash
# 备份守卫（fu-backup-check）：回答"昨天的备份到底跑完没有、到没到 OSS"
#   背景：2026-11-16 发现 presence/teahour 自 11-14 起日志只有 start 没有 done，
#         OSS 最后对象停在 11-13 —— 只看"目录里有文件"永远发现不了这种静默中断。
#   判定（只有 done + OSS 对象才算跑完）：
#     1) 最新日期目录存在，且 MANIFEST.txt 距今不超过 MAX_AGE_H 小时
#     2) 日志里最后一次 "backup start" 之后有 "done, size"（备份正在跑则本轮跳过）
#     3) 本地每个日期目录在 OSS 下都有对象（已确认过的日期打标记，不重复查）
#   告警：沿用 /etc/fullyu-alert.conf（ALERT_WEBHOOK_URL / ALERT_WEBHOOK_TYPE）
#         未配 webhook 只写 WOULD_ALERT 日志，故障照样留痕
#   去抖：状态翻转才发告警；持续异常记 STILL_BAD；恢复发"已恢复"
#   配置：/etc/fullyu/backup-check.conf，每行 name|base_dir|backup_log|oss_prefix|max_age_h
#   用法：fu-backup-check.sh [--test]
#         --test 打印每项结果到终端（不写日志），并（若配了 webhook）发一条测试告警
set -uo pipefail

CONF=${CONF:-/etc/fullyu/backup-check.conf}
LOG=${LOG:-/var/log/fu-backup-check.log}
STATE_DIR=${STATE_DIR:-/var/lib/fu-backup-check/state}
ALERT_CONF=${ALERT_CONF:-/etc/fullyu-alert.conf}
BUCKET=${BUCKET:-fullyu-backup-1433216673728394}
OSSUTIL=${OSSUTIL:-/usr/local/bin/ossutil}
OSSUTIL_CONF=${OSSUTIL_CONF:-/root/.ossutilconfig}
MAX_AGE_H=${MAX_AGE_H:-36}
KEEP_DAYS=${KEEP_DAYS:-7}

WEBHOOK_URL=''
WEBHOOK_TYPE=wecom
if [ -f "$ALERT_CONF" ]; then
  # shellcheck disable=SC1090
  . "$ALERT_CONF"
  WEBHOOK_URL=${ALERT_WEBHOOK_URL:-}
  WEBHOOK_TYPE=${ALERT_WEBHOOK_TYPE:-wecom}
fi
HOST=$(hostname -s)
TEST=0
[ "${1:-}" = "--test" ] && TEST=1

mkdir -p "$STATE_DIR" 2>/dev/null
exec 9>/var/lock/fu-backup-check.lock
flock -n 9 || exit 0
[ "$TEST" = 0 ] && exec >>"$LOG" 2>&1

ts() { date '+%F %T'; }
say() { echo "$(ts) [$HOST] $*"; }

send_alert() { # $1=标题 $2=内容
  [ -z "$WEBHOOK_URL" ] && { say "WOULD_ALERT $1 :: $2"; return 0; }
  local text payload
  text=$(printf '[%s] %s\n%s' "$HOST" "$1" "$2")
  case "$WEBHOOK_TYPE" in
    feishu)   payload=$(printf '{"msg_type":"text","content":{"text":"%s"}}' "$(printf '%s' "$text" | sed 's/"/\\"/g' | tr '\n' ' ')") ;;
    dingtalk) payload=$(printf '{"msgtype":"text","text":{"content":"%s"}}' "$(printf '%s' "$text" | sed 's/"/\\"/g' | tr '\n' ' ')") ;;
    *)        payload=$(printf '{"msgtype":"text","text":{"content":"%s"}}' "$(printf '%s' "$text" | sed 's/"/\\"/g' | tr '\n' ' ')") ;;
  esac
  curl -s -o /dev/null --max-time 8 -H 'Content-Type: application/json' -d "$payload" "$WEBHOOK_URL" \
    && say "ALERT_SENT $1" || say "ALERT_FAIL $1"
}

set_state() { # $1=name $2=bad(0/1) $3=detail
  local name=$1 bad=$2 detail=$3 sf="$STATE_DIR/$name" prev=OK
  [ -f "$sf" ] && prev=$(cat "$sf")
  if [ "$bad" = 0 ]; then
    echo OK > "$sf"
    if [ "$prev" = FAIL ]; then
      say "RECOVERED $name :: $detail"
      send_alert "备份已恢复：$name" "$detail"
    else
      say "OK $name :: $detail"
    fi
  else
    echo FAIL > "$sf"
    if [ "$prev" = FAIL ]; then
      say "STILL_BAD $name :: $detail"
    else
      say "FAIL $name :: $detail"
      send_alert "备份异常：$name" "$detail"
    fi
    return 1
  fi
}

check_one() { # name base logfile oss_prefix max_age_h
  local name=$1 base=$2 logfile=$3 prefix=$4 maxage=$5
  local bad=0 detail='' newest='' manifest age_h now lock n d mark miss=''

  # 备份正在跑：本轮直接跳过，别在 02:20~02:22 里误报
  lock="/var/lock/fu-backup-$name.lock"
  if [ -f "$lock" ] && ! flock -n "$lock" true 2>/dev/null; then
    say "$name IN_PROGRESS（$lock 被占用），本轮跳过"
    return 0
  fi

  now=$(date +%s)
  newest=$(find "$base" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' -printf '%f\n' 2>/dev/null | sort | tail -1)
  if [ -z "$newest" ]; then
    bad=1; detail="$base 下没有任何日期备份目录"
  else
    manifest="$base/$newest/MANIFEST.txt"
    if [ ! -s "$manifest" ]; then
      bad=1; detail="最新备份 $newest 缺 MANIFEST.txt"
    else
      age_h=$(( (now - $(stat -c %Y "$manifest")) / 3600 ))
      if [ "$age_h" -gt "$maxage" ]; then
        bad=1; detail="最新备份停在 $newest，MANIFEST 已 $age_h 小时（阈值 ${maxage}h）"
      fi
    fi

    # 日志：最后一次 start 之后必须出现 done
    if [ -r "$logfile" ]; then
      local sline dline sl_no dl_no started
      sline=$(grep -n 'backup start' "$logfile" 2>/dev/null | tail -1)
      if [ -n "$sline" ]; then
        dline=$(grep -n 'done, size' "$logfile" 2>/dev/null | tail -1)
        sl_no=${sline%%:*}; dl_no=${dline%%:*}
        started=$(printf '%s' "${sline#*:}" | grep -oE '20[0-9]{2}-[0-9]{2}-[0-9]{2}' | tail -1)
        if [ -z "$dline" ] || [ -z "${dl_no:-}" ] || [ "${dl_no:-0}" -lt "${sl_no:-0}" ]; then
          bad=1
          detail="${detail:+$detail；}最后一次启动（${started:-?}）没有 done —— 脚本中途退出了（看 $logfile 尾行）"
        elif [ -n "$started" ] && [ "$started" != "$newest" ]; then
          bad=1
          detail="${detail:+$detail；}日志最后启动的是 $started，最新目录却是 $newest"
        fi
      else
        say "$name LOG_NO_START（$logfile 里没有 start 行，可能被轮转过，跳过日志判定）"
      fi
    else
      say "$name LOG_MISSING（$logfile 读不到，跳过日志判定）"
    fi
  fi

  # OSS：本地每个日期都该在 OSS 有对象；确认过的日期打标记，之后不再查
  if [ -n "$newest" ] && [ -x "$OSSUTIL" ] && [ -f "$OSSUTIL_CONF" ]; then
    for d in $(find "$base" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' -printf '%f\n' 2>/dev/null | sort | tail -n "$KEEP_DAYS"); do
      mark="$STATE_DIR/oss-ok-$name-$d"
      [ -f "$mark" ] && continue
      if "$OSSUTIL" ls "oss://$BUCKET/$prefix/$d/" --config-file "$OSSUTIL_CONF" 2>/dev/null \
           | grep -q "oss://$BUCKET/$prefix/$d/"; then
        : > "$mark"
      else
        miss="$miss $d"
      fi
    done
    if [ -n "$miss" ]; then
      bad=1
      detail="${detail:+$detail；}OSS 缺日期:$miss（本地有、远端没有）"
    fi
    find "$STATE_DIR" -maxdepth 1 -name "oss-ok-$name-*" -mtime +10 -delete 2>/dev/null
  else
    say "$name OSS_SKIP（缺 $OSSUTIL 或 $OSSUTIL_CONF）"
  fi

  # 顺带盯一眼保留策略有没有失效（不告警，只记录）
  n=$(find "$base" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' 2>/dev/null | wc -l)
  [ "$n" -gt $((KEEP_DAYS + 3)) ] && say "$name WARN 本地日期目录 $n 份，超过保留 $KEEP_DAYS 份 + 3，prune 可能没跑"

  if [ "$bad" = 0 ]; then
    set_state "$name" 0 "最新 $newest，MANIFEST ${age_h:-?}h，done 与 OSS 齐"
  else
    set_state "$name" 1 "$detail"
    return 1
  fi
}

[ -f "$CONF" ] || { say "FATAL 缺少配置 $CONF"; exit 2; }

fail=0
while IFS='|' read -r name base logfile prefix maxage; do
  case "$name" in ''|\#*) continue ;; esac
  prefix=${prefix:-$name}
  maxage=${maxage:-$MAX_AGE_H}
  check_one "$name" "$base" "$logfile" "$prefix" "$maxage" || fail=1
done < "$CONF"

if [ "$TEST" = 1 ]; then
  say "TEST_MODE 完成，异常 $fail 条；webhook $([ -n "$WEBHOOK_URL" ] && echo 已配 || echo 未配)"
  [ -n "$WEBHOOK_URL" ] && send_alert "测试告警" "这是 $HOST 的备份守卫测试消息，收到即通道正常。"
fi

exit $([ "$fail" = 0 ] && echo 0 || echo 1)