#!/usr/bin/env python3
"""
DOCX 图片与公式渲染图提取器 v2
================================
从 Word 文档中提取：
  1. MathType OLE 公式 → 关联的 WMF 渲染图 → Pillow 转 PNG → base64
  2. 普通插图（PNG/JPG/drawing）→ base64
  3. 建立占位符位置 → base64 映射表

新增功能（v2）：
  - 批量处理支持（通配符/目录）
  - 缓存机制（跳过已处理的文件）
  - 可选压缩输出（gzip）
  - 进度条显示
  - 支持更多图片格式（webp, svg, emf）

用法:
  # 单文件
  python docx_image_extractor_v2.py input.docx

  # 批量处理目录
  python docx_image_extractor_v2.py "E:/华祺云师AI资料库/高中数学/**/*.docx" --batch

  # 仅提取公式（跳过图片）
  python docx_image_extractor_v2.py input.docx --formulas-only

  # 带进度条 + 缓存
  python docx_image_extractor_v2.py dir/ --batch --cache-dir ./cache

输出 JSON 结构:
{
  "source": "input.docx",
  "formulas": [
    {"index": 0, "png_base64": "...", "width": 169, "height": 22}
  ],
  "images": [
    {"index": 0, "name": "media/image1.png", "base64": "...", "mime": "image/png"}
  ],
  "stats": {"formulas": 252, "images": 28, "wmf_converted": 194, "skipped": 0}
}

依赖: pip install Pillow tqdm
"""

import argparse
import base64
import gzip
import hashlib
import json
import os
import re
import sys
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

try:
    from PIL import Image
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False
    print("[WARN] Pillow 未安装，WMF→PNG 转换不可用。请执行: pip install Pillow")
    print("[WARN] 将继续提取图片 base64，但 WMF 公式图将不会被转换。")

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

# ─── 常量 ─────────────────────────────────────────────────
SUPPORTED_MIME = {
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.bmp':  'image/bmp',
    '.webp': 'image/webp',
    '.svg':  'image/svg+xml',
    '.emf':  'image/emf',
    '.wmf':  'image/x-wmf',
}

LLM_FRIENDLY_MIME = {'image/png', 'image/jpeg', 'image/gif', 'image/webp'}


# ─── WMF → PNG ──────────────────────────────────────────
def wmf_to_png_base64(wmf_data: bytes) -> Optional[Dict]:
    """将 WMF 二进制数据转为 PNG base64"""
    if not HAS_PILLOW:
        return None
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.wmf', delete=False) as tmp:
            tmp.write(wmf_data)
            tmp_path = tmp.name
        img = Image.open(tmp_path)
        buf = BytesIO()
        img.save(buf, format='PNG')
        png_data = buf.getvalue()
        return {
            'png_base64': base64.b64encode(png_data).decode('ascii'),
            'width': img.width,
            'height': img.height,
            'png_size': len(png_data),
        }
    except Exception:
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ─── 核心提取逻辑 ────────────────────────────────────────
def extract_images_from_docx(
    docx_path: str,
    *,
    formulas_only: bool = False,
    images_only: bool = False,
) -> Dict:
    """
    从 docx 中提取所有图片和公式渲染图。

    Returns:
        {
            'formulas': [...],   # 公式渲染图列表
            'images': [...],     # 普通插图列表
            'stats': {...}        # 统计信息
        }
    """
    if not os.path.exists(docx_path):
        raise FileNotFoundError(f"文件不存在: {docx_path}")

    formulas: List[Dict] = []
    images: List[Dict] = []
    stats = {'formulas': 0, 'images': 0, 'wmf_converted': 0, 'wmf_failed': 0}

    with zipfile.ZipFile(docx_path, 'r') as z:
        # ── 1. 读取 document.xml 建立 OLE 公式 → WMF 图片的映射 ──
        try:
            doc_xml = z.read('word/document.xml').decode('utf-8', errors='ignore')
        except KeyError:
            return {'formulas': [], 'images': [], 'stats': stats}

        # 找到所有 OLE 对象块
        ole_blocks = re.findall(r'<w:object[\s\S]*?</w:object>', doc_xml)

        # 建立 OLE 对象 → imagedata rId 的映射
        ole_to_image_rid: Dict[int, str] = {}
        ole_to_ole_rid: Dict[int, str] = {}

        for i, ole in enumerate(ole_blocks):
            img_match = re.search(r'imagedata r:id="(rId\d+)"', ole)
            ole_match = re.search(r'OLEObject[^>]*r:id="(rId\d+)"', ole)
            if img_match:
                ole_to_image_rid[i] = img_match.group(1)
            if ole_match:
                ole_to_ole_rid[i] = ole_match.group(1)

        # 读取 relationships 建立 rId → 文件路径映射
        rels_xml = ''
        try:
            rels_xml = z.read('word/_rels/document.xml.rels').decode('utf-8', errors='ignore')
        except KeyError:
            pass

        rid_to_target: Dict[str, str] = {}
        for m in re.finditer(r'<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"', rels_xml):
            rid_to_target[m.group(1)] = m.group(2)

        # 获取所有媒体文件
        all_media: Set[str] = {n for n in z.namelist() if 'media/' in n.lower()}

        # ── 2. 处理公式 (OLE 关联的 WMF) ──
        if not images_only:
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
                    basename = os.path.basename(target)
                    candidates = [n for n in all_media if basename in n]
                    if candidates:
                        media_path = candidates[0]
                    else:
                        continue

                try:
                    wmf_data = z.read(media_path)
                except KeyError:
                    continue

                # WMF → PNG 转换
                lower_path = media_path.lower()
                is_wmf = wmf_data[:4] == b'\xd7\xcd\xc6\x9a' or lower_path.endswith('.wmf') or lower_path.endswith('.emf')

                if is_wmf:
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
                elif any(lower_path.endswith(ext) for ext in SUPPORTED_MIME):
                    # 公式也可能是直接嵌入的 PNG/JPG
                    ext = os.path.splitext(lower_path)[1].lower()
                    mime = SUPPORTED_MIME.get(ext, 'image/png')
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
        if not formulas_only:
            # 找出不在 OLE 中的 w:drawing / w:pict
            ole_ranges: List[Tuple[int, int]] = [
                (m.start(), m.end()) for m in re.finditer(r'<w:object[\s\S]*?</w:object>', doc_xml)
            ]

            def is_in_ole(pos: int) -> bool:
                return any(s <= pos <= e for s, e in ole_ranges)

            # 提取独立 w:drawing 的 rId
            standalone_drawing_rids: Set[str] = set()
            for m in re.finditer(r'<w:drawing[\s\S]*?</w:drawing>', doc_xml):
                if not is_in_ole(m.start()):
                    rids = re.findall(r'r:embed="(rId\d+)"', m.group())
                    standalone_drawing_rids.update(rids)

            # 提取 w:pict 中的独立图片（非 OLE）
            for m in re.finditer(r'<w:pict[\s\S]*?</w:pict>', doc_xml):
                if not is_in_ole(m.start()):
                    rids = re.findall(r'r:id="(rId\d+)"', m.group())
                    standalone_drawing_rids.update(rids)

            # 已处理的 OLE 关联图片 rId
            used_rids: Set[str] = set(ole_to_image_rid.values())

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

                try:
                    img_data = z.read(media_path)
                except KeyError:
                    continue

                ext = os.path.splitext(media_path)[1].lower()
                mime = SUPPORTED_MIME.get(ext, 'image/png')

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


# ─── 缓存机制 ──────────────────────────────────────────────
def _file_md5(filepath: str) -> str:
    """计算文件 MD5（用于缓存 key）"""
    h = hashlib.md5()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest()


def load_cache(cache_dir: str) -> Dict:
    """加载缓存"""
    cache_file = os.path.join(cache_dir, 'docx_extractor_cache.json')
    if os.path.exists(cache_file):
        with open(cache_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_cache(cache_dir: str, cache: Dict):
    """保存缓存"""
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, 'docx_extractor_cache.json')
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def is_cache_valid(cache: Dict, filepath: str) -> bool:
    """检查缓存是否有效（文件未变动）"""
    key = _file_md5(filepath)
    entry = cache.get(key)
    if not entry:
        return False
    # 检查文件修改时间
    try:
        return os.path.getmtime(filepath) <= entry.get('mtime', 0)
    except OSError:
        return False


def save_to_cache(cache: Dict, filepath: str, result: Dict):
    """将结果存入缓存"""
    key = _file_md5(filepath)
    cache[key] = {
        'mtime': os.path.getmtime(filepath),
        'result': result,
        'source': os.path.basename(filepath),
    }


# ─── 批量处理 ──────────────────────────────────────────────
def batch_extract(
    file_patterns: List[str],
    *,
    output_dir: str = '.',
    formulas_only: bool = False,
    images_only: bool = False,
    use_cache: bool = False,
    cache_dir: str = './.docx_cache',
    compress: bool = False,
    show_progress: bool = True,
) -> Dict[str, Dict]:
    """
    批量提取多个 DOCX 文件的图片。

    Returns:
        {文件路径: 提取结果} 的字典
    """
    # 收集所有匹配的文件
    all_files: List[str] = []
    for pattern in file_patterns:
        matched = list(Path('.').glob(pattern)) if '*' in pattern or '?' in pattern else [Path(pattern)]
        for p in matched:
            if p.is_file() and p.suffix.lower() == '.docx':
                all_files.append(str(p.resolve()))

    if not all_files:
        print("警告: 未找到任何 .docx 文件")
        return {}

    print(f"找到 {len(all_files)} 个 .docx 文件")

    # 加载缓存
    cache = load_cache(cache_dir) if use_cache else {}
    results: Dict[str, Dict] = {}
    skipped = 0

    # 进度条
    file_iter = tqdm(all_files, desc='处理文件', unit='file') if HAS_TQDM and show_progress else all_files

    for filepath in file_iter:
        if use_cache and is_cache_valid(cache, filepath):
            if HAS_TQDM and show_progress:
                file_iter.set_postfix({'status': 'cached'})
            skipped += 1
            continue

        if HAS_TQDM and show_progress:
            file_iter.set_postfix({'status': 'processing...', 'file': os.path.basename(filepath)[:20]})

        try:
            result = extract_images_from_docx(
                filepath,
                formulas_only=formulas_only,
                images_only=images_only,
            )
            results[filepath] = result

            # 保存缓存
            if use_cache:
                save_to_cache(cache, filepath, result)

        except Exception as e:
            print(f"\n错误: 处理 {filepath} 失败: {e}")
            results[filepath] = {'error': str(e), 'formulas': [], 'images': [], 'stats': {}}

    # 保存缓存
    if use_cache:
        save_cache(cache_dir, cache)

    # 输出汇总
    total_formulas = sum(r.get('stats', {}).get('formulas', 0) for r in results.values() if 'error' not in r)
    total_images = sum(r.get('stats', {}).get('images', 0) for r in results.values() if 'error' not in r)
    print(f"\n批量处理完成:")
    print(f"  处理文件: {len(results)}")
    print(f"  跳过缓存: {skipped}")
    print(f"  总公式数: {total_formulas}")
    print(f"  总图片数: {total_images}")

    # 保存汇总报告
    summary_path = os.path.join(output_dir, 'batch_extract_summary.json')
    summary = {
        'total_files': len(results) + skipped,
        'processed': len(results),
        'skipped': skipped,
        'total_formulas': total_formulas,
        'total_images': total_images,
        'results': {os.path.basename(k): {
            'formulas': v.get('stats', {}).get('formulas', 0),
            'images': v.get('stats', {}).get('images', 0),
            'wmf_converted': v.get('stats', {}).get('wmf_converted', 0),
        } for k, v in results.items()}
    }
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"  汇总报告: {summary_path}")

    return results


# ─── HTML 预览 ────────────────────────────────────────────
def create_html_preview(extracted: Dict, output_path: str):
    """生成预览 HTML，直观展示提取结果"""
    formulas = extracted.get('formulas', [])
    images = extracted.get('images', [])
    stats = extracted.get('stats', {})

    html_parts = [
        '<!DOCTYPE html><html><head><meta charset="utf-8">',
        '<title>DOCX 图片提取预览</title>',
        '<style>',
        'body{font-family:system-ui,sans-serif;max-width:900px;margin:20px auto;padding:0 20px;',
        'background:#1a1a2e;color:#e0e0e0;line-height:1.6}',
        'h1,h2{color:#00d4ff;margin-top:24px}',
        '.card{background:#16213e;border-radius:12px;padding:16px;margin:12px 0}',
        '.formula-img{display:inline-block;vertical-align:middle;margin:0 2px}',
        '.stats{display:flex;gap:20px;flex-wrap:wrap;margin:16px 0}',
        '.stat{background:#0f3460;border-radius:8px;padding:12px 20px;text-align:center}',
        '.stat-value{font-size:24px;font-weight:bold;color:#00d4ff}',
        '.stat-label{font-size:12px;color:#8899aa}',
        'img{max-width:100%;border-radius:4px;margin:4px 0}',
        '.summary{background:#0f3460;border-radius:8px;padding:16px;margin:12px 0}',
        '</style></head><body>',
        '<h1>DOCX 图片与公式提取预览</h1>',
    ]

    # 统计
    html_parts.append('<div class="stats">')
    for key, label in [('formulas', 'OLE公式'), ('wmf_converted', '公式图已转换'),
                      ('wmf_failed', '转换失败'), ('images', '独立插图')]:
        val = stats.get(key, 0)
        html_parts.append(f'<div class="stat"><div class="stat-value">{val}</div>'
                        f'<div class="stat-label">{label}</div></div>')
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
                f'<div class="card"><p style="margin:0 0 8px;font-size:13px;color:#8899aa">'
                f'{img["name"]} ({img.get("size", 0)} bytes)</p>'
                f'<img src="data:{img["mime"]};base64,{img["base64"]}" alt="{img["name"]}" />'
                f'</div>'
            )

    html_parts.append('</body></html>')

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(html_parts))

    print(f'预览 HTML 已生成: {output_path}')


# ─── 主程序 ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='DOCX 图片与公式渲染图提取器 v2',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 单文件提取
  %(prog)s input.docx

  # 批量处理目录（递归）
  %(prog)s "E:/华祺云师AI资料库/高中数学/**/*.docx" --batch

  # 批量处理 + 缓存 + 压缩
  %(prog)s ./docs/ --batch --cache-dir ./cache --compress

  # 仅提取公式
  %(prog)s input.docx --formulas-only
""")
    parser.add_argument('input', nargs='+', help='输入的 .docx 文件或通配符模式')
    parser.add_argument('--output', '-o', default=None,
                        help='输出 JSON 文件路径（单文件模式）或输出目录（批量模式，默认当前目录）')
    parser.add_argument('--preview', '-p', action='store_true',
                        help='生成预览 HTML')
    parser.add_argument('--formulas-only', action='store_true',
                        help='仅提取公式渲染图（跳过独立插图）')
    parser.add_argument('--images-only', action='store_true',
                        help='仅提取独立插图（跳公式）')
    parser.add_argument('--batch', '-b', action='store_true',
                        help='批量处理模式（支持通配符）')
    parser.add_argument('--cache-dir', default='./.docx_cache',
                        help='缓存目录（默认 ./.docx_cache）')
    parser.add_argument('--no-cache', action='store_true',
                        help='不使用缓存（强制重新处理）')
    parser.add_argument('--compress', '-z', action='store_true',
                        help='压缩输出（gzip，减少 ~70%% 大小）')
    parser.add_argument('--no-progress', action='store_true',
                        help='不显示进度条')

    args = parser.parse_args()

    # 检查依赖
    if not HAS_PILLOW:
        print("警告: 未安装 Pillow，WMF 公式图将无法转换为 PNG")
        print("  建议执行: pip install Pillow")
        resp = input("是否继续？(y/N): ")
        if resp.lower() != 'y':
            sys.exit(1)

    # ── 批量模式 ──
    if args.batch or len(args.input) > 1 or any('*' in p or '?' in p for p in args.input):
        results = batch_extract(
            args.input,
            output_dir=args.output or '.',
            formulas_only=args.formulas_only,
            images_only=args.images_only,
            use_cache=not args.no_cache,
            cache_dir=args.cache_dir,
            compress=args.compress,
            show_progress=not args.no_progress,
        )

        # 为每个文件保存单独的 JSON
        output_dir = args.output or '.'
        os.makedirs(output_dir, exist_ok=True)
        for filepath, result in results.items():
            if 'error' in result:
                continue
            base = os.path.splitext(os.path.basename(filepath))[0]
            out_path = os.path.join(output_dir, f'{base}_images.json')

            # 过滤
            if args.formulas_only:
                result.pop('images', None)
            if args.images_only:
                result.pop('formulas', None)

            data = json.dumps(result, ensure_ascii=False, indent=2)

            if args.compress:
                gz_path = out_path + '.gz'
                with gzip.open(gz_path, 'wt', encoding='utf-8') as f:
                    f.write(data)
                print(f'已保存（压缩）: {gz_path} ({os.path.getsize(gz_path) / 1024:.1f} KB)')
            else:
                with open(out_path, 'w', encoding='utf-8') as f:
                    f.write(data)
                print(f'已保存: {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB)')

        print("\n✅ 批量处理完成！")
        return

    # ── 单文件模式 ──
    input_path = Path(args.input[0])
    if not input_path.exists():
        print(f"错误: 文件不存在: {args.input[0]}", file=sys.stderr)
        sys.exit(1)

    print(f"正在处理: {input_path.name}")
    print(f"文件大小: {input_path.stat().st_size / 1024:.1f} KB")

    extracted = extract_images_from_docx(
        str(input_path),
        formulas_only=args.formulas_only,
        images_only=args.images_only,
    )
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

    data = json.dumps(extracted, ensure_ascii=False, indent=2)

    if args.compress:
        gz_path = output_path + '.gz'
        with gzip.open(gz_path, 'wt', encoding='utf-8') as f:
            f.write(data)
        print(f"\n映射文件已保存（压缩）: {gz_path} ({os.path.getsize(gz_path) / 1024:.1f} KB)")
    else:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(data)
        print(f"\n映射文件已保存: {output_path} ({os.path.getsize(output_path) / 1024:.1f} KB)")

    # 生成预览
    if args.preview:
        preview_path = str(input_path.with_suffix('')) + '_preview.html'
        create_html_preview(extracted, preview_path)

    print("\n完成!")


if __name__ == '__main__':
    main()
