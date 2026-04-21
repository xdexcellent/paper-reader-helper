import sqlite3
db_path = 'e:/tmp/paper-reader-helper/backend/data/paper_reader.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT full_markdown FROM papers WHERE full_markdown IS NOT NULL LIMIT 1")
row = cursor.fetchone()
if row:
    with open('markdown_dump.txt', 'w', encoding='utf-8') as f:
        f.write(row[0])
conn.close()
