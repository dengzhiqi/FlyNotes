# -*- coding: utf-8 -*-

# 读取文件
with open(r'f:\Studio\FlyNotes\src\public\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 修复Files页面的emoji图标
fixes = [
    # Files页面标签的emoji
    ('馃彏锔?Images', '🖼️ Images'),
    ('馃幀 Videos', '🎬 Videos'),
    ('馃搫 Files', '📎 Files'),
    
    # 可能的其他emoji乱码
    ('馃搫', '📎'),
    ('馃彏锔?', '🖼️'),
    ('馃幀', '🎬'),
    ('鉁?', '✓'),
    ('鈻?', '▶'),
]

count = 0
for old, new in fixes:
    if old in content:
        content = content.replace(old, new)
        count += 1
        print(f"修复: {old} -> {new}")

# 写回文件
with open(r'f:\Studio\FlyNotes\src\public\index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n总计修复 {count} 处emoji乱码")
