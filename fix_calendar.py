# -*- coding: utf-8 -*-

# 读取文件
with open(r'f:\Studio\FlyNotes\src\public\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 修复日历导航按钮的箭头符号
fixes = [
    # 日历按钮箭头
    ("title='Previous month'>鈼?/button>", "title='Previous month'>◀</button>"),
    ("title='Next month'>鈻?/button>", "title='Next month'>▶</button>"),
    ('鈼?', '◀'),
    ('鈻?', '▶'),
]

count = 0
for old, new in fixes:
    if old in content:
        content = content.replace(old, new)
        count += 1
        print(f"修复: {repr(old)} -> {repr(new)}")

# 写回文件
with open(r'f:\Studio\FlyNotes\src\public\index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n总计修复 {count} 处日历按钮乱码")
