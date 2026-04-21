import re
import os

def restore_css():
    users_dir = 'C:\\Users'
    user_names = os.listdir(users_dir)
    # Find the user directory that contains '.gemini'
    target_user_dir = None
    for name in user_names:
        try:
            if os.path.isdir(os.path.join(users_dir, name, '.gemini')):
                target_user_dir = os.path.join(users_dir, name)
                break
        except Exception:
            pass

    if not target_user_dir:
        print("Could not find .gemini directory in C:\\Users")
        return

    conv_id = "267c4ce9-453f-423a-93ea-05ed64385d67"
    log_path = os.path.join(target_user_dir, '.gemini', 'antigravity', 'brain', conv_id, '.system_generated', 'logs', 'overview.txt')
    
    if not os.path.exists(log_path):
        print(f"File not found: {log_path}")
        return
        
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()

    matches = re.findall(r'Showing lines \d+ to \d+\nThe following code has been modified.*?\n((?:\d+: .*?\n)+)', text)

    lines_dict = {}
    for match in matches:
        for line in match.strip().split('\n'):
            if ':' in line:
                parts = line.split(':', 1)
                num_str = parts[0]
                content = parts[1]
                try:
                    num = int(num_str)
                    lines_dict[num] = content[1:] if content.startswith(' ') else content
                except ValueError:
                    pass

    if not lines_dict:
        print('Failed to find CSS lines')
    else:
        out_path = r'e:\tmp\paper-reader-helper\frontend\src\index.css'
        with open(out_path, 'w', encoding='utf-8') as out:
            for i in range(1, max(lines_dict.keys()) + 1):
                out.write(lines_dict.get(i, '') + '\n')
        print(f'Restored {max(lines_dict.keys())} lines to {out_path}')

if __name__ == '__main__':
    restore_css()
