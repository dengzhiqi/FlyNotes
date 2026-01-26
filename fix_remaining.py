# -*- coding: utf-8 -*-

# 读取文件
with open(r'f:\Studio\FlyNotes\src\public\index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 修复特定行的乱码
fixes_by_line = {
    362: ('/* 鍝嶅簲寮忚璁★細鍦ㄥ皬灞忓箷涓婇殣钘忎晶杈规爮 */', '/* 响应式设计:在小屏幕上隐藏侧边栏 */'),
    373: ('/* 鍦ㄥ灞忔ā寮忎笅锛屽鏋滃彸渚ф爮瀛樺湪锛屽垯涓棿鏍忎緷鐒跺彈闄?*/', '/* 在宽屏模式下,如果右侧栏存在,则中间栏依然受限 */'),
}

# 应用行级修复
for line_num, (old, new) in fixes_by_line.items():
    if line_num < len(lines) and old in lines[line_num]:
        lines[line_num] = lines[line_num].replace(old, new)
        print(f"修复第 {line_num + 1} 行")

# 写回文件
with open(r'f:\Studio\FlyNotes\src\public\index.html', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("完成!")
