import sqlite3
import re
import os

def inspect_markdown():
    db_path = os.path.join("data", "paper_reader.db")
    if not os.path.exists(db_path):
        print(f"DB not found at {db_path}")
        return
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT full_markdown FROM papercontent WHERE paper_id = 13")
    row = cursor.fetchone()
    if not row or not row[0]:
        print("No markdown.")
        return
        
    markdown = row[0]
    print(f"Length: {len(markdown)}")
    
    headers = re.findall(r'^(#+)\s+(.+)$', markdown, flags=re.MULTILINE)
    print("--- Headers ---\n")
    for i, (hashes, title) in enumerate(headers):
        print(f"{hashes} {title}")
        if i > 50: 
            print("...")
            break

if __name__ == "__main__":
    inspect_markdown()
