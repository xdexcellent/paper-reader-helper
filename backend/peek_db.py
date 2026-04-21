import sqlite3
import os

db_path = 'e:/tmp/paper-reader-helper/backend/data/paper_reader.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print('Tables:', tables)

for table in tables:
    name = table[0]
    cursor.execute(f"SELECT * FROM {name} LIMIT 1")
    cols = [d[0] for d in cursor.description]
    print(f'Table {name} columns:', cols)
    
    if 'full_markdown' in cols:
        cursor.execute(f"SELECT full_markdown FROM {name} WHERE full_markdown IS NOT NULL LIMIT 1")
        row = cursor.fetchone()
        if row:
            with open('markdown_peek.txt', 'w', encoding='utf-8') as f:
                f.write(row[0])
            print('Written full_markdown to markdown_peek.txt')
conn.close()
