"""ZoteroSourceService 单元测试。"""

import shutil
import sqlite3
from pathlib import Path

import pytest

from app.services.zotero_source_service import ZoteroSourceService


@pytest.fixture
def service():
    return ZoteroSourceService()


def _create_valid_sqlite(db_path: Path) -> None:
    """创建一个有效的 SQLite 数据库文件。"""
    conn = sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO test (name) VALUES ('hello')")
    conn.commit()
    conn.close()


class TestValidateSource:
    """validate_source 方法测试。"""

    def test_valid_sqlite_file(self, service, tmp_path):
        """验证有效的 SQLite 文件。"""
        db_path = tmp_path / "zotero.sqlite"
        _create_valid_sqlite(db_path)

        result = service.validate_source(str(db_path))
        assert result["valid"] is True
        assert result["fingerprint"] is not None
        assert len(result["fingerprint"]) == 64  # SHA256 hex
        assert result["error"] is None

    def test_missing_path(self, service, tmp_path):
        """验证不存在的路径。"""
        result = service.validate_source(str(tmp_path / "nonexistent.sqlite"))
        assert result["valid"] is False
        assert result["fingerprint"] is None
        assert "不存在" in result["error"]

    def test_directory_path(self, service, tmp_path):
        """验证目录路径（不是文件）。"""
        dir_path = tmp_path / "mydir"
        dir_path.mkdir()
        # 目录上不能直接 write，但 validate_source 应该识别
        result = service.validate_source(str(dir_path))
        assert result["valid"] is False
        assert result["fingerprint"] is None
        assert "目录" in result["error"]

    def test_non_sqlite_file(self, service, tmp_path):
        """验证非 SQLite 文件（普通文本文件）。"""
        txt_path = tmp_path / "not_sqlite.txt"
        txt_path.write_text("This is not a SQLite file", encoding="utf-8")

        result = service.validate_source(str(txt_path))
        assert result["valid"] is False
        assert result["fingerprint"] is None
        assert "SQLite" in result["error"]

    def test_unreadable_file(self, service, tmp_path, monkeypatch):
        """验证不可读文件（模拟权限问题）。"""
        db_path = tmp_path / "locked.sqlite"
        _create_valid_sqlite(db_path)

        # 模拟：无法读取文件
        original_open = Path.open

        def _mock_open(_, mode="r", **__):
            if "b" in mode:
                raise PermissionError("模拟权限错误")
            return original_open(_, mode, **__)

        monkeypatch.setattr(Path, "open", _mock_open)

        result = service.validate_source(str(db_path))
        assert result["valid"] is False
        assert "不可读" in result["error"]

    def test_empty_file(self, service, tmp_path):
        """验证空文件（无 SQLite 头）。"""
        empty_path = tmp_path / "empty.sqlite"
        empty_path.write_bytes(b"")

        result = service.validate_source(str(empty_path))
        assert result["valid"] is False
        assert "SQLite" in result["error"]


class TestCreateTempCopy:
    """create_temp_copy 方法测试。"""

    def test_creates_copy_in_temp_dir(self, service, tmp_path):
        """验证在临时目录创建副本。"""
        db_path = tmp_path / "zotero.sqlite"
        _create_valid_sqlite(db_path)

        copy_path = service.create_temp_copy(str(db_path))
        assert copy_path.exists()
        assert copy_path.is_file()
        assert "zotero_import_" in str(copy_path)

        # 验证内容一致
        with db_path.open("rb") as f:
            original_content = f.read()
        with copy_path.open("rb") as f:
            copy_content = f.read()
        assert original_content == copy_content

    def test_raises_on_missing_source(self, service, tmp_path):
        """验证源文件不存在时抛出异常。"""
        with pytest.raises(FileNotFoundError):
            service.create_temp_copy(str(tmp_path / "nonexistent.sqlite"))

    def test_copy_is_separate_from_original(self, service, tmp_path):
        """验证副本与原始文件独立（修改副本不影响原始文件）。"""
        db_path = tmp_path / "zotero.sqlite"
        _create_valid_sqlite(db_path)

        copy_path = service.create_temp_copy(str(db_path))

        # 修改副本
        conn = sqlite3.connect(str(copy_path))
        conn.execute("INSERT INTO test (name) VALUES ('modified')")
        conn.commit()
        conn.close()

        # 原始文件不应改变
        conn = sqlite3.connect(str(db_path))
        count = conn.execute("SELECT count(*) FROM test").fetchone()[0]
        conn.close()
        assert count == 1  # 原始只有一条记录


class TestOpenReadOnly:
    """open_read_only 方法测试。"""

    def test_opens_connection_read_only(self, service, tmp_path):
        """验证以只读模式打开数据库连接。"""
        db_path = tmp_path / "zotero.sqlite"
        _create_valid_sqlite(db_path)

        conn = service.open_read_only(db_path)
        assert conn is not None

        # 读取成功
        result = conn.execute("SELECT name FROM test WHERE id = 1").fetchone()
        assert result[0] == "hello"

        # 写入应当失败
        with pytest.raises(sqlite3.OperationalError):
            conn.execute("INSERT INTO test (name) VALUES ('should_fail')")

        conn.close()

    def test_handles_path_with_spaces(self, service, tmp_path):
        """验证路径包含空格时正常打开。"""
        db_dir = tmp_path / "my zotero dir"
        db_dir.mkdir()
        db_path = db_dir / "zotero.sqlite"
        _create_valid_sqlite(db_path)

        conn = service.open_read_only(db_path)
        result = conn.execute("SELECT name FROM test WHERE id = 1").fetchone()
        assert result[0] == "hello"
        conn.close()


class TestCleanupTempCopy:
    """cleanup_temp_copy 方法测试。"""

    def test_removes_temp_file(self, service, tmp_path):
        """验证清理删除临时文件。"""
        db_path = tmp_path / "zotero.sqlite"
        _create_valid_sqlite(db_path)
        copy_path = service.create_temp_copy(str(db_path))

        assert copy_path.exists()
        service.cleanup_temp_copy(copy_path)
        assert not copy_path.exists()

    def test_removes_empty_parent_dir(self, service, tmp_path):
        """验证清理后也删除空的父目录。"""
        db_path = tmp_path / "zotero.sqlite"
        _create_valid_sqlite(db_path)
        copy_path = service.create_temp_copy(str(db_path))
        parent = copy_path.parent

        assert parent.exists()
        service.cleanup_temp_copy(copy_path)
        assert not parent.exists()

    def test_idempotent_cleanup(self, service, tmp_path):
        """验证重复清理不报错。"""
        db_path = tmp_path / "zotero.sqlite"
        _create_valid_sqlite(db_path)
        copy_path = service.create_temp_copy(str(db_path))

        service.cleanup_temp_copy(copy_path)
        # 第二次清理应该不报错
        service.cleanup_temp_copy(copy_path)
