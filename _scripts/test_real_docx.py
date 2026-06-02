#!/usr/bin/env python3
"""测试后端自动提取：上传真实 DOCX，不传 imagesJson"""
import json, time, urllib.request, base64, sys

BASE_URL = "https://api.huqiyunshiai.online"
TEACHER_ID = "e2e-real-docx"

# 读取真实 DOCX 文件
docx_path = r"E:\华祺云师AI资料库\高中数学\高一\上学期\01_试卷\高一_上学期_三角函数_三角函数_试卷_v1.docx"
with open(docx_path, 'rb') as f:
    docx_b64 = base64.b64encode(f.read()).decode()

print(f"DOCX base64 长度: {len(docx_b64)}")

# 上传（不传 imagesJson！）
payload = json.dumps({
    "teacherId": TEACHER_ID,
    "examFileBase64": docx_b64,
    "examFileName": "三角函数试卷_真实DOCX测试.docx",
    "subject": "数学",
    "grade": "高一",
    "autoStart": True,
}).encode()

req = urllib.request.Request(f"{BASE_URL}/api/batch/upload", data=payload,
    headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req)
result = json.loads(resp.read())
print(f"上传结果: {json.dumps(result, ensure_ascii=False, indent=2)[:500]}")
batch_id = result.get("batchId")
if not batch_id:
    print("❌ 无 batchId")
    sys.exit(1)

# 轮询
print(f"\n轮询进度 batchId={batch_id}...")
for i in range(60):
    time.sleep(10)
    resp = urllib.request.urlopen(f"{BASE_URL}/api/batch/progress?batchId={batch_id}&teacherId={TEACHER_ID}&withQuestions=true")
    data = json.loads(resp.read())
    status = data.get("progress", {}).get("status", "unknown")
    qs = data.get("questions", [])
    print(f"[{i+1}] status={status}, questions={len(qs)}")
    if status == "completed" and qs:
        # 检查第一道题
        q = qs[0]
        c = q.get("content", "")
        print(f"\n✅ 任务完成!")
        print(f"题目数: {len(qs)}")
        print(f"content 含 <img>: {'<img' in c}")
        print(f"content 含 【公式】: {'【公式】' in c}")
        print(f"content 含 image/: {'image/' in c}")
        # 统计 img 标签
        import re
        imgs = re.findall(r'<img[^>]*>', c)
        print(f"img 标签数: {len(imgs)}")
        if imgs:
            print(f"第一个 img: {imgs[0][:200]}")
        break
    if i >= 59:
        print("❌ 超时")
