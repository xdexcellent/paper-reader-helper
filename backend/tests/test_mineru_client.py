import zipfile

import httpx
import pytest

import app.services.mineru_client as mineru_module
from app.services.mineru_client import MineruClient


def test_make_pdf_url_encodes_special_characters() -> None:
    client = MineruClient(
        server_base_url="https://mineru.753939.xyz",
        storage_root="E:/tmp/paper-reader-helper/backend/data/storage",
    )

    url = client._make_pdf_url(
        "E:/tmp/paper-reader-helper/backend/data/storage/papers/abc123/MRI Super-Resolution with Partial Diffusion Models(科研通-ablesci.com).pdf"
    )

    assert url == (
        "https://mineru.753939.xyz/files/papers/abc123/"
        "MRI%20Super-Resolution%20with%20Partial%20Diffusion%20Models%28%E7%A7%91%E7%A0%94%E9%80%9A-ablesci.com%29.pdf"
    )


def test_parse_via_api_fails_before_submit_when_public_pdf_url_is_unreadable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    storage_root = tmp_path / "storage"
    pdf_path = storage_root / "papers" / "abc" / "broken.pdf"
    pdf_path.parent.mkdir(parents=True)
    pdf_path.write_bytes(b"%PDF-1.7\nreal local file")
    calls: list[tuple[str, str]] = []

    class FakeClient:
        def get(self, url: str, **kwargs):
            calls.append(("get", url))
            request = httpx.Request("GET", url)
            return httpx.Response(530, text="error code: 1033", request=request)

        def post(self, url: str, **kwargs):
            calls.append(("post", url))
            raise AssertionError("MinerU submit should not be called after failed preflight")

        def close(self) -> None:
            return None

    monkeypatch.setattr(mineru_module, "get_http_client", lambda **kwargs: FakeClient())
    client = MineruClient(
        api_base="https://mineru.example.com",
        api_token="token",
        server_base_url="https://files.example.com",
        storage_root=str(storage_root),
    )

    with pytest.raises(RuntimeError, match="PDF 公网 URL 预检失败.*HTTP 530"):
        client._parse_via_api(str(pdf_path))

    assert calls == [("get", "https://files.example.com/files/papers/abc/broken.pdf")]


def test_parse_via_api_submits_after_public_pdf_url_preflight_passes(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    storage_root = tmp_path / "storage"
    pdf_path = storage_root / "papers" / "abc" / "paper.pdf"
    pdf_path.parent.mkdir(parents=True)
    pdf_path.write_bytes(b"%PDF-1.7\nreal local file")
    calls: list[tuple[str, str]] = []

    class FakeClient:
        def get(self, url: str, **kwargs):
            calls.append(("get", url))
            request = httpx.Request("GET", url)
            return httpx.Response(206, content=b"%PDF-1.7", request=request)

        def post(self, url: str, **kwargs):
            calls.append(("post", url))
            request = httpx.Request("POST", url)
            return httpx.Response(200, json={"code": 0, "data": {"task_id": "task-1"}}, request=request)

        def close(self) -> None:
            return None

    monkeypatch.setattr(mineru_module, "get_http_client", lambda **kwargs: FakeClient())
    monkeypatch.setattr(MineruClient, "_poll_task", lambda self, task_id: {"full_zip_url": "https://result.zip"})
    monkeypatch.setattr(
        MineruClient,
        "_download_and_extract_markdown",
        lambda self, url, pdf_path=None: ("# Parsed", "local-result.zip"),
    )
    client = MineruClient(
        api_base="https://mineru.example.com",
        api_token="token",
        server_base_url="https://files.example.com",
        storage_root=str(storage_root),
    )

    result = client._parse_via_api(str(pdf_path))

    assert result["full_markdown"] == "# Parsed"
    assert result["full_zip_path"] == "local-result.zip"
    assert calls == [
        ("get", "https://files.example.com/files/papers/abc/paper.pdf"),
        ("post", "https://mineru.example.com/api/v4/extract/task"),
    ]


def test_download_and_extract_markdown_persists_result_zip(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    storage_root = tmp_path / "storage"
    pdf_path = storage_root / "papers" / "abc" / "paper.pdf"
    pdf_path.parent.mkdir(parents=True)
    pdf_path.write_bytes(b"%PDF-1.7")
    zip_bytes_path = tmp_path / "result.zip"
    with zipfile.ZipFile(zip_bytes_path, "w") as archive:
        archive.writestr("full.md", "# Parsed")
        archive.writestr("images/figure.png", b"image bytes")
    zip_bytes = zip_bytes_path.read_bytes()

    class FakeClient:
        def get(self, url: str, **kwargs):
            request = httpx.Request("GET", url)
            return httpx.Response(200, content=zip_bytes, request=request)

        def close(self) -> None:
            return None

    monkeypatch.setattr(mineru_module, "get_http_client", lambda **kwargs: FakeClient())
    client = MineruClient(storage_root=str(storage_root))

    markdown, local_zip_path = client._download_and_extract_markdown(
        "https://result.example.com/result.zip",
        str(pdf_path),
    )

    assert markdown == "# Parsed"
    assert local_zip_path == str(pdf_path.parent / "mineru" / "result.zip")
    assert (pdf_path.parent / "mineru" / "result.zip").read_bytes() == zip_bytes
