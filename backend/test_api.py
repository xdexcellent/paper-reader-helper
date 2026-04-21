import httpx
import json

# Try with a very safe, academic prompt
print("=== Test: Academic paper summarization prompt ===")
resp = httpx.post(
    "https://api.753939.xyz/v1/chat/completions",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer sk-123456",
    },
    json={
        "model": "gpt-5.4-mini",
        "messages": [
            {"role": "user", "content": "Please respond with exactly: {\"greeting\": \"hello\"}"}
        ],
    },
    timeout=60,
)
data = resp.json()
msg = data["choices"][0]["message"]
print(f"Content: {repr(msg.get('content'))}")
print(f"Tokens used: {data.get('usage')}")
print()

# Try streaming to see if content comes through differently
print("=== Test: Streaming mode ===")
with httpx.stream(
    "POST",
    "https://api.753939.xyz/v1/chat/completions",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer sk-123456",
    },
    json={
        "model": "gpt-5.4-mini",
        "messages": [
            {"role": "user", "content": "Say exactly one word: hello"}
        ],
        "stream": True,
    },
    timeout=60,
) as stream_resp:
    print(f"Status: {stream_resp.status_code}")
    for line in stream_resp.iter_lines():
        if line.strip():
            print(f"  Chunk: {line[:300]}")
