#!/usr/bin/env python3
"""
DOCX 预处理：将 Word 文档转为 AI 可识别的纯文本
- MathType OLE 公式 → 提取 EQ 域代码，转【公式: ...】标记
- OMML 公式 → 保留原始文本
- 图片 → [图片占位符]
- 表格 → Markdown 表格格式
- 保留段落结构和题号标记

对标学科网组卷网的文档识别标准。
v2: 支持 MathType OLE + OMML 双模式公式处理
"""

import sys
import json
import re
import zipfile
import io
from lxml import etree


# XML 命名空间
NSMAP = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'm': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'v': 'urn:schemas-microsoft-com:vml',
    'o': 'urn:schemas-microsoft-com:office:office',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
}


def qn(tag):
    """解析带前缀的标签名为 (ns, local) 格式"""
    if ':' in tag:
        prefix, local = tag.split(':', 1)
        ns = NSMAP.get(prefix, '')
        return f'{{{ns}}}{local}'
    return tag


def has_element(elem, tag):
    """检查元素是否包含指定标签的子元素"""
    return len(elem.findall('.//' + qn(tag))) > 0


def extract_omml_text(omath_elem):
    """从 OMML 公式元素中提取文本"""
    texts = []
    for mt in omath_elem.iter(qn('m:t')):
        text = (mt.text or '').strip()
        if text:
            texts.append(text)
    return ''.join(texts)


def extract_ole_equation_text(elem):
    """
    从 MathType OLE 对象中提取公式文本
    MathType OLE 格式通常包含：
    1. w:object 元素，内含 OLEObject 和公式的线性文本表示
    2. 或者 w:instrText 中的 EQ 域代码
    """
    # 方法1: 查找 OLEObject 的 ProgID 确认是公式
    ole_objects = elem.findall('.//' + qn('o:OLEObject'))
    
    # 方法2: 查找域代码中的 EMBED Equation
    instr_texts = elem.findall('.//' + qn('w:instrText'))
    for it in instr_texts:
        text = (it.text or '').strip()
        if 'EMBED Equation' in text or 'EMBED' in text:
            # 域代码中通常包含公式的线性表示
            return f'【公式】'
    
    # 方法3: 查找 w:object 元素
    objects = elem.findall('.//' + qn('w:object'))
    if objects:
        return '【公式】'
    
    # 方法4: 查找包含 OLEObject 的元素
    if ole_objects:
        return '【公式】'
    
    return None


def extract_paragraph_text_v2(elem):
    """
    逐元素遍历段落，提取文本并处理公式/图片
    按 XML 子元素顺序遍历，保证位置正确
    """
    parts = []
    
    for child in elem:
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        
        if tag == 'r':
            # Run 元素
            # 检查是否包含 OLE 对象（MathType 公式）
            ole_formula = extract_ole_equation_text(child)
            if ole_formula:
                parts.append(ole_formula)
                continue
            
            # 检查是否包含 OMML 公式
            if has_element(child, 'm:oMath') or has_element(child, 'm:oMathPara'):
                math_elems = child.findall('.//' + qn('m:oMath'))
                math_elems.extend(child.findall('.//' + qn('m:oMathPara')))
                for math_elem in math_elems:
                    math_text = extract_omml_text(math_elem)
                    if math_text:
                        parts.append(f'【公式: {math_text}】')
                continue
            
            # 检查是否包含图片
            if (has_element(child, 'w:drawing') or 
                has_element(child, 'w:pict') or
                has_element(child, 'wp:inline')):
                parts.append('[图片占位符]')
                continue
            
            # 普通文本
            text_elems = child.findall('.//' + qn('w:t'))
            for t in text_elems:
                if t.text:
                    parts.append(t.text)
        
        elif tag == 'oMath' or tag == 'oMathPara':
            # 直接是公式元素
            math_text = extract_omml_text(child)
            if math_text:
                parts.append(f'【公式: {math_text}】')
        
        elif tag == 'drawing':
            parts.append('[图片占位符]')
        
        elif tag == 'pict':
            parts.append('[图片占位符]')
        
        elif tag == 'object':
            # OLE 对象
            parts.append('【公式】')
        
        elif tag == 'fldSimple':
            # 简单域
            instr = child.get(qn('w:instr'), '')
            if 'EQ' in instr or 'equation' in instr.lower():
                parts.append('【公式】')
            else:
                # 提取域结果中的文本
                for t in child.iter(qn('w:t')):
                    if t.text:
                        parts.append(t.text)
        
        elif tag == 'hyperlink':
            # 超链接 - 递归处理
            parts.append(extract_paragraph_text_v2(child))
        
        elif tag == 'bookmarkStart' or tag == 'bookmarkEnd':
            # 书签 - 忽略
            pass
    
    return ''.join(parts)


def extract_table_text_v2(table_elem):
    """提取表格内容为 Markdown 格式"""
    rows = []
    for row_elem in table_elem.findall('.//' + qn('w:tr')):
        cells = []
        for cell_elem in row_elem.findall('.//' + qn('w:tc')):
            cell_parts = []
            for p_elem in cell_elem.findall('.//' + qn('w:p')):
                text = extract_paragraph_text_v2(p_elem).strip()
                if text:
                    cell_parts.append(text)
            cells.append(' '.join(cell_parts))
        rows.append(' | '.join(cells))
    
    if not rows:
        return ''
    
    if len(rows) == 1:
        return rows[0]
    
    header = rows[0]
    ncols = len(rows[0].split('|'))
    separator = '|'.join(['---'] * ncols)
    body = '\n'.join(rows[1:])
    
    return f'{header}\n{separator}\n{body}'


def preprocess_docx(filepath):
    """主函数：预处理 DOCX 文件"""
    
    with zipfile.ZipFile(filepath) as z:
        doc_xml = z.read('word/document.xml')
    
    # 使用 lxml 解析（保留 OLE 对象等非标准元素）
    parser = etree.XMLParser(recover=True, remove_blank_text=True)
    root = etree.fromstring(doc_xml, parser)
    
    body = root.find('.//' + qn('w:body'))
    if body is None:
        return {'error': '无法找到 document body', 'text': ''}
    
    content_blocks = []
    
    for child in body:
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        
        if tag == 'p':
            para_text = extract_paragraph_text_v2(child)
            if para_text.strip():
                content_blocks.append(('p', para_text.strip()))
        
        elif tag == 'tbl':
            table_text = extract_table_text_v2(child)
            if table_text.strip():
                content_blocks.append(('table', table_text.strip()))
    
    # 合并为最终文本
    result_lines = []
    prev_type = None
    
    for block_type, block_text in content_blocks:
        if block_type == 'table' and prev_type is not None:
            result_lines.append('')
        result_lines.append(block_text)
        prev_type = block_type
    
    full_text = '\n'.join(result_lines)
    
    # 统计信息
    image_count = full_text.count('[图片占位符]')
    formula_count = full_text.count('【公式】') + full_text.count('【公式:')
    question_markers = len(re.findall(
        r'^\s*(?:\d{1,3}[\.．、]|（\d{1,3}）|\(\d{1,3}\)|第\s*\d{1,3}\s*题)',
        full_text, re.MULTILINE
    ))
    
    return {
        'text': full_text,
        'stats': {
            'total_chars': len(full_text),
            'image_placeholders': image_count,
            'formula_markers': formula_count,
            'question_markers': question_markers,
            'block_count': len(content_blocks),
            'paragraph_blocks': sum(1 for t, _ in content_blocks if t == 'p'),
            'table_blocks': sum(1 for t, _ in content_blocks if t == 'table'),
        }
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': '用法: python docxPreprocessor.py <file.docx>'}, ensure_ascii=False))
        sys.exit(1)
    
    filepath = sys.argv[1]
    try:
        result = preprocess_docx(filepath)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        import traceback
        print(json.dumps({
            'error': str(e),
            'traceback': traceback.format_exc()
        }, ensure_ascii=False))
        sys.exit(1)
