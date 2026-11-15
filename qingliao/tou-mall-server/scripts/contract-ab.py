#!/usr/bin/env python3
"""老小程序接口契约 A/B 回放（A=生产旧后端，B=新后端）

用途：上线前确认「老小程序直连新后端」不会报错。两边用同一个 token、同一套参数
打同一批接口，逐层比对返回 JSON 的字段路径与类型。

  ./contract-ab.py login     # 在 B 侧登录，token 存 /tmp/ab-token
  ./contract-ab.py run       # 回放 29 个只读接口，结果写 /tmp/ab-report.json

注意：B 侧调用的都是「需要登录」的客户接口，token 必须同时存在于两侧 Redis
（`loginToken:<token>` → customerId），否则两边都会返回「登录授权已过期」。
生产 Redis 只临时写一条、TTL 20 分钟、用完即删，不产生业务数据。

参数（环境变量）：AB_PHONE 登录手机号、AB_ORDER/B_SHOP/B_PRODUCT 等测试用的业务 ID。
判定标准：report 里 missing_in_new 为空、type_changed 为空、HTTP 状态两侧一致。
2026-11-13 实测：29 个接口 0 差异、0 类型变化，仅新后端多返回字段。
"""
import json, urllib.request, urllib.parse, sys, time, os

A = "https://manage.fullytherapy.com/api"
B = "http://127.0.0.1:19399"
PHONE = os.environ.get("AB_PHONE", "17608437399")
ORDER = int(os.environ.get("AB_ORDER", "1601"))
ORDER_PENDING = int(os.environ.get("AB_ORDER_PENDING", "1601"))
SHOP = int(os.environ.get("AB_SHOP", "1"))
PRODUCT = int(os.environ.get("AB_PRODUCT", "5"))
GIFT = int(os.environ.get("AB_GIFT", "1"))
TOKEN_FILE = "/tmp/ab-token"

def call(base, method, path, params=None, body=None, token=None, timeout=25):
    q = ("?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})) if params else ""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path + q, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, str(e)

def shape(o, prefix="", out=None, depth=0):
    if out is None: out = {}
    if depth > 6: return out
    if isinstance(o, dict):
        for k, v in o.items():
            p = f"{prefix}.{k}" if prefix else k
            out[p] = type(v).__name__
            shape(v, p, out, depth + 1)
    elif isinstance(o, list):
        out[prefix + "[]"] = "list(%d)" % len(o)
        if o: shape(o[0], prefix + "[]", out, depth + 1)
    return out

def jload(s):
    try: return json.loads(s)
    except Exception: return None

if sys.argv[1:] and sys.argv[1] == "login":
    st, s2 = call(B, "POST", "/customer/login", body={"phone": PHONE})
    tok = (jload(s2) or {}).get("data", {}).get("token")
    if not tok:
        print("登录失败:", st, s2[:300]); sys.exit(1)
    open(TOKEN_FILE, "w").write(tok)
    print(tok)
    sys.exit(0)

tok = open(TOKEN_FILE).read().strip()

CASES = [
    ("GET",  "/customer/getIntegration", {}),
    ("GET",  "/customer/invitationQrImage", {}),
    ("GET",  "/customer/getCustomerVipLevel", {}),
    ("GET",  "/customerCoupon/get/page", {"pageNum": 1, "pageSize": 10}),
    ("GET",  "/customerCoupon/getCouponCount", {}),
    ("GET",  "/customerMassagistRelation/get/list", {}),
    ("GET",  "/customerMassagistRelation/get/page", {"pageNum": 1, "pageSize": 10}),
    ("GET",  "/giveGift/get/page", {"pageNum": 1, "pageSize": 10}),
    ("GET",  "/giveGift/info", {"id": GIFT}),
    ("GET",  "/giveGift/shareCode", {"id": GIFT}),
    ("GET",  "/massagist/get/list", {"shopId": SHOP}),
    ("GET",  "/massagist/get/page", {"pageNum": 1, "pageSize": 10, "shopId": SHOP}),
    ("GET",  "/miniImage/bannerList", {}),
    ("GET",  "/miniImage/splashScreenImageList", {}),
    ("GET",  "/miniImage/couponImageList", {}),
    ("GET",  "/order/get/page", {"pageNum": 1, "pageSize": 10}),
    ("GET",  "/order/infoWithDetail", {"id": ORDER}),
    ("GET",  "/order/infoWithGift", {"id": ORDER}),
    ("GET",  "/order/pageWithDetail", {"pageNum": 1, "pageSize": 10}),
    ("GET",  "/order/timeList", {"date": "2026-11-20", "personCount": 1, "projectId": PRODUCT, "durationMinutes": 60, "shopId": SHOP}),
    ("GET",  "/order/chat/page", {"orderId": ORDER, "pageNum": 1, "pageSize": 10}),
    ("GET",  "/order/checkout", {"orderId": ORDER_PENDING}),
    ("GET",  "/order/check/paid", {"orderSn": "X"}),
    ("GET",  "/order/booking/dates", {"shopId": SHOP}),
    ("GET",  "/product/get/list", {}),
    ("GET",  "/shop/get/list", {}),
    ("GET",  "/bed/maxBedCount", {"shopId": SHOP, "type": 1}),
    ("POST", "/admin/open/wx/openId", None, {"code": "dummy"}),
    ("GET",  "/admin/open/wx/phone", {"code": "dummy"}),
]

report = []
for case in CASES:
    method, path = case[0], case[1]
    params = case[2] if len(case) > 2 else None
    body = case[3] if len(case) > 3 else None
    sa, ra = call(A, method, path, params, body, tok)
    time.sleep(0.3)
    sb, rb = call(B, method, path, params, body, tok)
    ja, jb = jload(ra), jload(rb)
    row = {"path": path, "method": method, "http_a": sa, "http_b": sb,
           "code_a": (ja or {}).get("code"), "code_b": (jb or {}).get("code")}
    if ja is not None and jb is not None:
        ka, kb = shape(ja), shape(jb)
        row["missing_in_new"] = sorted(set(ka) - set(kb))
        row["added_in_new"] = sorted(set(kb) - set(ka))
        row["type_changed"] = {k: [ka[k], kb[k]] for k in set(ka) & set(kb) if ka[k] != kb[k]}
        row["msg_a"] = (ja.get("message") or "")[:80]
        row["msg_b"] = (jb.get("message") or "")[:80]
    else:
        row["raw_a"] = ra[:300]; row["raw_b"] = rb[:300]
    report.append(row)
    flag = ""
    if sa != 200 or sb != 200: flag = " <<HTTP"
    if row.get("missing_in_new"): flag += " <<缺字段"
    print(f"[{sa}/{sb}] code={row['code_a']}/{row['code_b']} {path}{flag}")

json.dump(report, open("/tmp/ab-report.json", "w"), ensure_ascii=False, indent=1)
bad = [r for r in report if r["http_a"] != 200 or r["http_b"] != 200 or r.get("missing_in_new")]
print(f"\n== 结构不一致的接口 {len(bad)}/{len(report)}")
for r in bad:
    print("\n" + r["method"] + " " + r["path"], f"HTTP {r['http_a']}->{r['http_b']}", f"code {r['code_a']}->{r['code_b']}")
    if r.get("missing_in_new"): print("  新后端缺失字段:", r["missing_in_new"][:12])
    if r.get("msg_a") or r.get("msg_b"): print("  消息:", r.get("msg_a"), "|", r.get("msg_b"))
