"""Zotero source file handling: validate, copy to temp, open read-only, cleanup."""

import hashlib
import shutil
import sqlite3
import tempfile
from pathlib import Path


class ZoteroSourceService:
    """安全地处理 Zotero SQLite 源文件：验证、临时复制、只读打开、清理。"""

    SQLITE_HEADER = b"SQLite format 3\x00"

    def validate_source(self, source_path: str) -> dict:
        """验证 Zotero 源文件路径。

        返回 {"valid": bool, "fingerprint": str|None, "error": str|None}
        """
        path = Path(source_path)

        if not path.exists():
            return {
                "valid": False,
                "fingerprint": None,
                "error": "文件不存在，请检查路径",
            }

        if path.is_dir():
            return {
                "valid": False,
                "fingerprint": None,
                "error": "路径指向目录，请提供 .sqlite 文件路径",
            }

        if not path.is_file():
            return {
                "valid": False,
                "fingerprint": None,
                "error": "路径不是有效的文件",
            }

        # 检查文件可读性
        try:
            with path.open("rb") as f:
                header = f.read(len(self.SQLITE_HEADER))
        except (OSError, PermissionError):
            return {
                "valid": False,
                "fingerprint": None,
                "error": "文件不可读，请检查权限",
            }

        # 检查 SQLite 头
        if header != self.SQLITE_HEADER:
            return {
                "valid": False,
                "fingerprint": None,
                "error": "不是有效的 SQLite 文件（文件头不匹配）",
            }

        # 计算 SHA256 指纹（使用规范化路径）
        fingerprint = self._compute_fingerprint(str(path.resolve()))

        # 额外检查：尝试打开验证 SQLite schema
        try:
            conn = sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True)
            conn.execute("SELECT count(*) FROM sqlite_master")
            conn.close()
        except sqlite3.Error as e:
            return {
                "valid": False,
                "fingerprint": None,
                "error": f"SQLite 文件无法打开: {e}",
            }

        return {"valid": True, "fingerprint": fingerprint, "error": None}

    def create_temp_copy(self, source_path: str) -> Path:
        """将 Zotero 数据库复制到临时工作目录。

        返回临时副本的 Path。
        """
        src = Path(source_path)
        if not src.is_file():
            raise FileNotFoundError(f"Source file not found: {source_path}")

        temp_dir = Path(tempfile.mkdtemp(prefix="zotero_import_"))
        dest = temp_dir / "zotero_copy.sqlite"
        shutil.copy2(src, dest)
        return dest

    def open_read_only(self, db_path: Path) -> sqlite3.Connection:
        """以只读模式打开 SQLite 数据库连接。

        使用 URI 模式 + mode=ro 确保只读，防止意外写入。
        """
        resolved = db_path.resolve()
        return sqlite3.connect(f"file:{resolved}?mode=ro", uri=True)

    def cleanup_temp_copy(self, db_path: Path) -> None:
        """清理临时数据库副本文件及其父目录。"""
        path = Path(db_path)
        if path.exists() and path.is_file():
            path.unlink(missing_ok=True)

        parent = path.parent
        if parent.exists() and parent != Path(tempfile.gettempdir()):
            try:
                # 仅当目录为空时删除
                parent.rmdir()
            except OSError:
                pass  # 目录非空则不删除

    def _compute_fingerprint(self, resolved_path: str) -> str:
        """计算源文件路径的 SHA256 指纹。"""
        return hashlib.sha256(resolved_path.encode("utf-8")).hexdigest()
