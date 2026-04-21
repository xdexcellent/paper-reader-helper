import sqlite3
db_path = 'e:/tmp/paper-reader-helper/backend/data/paper_reader.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT full_markdown FROM papers WHERE full_markdown IS NOT NULL")
rows = cursor.fetchall()
found = False
for row in rows:
    lines = row[0].split('\n')
    for line in lines:
        if '![' in line:
            print(line.strip())
            found = True
if not found:
    print('No images found in markdown.')
conn.close()
