import shutil
from pathlib import Path
from typing import BinaryIO
from urllib.parse import quote
from uuid import uuid4

from app.core.config import settings


class StorageService:
    def __init__(self, root: str | None = None) -> None:
        self.root = Path(root or settings.effective_storage_root)
        self.root.mkdir(parents=True, exist_ok=True)

    def import_pdf(self, src_path: str) -> str:
        src = Path(src_path)
        if not src.is_file():
            raise FileNotFoundError(src_path)

        papers_dir = self.root / "papers"
        target_dir = papers_dir / uuid4().hex
        target = target_dir / src.name

        try:
            target_dir.mkdir(parents=True, exist_ok=False)
            shutil.copy2(src, target)
        except Exception:
            shutil.rmtree(target_dir, ignore_errors=True)
            raise

        return str(target)

    def import_uploaded_pdf(self, filename: str, file_obj: BinaryIO) -> str:
        safe_filename = Path(filename).name or "uploaded.pdf"
        if not safe_filename.lower().endswith(".pdf"):
            raise ValueError("仅支持 PDF 文件")

        papers_dir = self.root / "papers"
        target_dir = papers_dir / uuid4().hex
        target = target_dir / safe_filename

        try:
            target_dir.mkdir(parents=True, exist_ok=False)
            file_obj.seek(0)
            with target.open("wb") as target_file:
                shutil.copyfileobj(file_obj, target_file)
        except Exception:
            shutil.rmtree(target_dir, ignore_errors=True)
            raise

        return str(target)


def storage_file_url(
    path: str | None,
    root: str | None = None,
    base_url: str | None = None,
) -> str:
    if not path:
        return ""

    storage_root = Path(root or settings.effective_storage_root).resolve()
    try:
        local = Path(path).resolve()
        relative = local.relative_to(storage_root)
    except (OSError, ValueError):
        return ""

    encoded_path = "/".join(quote(part, safe="") for part in relative.parts)
    return f"{(base_url or settings.server_base_url).rstrip('/')}/files/{encoded_path}"
