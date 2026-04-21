import httpx
import re
import sys

def inspect():
    try:
        resp = httpx.get("http://localhost:8000/papers/13")
        resp.raise_for_status()
        data = resp.json()
        markdown = data.get("full_markdown", "")
        if not markdown:
            print("No markdown returned.")
            return

        print(f"Length: {len(markdown)}")
        headers = re.findall(r'^(#+)\s+(.+)$', markdown, flags=re.MULTILINE)
        print("--- Headers ---\n")
        for i, (hashes, title) in enumerate(headers):
            print(f"{hashes} {title}")
            if i > 30: 
                print("...")
                break
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect()
