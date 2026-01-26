import codecs

# 读取文件
with open(r'f:\Studio\FlyNotes\src\public\index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 修复第6972行 (索引6971)
lines[6971] = "\t\tconst url = prompt('请输入图片链接(URL):', 'https://');\r\n"

# 写回文件
with open(r'f:\Studio\FlyNotes\src\public\index.html', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("已修复图片链接提示文本")
