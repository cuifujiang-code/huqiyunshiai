#!/usr/bin/env python3
"""
DOCX 图片与公式渲染图提取器
================================
从 Word 文档中提取：
  1. MathType OLE 公式 → 关联的 WMF 渲染图 → Pillow 转 PNG → base64
  2. 普通插图（PNG/JPG/drawing）→ base64
  3. 建立占位符位置 → base64 映射表

用法:
  python docx_image_extractor.py <input.docx> [--output mapping.json]
  
输出 JSON 结构:
{
  "formulas": [
    {"index": 0, "wmf_name": "media/image52.wmf", "png_base64": "...", "width": 169, "height": 22}
  ],
  "images": [
    {"index": 0, "name": "media/image118.png", "base64": "...", "mime": "image/png"}
  ],
  "stats": {"formulas": 252, "images": 28, "wmf_converted": 194}
}

依赖: pip install Pillow
"""

import argparse
import base64
import json
import os
import re
import sys
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    from PIL import Image
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False
    print("[WARN] Pillow 未安装，WMF→PNG 转换不可用。请执行: pip install Pillow")
    print("[WARN] 将继续提取图片 base64，但 WMF 公式图将不会被转换。")


def wmf_to_png_base64(wmf_data: bytes) -> Optional[Dict]:
    """将 WMF 二进制数据转为 PNG base64"""
    if not HAS_PILLOW:
        return None
    try:
        # 写入临时文件（Pillow 的 WMF 支持需要文件路径）
        with tempfile.NamedTemporaryFile(suffix='.wmf', delete=False) as tmp:
            tmp.write(wmf_data)
            tmp_path = tmp.name
        
        try:
            img = Image.open(tmp_path)
            # 转为 PNG
            buf = BytesIO()
            img.save(buf, format='PNG')
            png_data = buf.getvalue()
            b64 = base64.b64encode(png_data).decode('ascii')
            return {
                'png_base64': b64,
                'width': img.width,
                'height': img.height,
                'png_size': len(png_data),
            }
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        return None


def extract_images_from_docx(docx_path: str) -> Dict:
    """
    从 docx 中提取所有图片和公式渲染图
    
    Returns:
        {
            'formulas': [...],   # 公式渲染图列表
            'images': [...],     # 普通插图列表
            'stats': {...}       # 统计信息
        }
    """
    if not os.path.exists(docx_path):
        raise FileNotFoundError(f"文件不存在: {docx_path}")
    
    formulas = []
    images = []
    stats = {'formulas': 0, 'images': 0, 'wmf_converted': 0, 'wmf_failed': 0}
    
    with zipfile.ZipFile(docx_path, 'r') as z:
        # ── 1. 读取 document.xml 建立 OLE 公式 → WMF 图片的映射 ──
        doc_xml = z.read('word/document.xml').decode('utf-8', errors='ignore')
        
        # 找到所有 OLE 对象块
        ole_blocks = re.findall(r'<w:object[\s\S]*?</w:object>', doc_xml)
        
        # 建立 OLE 对象 → imagedata rId 的映射
        ole_to_image_rid = {}  # OLE索引 → imagedata rId
        ole_to_ole_rid = {}    # OLE索引 → OLEObject rId
        
        for i, ole in enumerate(ole_blocks):
            img_match = re.search(r'imagedata r:id="(rId\d+)"', ole)
            ole_match = re.search(r'OLEObject[^>]*r:id="(rId\d+)"', ole)
            if img_match:
                ole_to_image_rid[i] = img_match.group(1)
            if ole_match:
                ole_to_ole_rid[i] = ole_match.group(1)
        
        # 读取 relationships 建立 rId → 文件路径映射
        try:
            rels_xml = z.read('word/_rels/document.xml.rels').decode('utf-8', errors='ignore')
        except KeyError:
            rels_xml = ''
        
        rid_to_target = {}
        for m in re.finditer(r'<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"[^>]*/>', rels_xml):
            rid_to_target[m.group(1)] = m.group(2)
        
        # 获取所有媒体文件
        all_media = {n: n for n in z.namelist() if 'media/' in n.lower()}
        
        # ── 2. 处理公式 (OLE 关联的 WMF) ──
        wmf_converted = 0
        wmf_failed = 0
        
        for ole_idx in sorted(ole_to_image_rid.keys()):
            img_rid = ole_to_image_rid[ole_idx]
            target = rid_to_target.get(img_rid, '')
            
            # 解析相对路径
            if target.startswith('media/'):
                media_path = f'word/{target}'
            else:
                media_path = f'word/media/{os.path.basename(target)}'
            
            # 尝试在 zip 中查找
            if media_path not in all_media:
                # 尝试模糊匹配
                basename = os.path.basename(target)
                candidates = [n for n in all_media if basename in n]
                if candidates:
                    media_path = candidates[0]
                else:
                    continue
            
            wmf_data = z.read(media_path)
            
            # WMF → PNG 转换
            if wmf_data[:4] == b'\xd7\xcd\xc6\x9a' or media_path.lower().endswith('.wmf'):
                png_info = wmf_to_png_base64(wmf_data)
                if png_info:
                    formulas.append({
                        'index': ole_idx,
                        'wmf_name': media_path,
                        'png_base64': png_info['png_base64'],
                        'width': png_info['width'],
                        'height': png_info['height'],
                    })
                    wmf_converted += 1
                else:
                    wmf_failed += 1
            elif media_path.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                # 公式也可能是直接嵌入的 PNG
                mime_map = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif'}
                ext = os.path.splitext(media_path)[1].lower()
                formulas.append({
                    'index': ole_idx,
                    'wmf_name': media_path,
                    'png_base64': base64.b64encode(wmf_data).decode('ascii'),
                    'width': 0,
                    'height': 0,
                })
                wmf_converted += 1
        
        stats['formulas'] = len(ole_blocks)
        stats['wmf_converted'] = wmf_converted
        stats['wmf_failed'] = wmf_failed
        
        # ── 3. 处理独立插图（非 OLE 关联的图片） ──
        # 找出不在 OLE 中的 w:drawing
        ole_ranges = [(m.start(), m.end()) for m in re.finditer(r'<w:object[\s\S]*?</w:object>', doc_xml)]
        
        def is_in_ole(pos: int) -> bool:
            return any(s <= pos <= e for s, e in ole_ranges)
        
        # 提取独立 w:drawing 的 rId
        standalone_drawing_rids = set()
        for m in re.finditer(r'<w:drawing[\s\S]*?</w:drawing>', doc_xml):
            if not is_in_ole(m.start()):
                # 提取其中的 rId
                rids = re.findall(r'r:embed="(rId\d+)"', m.group())
                standalone_drawing_rids.update(rids)
        
        # 提取 w:pict 中的独立图片（非 OLE）
        for m in re.finditer(r'<w:pict[\s\S]*?</w:pict>', doc_xml):
            if not is_in_ole(m.start()):
                rids = re.findall(r'r:id="(rId\d+)"', m.group())
                standalone_drawing_rids.update(rids)
        
        # 已处理的 OLE 关联图片 rId
        used_rids = set(ole_to_image_rid.values())
        
        # 独立图片
        img_idx = 0
        for rid in sorted(standalone_drawing_rids - used_rids):
            target = rid_to_target.get(rid, '')
            if not target:
                continue
            
            if target.startswith('media/'):
                media_path = f'word/{target}'
            else:
                media_path = f'word/media/{os.path.basename(target)}'
            
            if media_path not in all_media:
                continue
            
            img_data = z.read(media_path)
            ext = os.path.splitext(media_path)[1].lower()
            mime_map = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                        '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp'}
            mime = mime_map.get(ext, 'image/png')
            
            images.append({
                'index': img_idx,
                'name': media_path,
                'base64': base64.b64encode(img_data).decode('ascii'),
                'mime': mime,
                'size': len(img_data),
            })
            img_idx += 1
        
        stats['images'] = img_idx
    
    return {
        'formulas': formulas,
        'images': images,
        'stats': stats,
    }


def create_html_preview(extracted: Dict, output_path: str):
    """生成预览 HTML，直观展示提取结果"""
    formulas = extracted.get('formulas', [])
    images = extracted.get('images', [])
    stats = extracted.get('stats', {})
    
    html_parts = ['<!DOCTYPE html><html><head><meta charset="utf-8">',
                  '<title>DOCX 图片提取预览</title>',
                  '<style>body{font-family:system-ui;max-width:900px;margin:20px auto;padding:0 20px;',
                  'background:#1a1a2e;color:#e0e0e0}',
                  'h1,h2{color:#00d4ff}.card{background:#16213e;border-radius:12px;padding:16px;margin:12px 0}',
                  '.formula-img{display:inline-block;vertical-align:middle;margin:0 2px}',
                  '.stats{display:flex;gap:20px;flex-wrap:wrap}.stat{background:#0f3460;border-radius:8px;padding:12px 20px;text-align:center}',
                  '.stat-value{font-size:24px;font-weight:bold;color:#00d4ff}',
                  '.stat-label{font-size:12px;color:#8899aa}',
                  'img{max-width:100%;border-radius:4px}',
                  '</style></head><body>',
                  '<h1>DOCX 图片与公式提取预览</h1>']
    
    # 统计
    html_parts.append('<div class="stats">')
    for key, label in [('formulas', 'OLE公式'), ('wmf_converted', '公式图已转换'), 
                        ('wmf_failed', '转换失败'), ('images', '独立插图')]:
        val = stats.get(key, 0)
        html_parts.append(f'<div class="stat"><div class="stat-value">{val}</div><div class="stat-label">{label}</div></div>')
    html_parts.append('</div>')
    
    # 公式渲染图
    if formulas:
        html_parts.append(f'<h2>公式渲染图 ({len(formulas)} 个)</h2>')
        html_parts.append('<div class="card" style="line-height:2.5">')
        for f in formulas[:100]:  # 最多显示100个
            if f.get('png_base64'):
                w = f.get('width', 0)
                h = f.get('height', 0)
                style = f'width:{w}px;height:{h}px' if w and h else ''
                html_parts.append(
                    f'<img class="formula-img" src="data:image/png;base64,{f["png_base64"]}" '
                    f'alt="公式#{f["index"]}" title="公式#{f["index"]} ({f.get("wmf_name","")})" '
                    f'{style} />'
                )
        if len(formulas) > 100:
            html_parts.append(f'<p>... 还有 {len(formulas) - 100} 个公式未显示</p>')
        html_parts.append('</div>')
    
    # 独立插图
    if images:
        html_parts.append(f'<h2>独立插图 ({len(images)} 个)</h2>')
        for img in images:
            html_parts.append(
                f'<div class="card"><p style="margin:0 0 8px;font-size:13px;color:#8899aa">{img["name"]} '
                f'({img.get("size", 0)} bytes)</p>'
                f'<img src="data:{img["mime"]};base64,{img["base64"]}" alt="{img["name"]}" />'
                f'</div>'
            )
    
    html_parts.append('</body></html>')
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(html_parts))
    
    print(f'预览 HTML 已生成: {output_path}')


def main():
    parser = argparse.ArgumentParser(description='DOCX 图片与公式渲染图提取器')
    parser.add_argument('input', help='输入的 .docx 文件路径')
    parser.add_argument('--output', '-o', default=None, help='输出 JSON 文件路径（默认: 输入文件名_images.json）')
    parser.add_argument('--preview', '-p', action='store_true', help='生成预览 HTML')
    parser.add_argument('--formulas-only', action='store_true', help='仅提取公式渲染图')
    parser.add_argument('--images-only', action='store_true', help='仅提取独立插图')
    
    args = parser.parse_args()
    
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"错误: 文件不存在: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    if not input_path.suffix.lower() == '.docx':
        print(f"错误: 仅支持 .docx 文件", file=sys.stderr)
        sys.exit(1)
    
    print(f"正在处理: {input_path.name}")
    print(f"文件大小: {input_path.stat().st_size / 1024:.1f} KB")
    
    extracted = extract_images_from_docx(str(input_path))
    stats = extracted['stats']
    
    print(f"\n提取结果:")
    print(f"  OLE 公式对象: {stats.get('formulas', 0)}")
    print(f"  WMF→PNG 转换成功: {stats.get('wmf_converted', 0)}")
    print(f"  WMF→PNG 转换失败: {stats.get('wmf_failed', 0)}")
    print(f"  独立插图: {stats.get('images', 0)}")
    
    # 计算 base64 总大小
    total_formula_b64 = sum(len(f.get('png_base64', '')) for f in extracted.get('formulas', []))
    total_image_b64 = sum(len(img.get('base64', '')) for img in extracted.get('images', []))
    print(f"  公式图 base64 总大小: {total_formula_b64 / 1024:.1f} KB")
    print(f"  插图 base64 总大小: {total_image_b64 / 1024:.1f} KB")
    
    # 输出 JSON
    output_path = args.output or str(input_path.with_suffix('')) + '_images.json'
    
    # 过滤
    if args.formulas_only:
        extracted.pop('images', None)
    if args.images_only:
        extracted.pop('formulas', None)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(extracted, f, ensure_ascii=False, indent=2)
    
    print(f"\n映射文件已保存: {output_path}")
    
    # 生成预览
    if args.preview:
        preview_path = str(input_path.with_suffix('')) + '_preview.html'
        create_html_preview(extracted, preview_path)
    
    print("\n完成!")


if __name__ == '__main__':
    main()
