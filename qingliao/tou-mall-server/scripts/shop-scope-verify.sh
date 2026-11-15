#!/usr/bin/env bash
# 门店数据权限越权回归脚本
#
# 用法：
#   BASE=https://test-api.example.com TOKEN_BOSS=xxx TOKEN_MANAGER=yyy \
#   SHOP_ALLOWED=12 SHOP_FORBIDDEN=34 ORDER_ID=999 \
#   ./scripts/shop-scope-verify.sh
#
# 说明：
#   TOKEN_BOSS     全局角色（如 总助/运营）的 token
#   TOKEN_MANAGER  受限门店店长的 token（其授权门店为 SHOP_ALLOWED）
#   SHOP_FORBIDDEN 该店长无权访问的门店 id
#   ORDER_ID       门店 SHOP_FORBIDDEN 下的一笔订单 id
#
# 退出码非 0 表示存在越权。

set -u

BASE="${BASE:?请设置 BASE}"
TOKEN_BOSS="${TOKEN_BOSS:?请设置 TOKEN_BOSS}"
TOKEN_MANAGER="${TOKEN_MANAGER:?请设置 TOKEN_MANAGER}"
SHOP_ALLOWED="${SHOP_ALLOWED:?请设置 SHOP_ALLOWED}"
SHOP_FORBIDDEN="${SHOP_FORBIDDEN:?请设置 SHOP_FORBIDDEN}"
ORDER_ID="${ORDER_ID:?请设置 ORDER_ID}"

PASS=0
FAIL=0

# assert_blocked <描述> <期望状态码> <curl 参数...>
assert_blocked() {
  local desc="$1"; shift
  local expect="$1"; shift
  local code
  code=$(curl -s -o /tmp/shop_scope_body -w '%{http_code}' "$@")
  local body
  body=$(head -c 200 /tmp/shop_scope_body)
  if [[ "$code" == "$expect" ]] || echo "$body" | grep -q "无权"; then
    echo "  PASS  $desc (http=$code)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $desc (期望 $expect 或『无权』，实际 http=$code body=$body)"
    FAIL=$((FAIL + 1))
  fi
}

# assert_ok <描述> <curl 参数...>
assert_ok() {
  local desc="$1"; shift
  local code
  code=$(curl -s -o /tmp/shop_scope_body -w '%{http_code}' "$@")
  if [[ "$code" == "200" ]]; then
    echo "  PASS  $desc (http=$code)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $desc (期望 200，实际 http=$code body=$(head -c 200 /tmp/shop_scope_body))"
    FAIL=$((FAIL + 1))
  fi
}

H_BOSS=(-H "Authorization: Bearer $TOKEN_BOSS")
H_MGR=(-H "Authorization: Bearer $TOKEN_MANAGER")

echo "== L1 入参越界 =="
assert_blocked "店长按他店 shopId 查订单列表" 200 -G "$BASE/order/page" "${H_MGR[@]}" -d "shopId=$SHOP_FORBIDDEN"
assert_blocked "店长按他店 shopId 查首页看板" 200 -G "$BASE/adminTodo/panel" "${H_MGR[@]}" -d "shopId=$SHOP_FORBIDDEN"

echo "== L3 按 id 越权（IDOR） =="
assert_blocked "店长直接打开他店订单详情" 200 -G "$BASE/order/info" "${H_MGR[@]}" -d "id=$ORDER_ID"

echo "== L4 门店字典 =="
echo "  说明：/shop/authorized 返回中不得包含 $SHOP_FORBIDDEN"
if curl -s -G "$BASE/shop/authorized" "${H_MGR[@]}" | grep -q "\"id\":$SHOP_FORBIDDEN[,}]"; then
  echo "  FAIL  店长门店字典包含他店 $SHOP_FORBIDDEN"
  FAIL=$((FAIL + 1))
else
  echo "  PASS  店长门店字典已收敛"
  PASS=$((PASS + 1))
fi

echo "== 正向：授权门店可正常访问 =="
assert_ok "店长查本店订单列表" -G "$BASE/order/page" "${H_MGR[@]}" -d "shopId=$SHOP_ALLOWED"
assert_ok "全局角色查任意门店订单列表" -G "$BASE/order/page" "${H_BOSS[@]}" -d "shopId=$SHOP_FORBIDDEN"

echo
echo "结果：PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]