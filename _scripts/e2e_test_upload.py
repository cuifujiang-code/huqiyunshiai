#!/usr/bin/env python3
"""
端到端测试：DOCX 上传 → 拆题 → 预览验证
用 Python 调用生产 API，验证公式/图片自动渲染流程
"""
import json
import sys
import time
import urllib.request
import urllib.error

BASE_URL = "https://api.huqiyunshiai.online"
TEACHER_ID = "e2e-test-user"
POLL_INTERVAL = 5
MAX_POLL_TIME = 300


def log(step, msg, data=None):
    ts = time.strftime("%H:%M:%S")
    extra = f" {json.dumps(data, ensure_ascii=False)[:200]}" if data else ""
    print(f"[{ts}] [{step}] {msg}{extra}")


def api_call(method, endpoint, body=None):
    url = f"{BASE_URL}{endpoint}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def main():
    images_json_path = sys.argv[1] if len(sys.argv) > 1 else None
    if not images_json_path:
        print("用法: python e2e_test_upload.py <imagesJson文件路径>")
        sys.exit(1)

    # Step 1: 读取 imagesJson
    log("STEP1", f"读取 imagesJson: {images_json_path}")
    with open(images_json_path, "r", encoding="utf-8") as f:
        images_json = json.load(f)
    
    formulas = images_json.get("formulas", [])
    images = images_json.get("images", [])
    stats = images_json.get("stats", {})
    log("STEP1", "读取完成", {
        "formulas": len(formulas),
        "images": len(images),
        "stats": stats,
    })

    if not formulas:
        print("❌ imagesJson 中没有 formulas 数据")
        sys.exit(1)

    # 计算 imagesJson 大小
    json_str = json.dumps(images_json, ensure_ascii=False)
    json_size_kb = len(json_str.encode()) / 1024
    log("STEP1", f"imagesJson 大小: {json_size_kb:.1f} KB")

    # Step 2: 构造测试文本（含公式占位符）
    log("STEP2", "构造测试文本...")
    lines = []
    for i in range(1, 6):
        lines.append(f"{i}. 已知函数【公式】，求【公式】的值。")
        lines.append(f"A. 【公式】 B. 【公式】 C. 【公式】 D. 【公式】")
        lines.append("")
    raw_text = "\n".join(lines)
    formula_count = raw_text.count("【公式】")
    log("STEP2", f"测试文本构造完成: {len(raw_text)} 字符, {formula_count} 个公式占位符")

    # Step 3: 上传
    log("STEP3", "调用 upload API...")
    upload_body = {
        "teacherId": TEACHER_ID,
        "subject": "数学",
        "grade": "高一",
        "rawText": raw_text,
        "examFileName": "e2e_test_formula_render.txt",
        "autoStart": True,
        "imagesJson": images_json,
    }
    status, result = api_call("POST", "/api/batch/upload", upload_body)
    
    if not result.get("success"):
        print(f"❌ 上传失败 (HTTP {status}):", json.dumps(result, ensure_ascii=False, indent=2)[:500])
        sys.exit(1)

    batch_id = result["batchId"]
    log("STEP3", f"✅ 上传成功 batchId={batch_id}", {
        "chunkCount": result.get("chunkCount"),
        "autoStarted": result.get("autoStarted"),
        "status": result.get("status"),
    })

    # Step 4: 轮询进度
    log("STEP4", "开始轮询进度...")
    start_time = time.time()
    final_result = None

    while time.time() - start_time < MAX_POLL_TIME:
        time.sleep(POLL_INTERVAL)
        _, p = api_call("GET", f"/api/batch/progress?batchId={batch_id}&teacherId={TEACHER_ID}")
        
        log("STEP4", f"进度: {p.get('status', 'unknown')}", {
            "completed": p.get("completedItems", 0),
            "total": p.get("totalItems", 0),
            "failed": p.get("failedItems", 0),
            "pending": p.get("pendingItems", 0),
            "realCount": p.get("realCount"),
        })

        if p.get("status") in ("completed", "failed", "partial"):
            final_result = p
            break

    if not final_result:
        print("❌ 超时：任务未在5分钟内完成")
        sys.exit(1)

    log("STEP4", f"最终状态: {final_result['status']}", {
        "realCount": final_result.get("realCount"),
        "totalItems": final_result.get("totalItems"),
    })

    # Step 5: 拉取题目验证
    log("STEP5", "拉取题目验证公式/图片渲染...")
    
    # 查询题目
    _, bank_result = api_call("POST", "/api/batch/query", {
        "batchId": batch_id,
        "teacherId": TEACHER_ID,
    })

    questions = bank_result.get("questions", [])
    log("STEP5", f"拉取到 {len(questions)} 道题目")

    # ========== 验证报告 ==========
    print("\n" + "=" * 60)
    print("  端到端测试报告")
    print("=" * 60)
    print(f"  批次ID:    {batch_id}")
    print(f"  状态:      {final_result['status']}")
    print(f"  题目数:    {final_result.get('realCount', 'N/A')}")
    print(f"  公式数:    {len(formulas)}")
    print(f"  图片数:    {len(images)}")
    
    # 检查渲染结果
    has_img = False
    has_formula_placeholder = False
    img_count = 0
    formula_remain_count = 0

    for q in questions:
        content = q.get("content", "")
        if "<img" in content:
            has_img = True
            img_count += content.count("<img")
        if "【公式】" in content:
            has_formula_placeholder = True
            formula_remain_count += content.count("【公式】")

    print(f"  含<img>标签: {'✅ 是' if has_img else '❌ 否'} (共 {img_count} 个)")
    print(f"  残留【公式】: {'❌ 有' if has_formula_placeholder else '✅ 无'} (共 {formula_remain_count} 个)")

    passed = has_img and not has_formula_placeholder
    print(f"  测试结果:  {'✅ 通过' if passed else '❌ 未通过'}")
    print("=" * 60)

    # 输出示例
    if questions:
        sample = questions[0]
        content = sample.get("content", "")
        print(f"\n📝 示例题目 content (前300字):")
        print(content[:300])
        print(f"\n🔍 包含 <img> 标签: {'是' if '<img' in content else '否'}")
        print(f"🔍 包含 【公式】残留: {'是' if '【公式】' in content else '否'}")

    print("\n✅ 端到端测试完成！")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
