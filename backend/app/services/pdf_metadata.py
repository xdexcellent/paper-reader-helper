import re
from pathlib import Path


def extract_title_from_pdf(pdf_path: str, fallback_name: str | None = None) -> str:
    """
    为了避免某些学术论文 PDF 内部乱码元数据导致标题识别错误，
    这里直接统一使用文件名作为标题，保证 100% 不乱码。
    """
    path = Path(pdf_path)
    return fallback_name or path.stem
