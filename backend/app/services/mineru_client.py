import logging
import time
import zipfile
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

import httpx

from app.core.config import settings
from app.services.http_client_factory import get_http_client

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 5  # seconds
_POLL_TIMEOUT = 600  # seconds
_LOCAL_HOST_TOKENS = ["localhost", "127.0.0.1", "0.0.0.0"]
_PDF_MAGIC = b"%PDF-"
_PDF_PREFLIGHT_RANGE = "bytes=0-15"


class MineruClient:
    """Client for MinerU Precision Extract API (v4).

    Flow:
      1. POST /api/v4/extract/task  → get task_id
      2. GET  /api/v4/extract/task/{task_id}  → poll until completed
      3. Download result_url (ZIP) → extract markdown
    """

    def __init__(
        self,
        api_base: str | None = None,
        api_token: str | None = None,
        server_base_url: str | None = None,
        storage_root: str | None = None,
    ) -> None:
        self.api_base = (api_base or settings.mineru_api_base).rstrip("/")
        self.api_token = api_token or settings.mineru_api_token
        self.server_base_url = (server_base_url or settings.server_base_url).rstrip("/")
        self.storage_root = Path(storage_root or settings.storage_root).resolve()

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_token}",
        }

    def _make_pdf_url(self, local_pdf_path: str) -> str:
        """Convert a local storage path to a URL accessible via our static file server."""
        local = Path(local_pdf_path).resolve()
        relative = local.relative_to(self.storage_root)
        # Encode each path segment so spaces, parentheses, and Unicode remain fetchable.
        url_path = "/".join(quote(part, safe="") for part in relative.parts)
        return f"{self.server_base_url}/files/{url_path}"

    def _is_remote_accessible_base_url(self) -> bool:
        lower = self.server_base_url.lower()
        return not any(token in lower for token in _LOCAL_HOST_TOKENS)

    def parse_pdf(self, pdf_path: str) -> dict[str, str]:
        """Parse a PDF file via MinerU API and return markdown content.

        Parsing must either return real extracted content or fail explicitly.
        """
        if not self.api_token:
            message = "MINERU_API_TOKEN 未配置，请在 backend/.env 中设置该值后重试。"
            logger.warning(message)
            raise RuntimeError(message)

        if not self._is_remote_accessible_base_url():
            logger.warning(
                "SERVER_BASE_URL is local and not remotely accessible by MinerU (%s)",
                self.server_base_url,
            )
            message = (
                "`SERVER_BASE_URL` 当前是本地地址（localhost/127.0.0.1），"
                "MinerU 无法从公网访问你的 PDF，请改为可公网访问的后端地址后重试。"
            )
            raise RuntimeError(message)

        try:
            return self._parse_via_api(pdf_path)
        except Exception as e:
            logger.exception("MinerU API call failed")
            raise RuntimeError(f"MinerU 解析失败: {str(e)}") from e

    def _parse_via_api(self, pdf_path: str) -> dict[str, str]:
        pdf_url = self._make_pdf_url(pdf_path)
        self._preflight_pdf_url(pdf_url)
        logger.info("Submitting PDF to MinerU: %s", pdf_url)

        # Step 1: Submit extraction task
        client = get_http_client(timeout=30)
        try:
            resp = client.post(
                f"{self.api_base}/api/v4/extract/task",
                headers=self._headers(),
                json={"url": pdf_url, "model_version": "vlm"},
            )
            resp.raise_for_status()
            submit_data = resp.json()
        finally:
            client.close()

        if submit_data.get("code") != 0:
            raise RuntimeError(
                f"MinerU submit failed: {submit_data.get('message', 'unknown error')}"
            )

        task_id = submit_data["data"]["task_id"]
        logger.info("MinerU task submitted: %s", task_id)

        # Step 2: Poll for completion
        result_data = self._poll_task(task_id)

        # Step 3: Download and extract results
        result_url = result_data.get("full_zip_url", "") or result_data.get("result_url", "")
        if not result_url:
            raise RuntimeError("MinerU task completed but no result URL returned")

        full_markdown = self._download_and_extract_markdown(result_url)

        return {
            "full_markdown": full_markdown,
            "content_json_path": result_data.get("content_json_url", ""),
            "full_zip_path": result_url,
        }

    def _preflight_pdf_url(self, pdf_url: str) -> None:
        """Verify MinerU can fetch an actual PDF before submitting an extraction task."""
        client = get_http_client(timeout=30)
        try:
            try:
                resp = client.get(
                    pdf_url,
                    headers={
                        "Accept": "application/pdf,*/*",
                        "Range": _PDF_PREFLIGHT_RANGE,
                    },
                )
            except httpx.HTTPError as exc:
                raise RuntimeError(
                    f"PDF 公网 URL 预检失败：无法访问 {pdf_url}，MinerU 无法读取 PDF。"
                    f" 原始错误：{exc}"
                ) from exc

            if resp.status_code >= 400:
                raise RuntimeError(
                    f"PDF 公网 URL 预检失败：{pdf_url} 返回 HTTP {resp.status_code}，"
                    "MinerU 无法读取 PDF。"
                    f" 响应预览：{self._response_preview(resp.content)}"
                )

            prefix = resp.content[:len(_PDF_MAGIC)]
            if prefix != _PDF_MAGIC:
                content_type = resp.headers.get("content-type", "unknown")
                raise RuntimeError(
                    f"PDF 公网 URL 预检失败：{pdf_url} 返回的内容不是 PDF"
                    f"（content-type={content_type}）。"
                    f" 响应预览：{self._response_preview(resp.content)}"
                )
        finally:
            client.close()

    @staticmethod
    def _response_preview(content: bytes, limit: int = 120) -> str:
        if not content:
            return "<empty>"
        return content[:limit].decode("utf-8", errors="replace").replace("\n", "\\n")

    def _poll_task(self, task_id: str) -> dict:
        """Poll MinerU API until the task is completed or times out."""
        start = time.monotonic()

        client = get_http_client(timeout=30)
        try:
            while True:
                elapsed = time.monotonic() - start
                if elapsed > _POLL_TIMEOUT:
                    raise TimeoutError(
                        f"MinerU task {task_id} timed out after {_POLL_TIMEOUT}s"
                    )

                resp = client.get(
                    f"{self.api_base}/api/v4/extract/task/{task_id}",
                    headers=self._headers(),
                )
                resp.raise_for_status()
                poll_data = resp.json()

                if poll_data.get("code") != 0:
                    raise RuntimeError(f"MinerU poll error: {poll_data.get('message')}")

                task_info = poll_data.get("data", {})
                # MinerU API uses 'state' field (not 'status')
                state = task_info.get("state", "") or task_info.get("status", "")
                logger.debug(
                    "MinerU task %s state=%s elapsed=%ss",
                    task_id,
                    state,
                    int(elapsed),
                )

                if state in ("done", "completed"):
                    return task_info
                elif state in ("failed", "error"):
                    err_msg = task_info.get("err_msg", "unknown error")
                    raise RuntimeError(f"MinerU task {task_id} failed: {err_msg}")

                time.sleep(_POLL_INTERVAL)
        finally:
            client.close()

    def _download_and_extract_markdown(self, result_url: str) -> str:
        """Download a result ZIP and extract the markdown content."""
        client = get_http_client(timeout=120)
        try:
            resp = client.get(result_url)
            resp.raise_for_status()
            content = resp.content
        finally:
            client.close()

        with zipfile.ZipFile(BytesIO(content)) as zf:
            # Look for markdown files in the ZIP
            md_files = [n for n in zf.namelist() if n.endswith(".md")]
            if not md_files:
                raise RuntimeError("No markdown file found in MinerU result ZIP")

            # Prefer full.md or the largest .md file
            target = None
            for name in md_files:
                if "full" in name.lower():
                    target = name
                    break
            if target is None:
                # Pick the largest markdown file
                target = max(md_files, key=lambda n: zf.getinfo(n).file_size)

            content = zf.read(target).decode("utf-8")
            logger.info("Extracted markdown from %s (%d chars)", target, len(content))
            return content

    def _fallback_result(
        self, pdf_path: str, reason: str | None = None
    ) -> dict[str, str]:
        """Return a placeholder result when the API is unavailable."""
        pdf_name = Path(pdf_path).stem
        fallback_reason = reason or (
            "MinerU API Token 未配置，请在 `.env` 文件中设置 `MINERU_API_TOKEN` 以启用真实 PDF 解析。"
        )
        return {
            "full_markdown": (
                f"# {pdf_name}\n\n"
                "## Abstract\n\n"
                f"{fallback_reason}\n\n"
                "## 如何获取 Token\n\n"
                "1. 访问 https://mineru.net 注册账号\n"
                "2. 在控制台获取 API Token\n"
                "3. 将 Token 填入 `backend/.env` 的 `MINERU_API_TOKEN` 字段\n"
                "4. 将 `SERVER_BASE_URL` 配置为可公网访问的后端域名（不能是 localhost）\n"
            ),
            "content_json_path": "",
            "full_zip_path": "",
        }
