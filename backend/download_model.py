import os
import sys

# 设置国内环境变量
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"

try:
    from huggingface_hub import snapshot_download
except ImportError:
    print("Please install huggingface_hub")
    sys.exit(1)

print("Starting download of BAAI/bge-m3 directly to E:\\Models\\bge-m3...")
print("This may take a few minutes as the model is ~2.2GB.")

try:
    path = snapshot_download(
        repo_id="BAAI/bge-m3",
        local_dir=r"E:\Models\bge-m3",
        ignore_patterns=["*.DS_Store", "imgs/*", "onnx/*", "*.md", "*.jpg", "*.png"],
        max_workers=4
    )
    print("\nDownload complete! Files saved to:", path)
except Exception as e:
    print("\nDownload failed:", str(e))
    sys.exit(1)
