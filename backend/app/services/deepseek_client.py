import json
import logging
import re
import time

import httpx

from app.core.config import settings
from app.core.db import engine
from app.services.ai_provider_settings_service import (
    AiProviderSettingsService,
    DEFAULT_AI_MODEL,
)
from app.services.http_client_factory import get_http_client

logger = logging.getLogger(__name__)
BLOCK_TRANSLATION_PROMPT_VERSION = "block-translate-v1"

STREAM_TOTAL_TIMEOUT_SECONDS = 300.0


def _thinking_budget(level: str) -> int:
    """Map thinking level to token budget for the thinking parameter."""
    budgets = {
        "low": 4096,
        "medium": 16384,
        "high": 32768,
    }
    return budgets.get(level, 16384)


def _is_meaningful_chinese(text: str | None) -> bool:
    """Validate that text is meaningful Chinese content, not English or section labels.
    
    Checks:
    1. At least 20 characters
    2. Contains Chinese characters (\u4e00-\u9fff)
    3. Not just section labels like "Abstract", "Introduction"
    """
    if not text:
        return False
    stripped = text.strip()
    if len(stripped) < 20:
        return False
    # Must contain at least some Chinese characters
    if not re.search(r'[\u4e00-\u9fff]', stripped):
        return False
    # Reject common English section labels
    lower = stripped.lower()
    if lower in {"abstract", "introduction", "methods", "method", 
                 "conclusion", "results", "discussion", "summary",
                 "background", "related work", "none", "n/a", "null", "tbd"}:
        return False
    return True

_SUMMARY_SYSTEM_PROMPT = """\
你是一个专业的学术论文分析助手，读者是中文科研工作者。请根据用户提供的论文各章节内容，生成结构化的中文摘要。

请严格以 JSON 格式返回结果，包含以下 6 个字段：
{
  "one_line_summary": "一句话总结论文的核心发现或贡献（50字以内，完整中文句子）",
  "core_contributions": "核心贡献，列出论文的主要创新点（100-200字中文）",
  "method_summary": "方法概述，简要描述论文使用的技术方法和实验设计（100-200字中文）",
  "use_cases": "应用场景，论文成果可以应用在哪些领域（50-100字中文）",
  "limitations": "局限性，论文的不足之处和待改进方向（50-100字中文）",
  "relevance_note": "相关性注记，该论文与当前研究热点的关系和阅读价值（50-100字中文）"
}

关键规则：
1. **无论输入论文是什么语言（英文 / 中文 / 其他），所有字段必须全部使用简体中文完整句子回答**。严禁返回英文章节标题（如 "Abstract"、"Introduction"）或原文片段作为字段值。
2. 技术术语可保留英文缩写（如 LLM、RL、VLM、KV Cache），但说明文字必须是中文。
3. 每个字段必须是意义完整的中文句子，长度不少于 20 字符。如果内容不足以填充某字段，请基于已有内容合理推断并补全。
4. 仅返回 JSON 对象，不要包含任何解释、markdown 标记或多余文本。

示例（输入英文摘要时的正确输出）：
输入摘要："This paper presents a novel diffusion transformer for image generation..."
正确输出片段：
  "one_line_summary": "提出一种基于 Transformer 的新型扩散模型用于图像生成",
  "core_contributions": "核心贡献是在扩散模型架构中引入 Transformer 主干..."

错误示例（禁止）：
  "one_line_summary": "Abstract"   ← 仅章节标签，不合法
  "one_line_summary": "This paper presents..."   ← 英文，不合法
"""


class DeepSeekClient:
    """Client for OpenAI-compatible chat APIs to generate paper summaries."""

    def __init__(
        self,
        api_base: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self._api_base_override = api_base
        self._api_key_override = api_key
        self.api_base = (api_base or settings.deepseek_api_base).rstrip("/")
        self.api_key = api_key or settings.deepseek_api_key

    def _load_effective_provider(self) -> tuple[str, str, str]:
        api_base = self._api_base_override
        api_key = self._api_key_override
        default_model = DEFAULT_AI_MODEL
        if api_base is not None and api_key is not None:
            return api_base.rstrip("/"), api_key, default_model

        try:
            from sqlmodel import Session

            with Session(engine) as session:
                effective = AiProviderSettingsService.get_effective_settings(session)
                api_base = api_base or effective.api_base
                api_key = api_key if api_key is not None else effective.api_key
                default_model = effective.default_model
        except Exception:
            logger.debug("Could not load AI provider settings from database", exc_info=True)
            api_base = api_base or settings.deepseek_api_base
            api_key = api_key if api_key is not None else settings.deepseek_api_key

        self.api_base = (api_base or settings.deepseek_api_base).rstrip("/")
        self.api_key = api_key or ""
        return self.api_base, self.api_key, default_model

    def resolve_model(self, model: str | None = None) -> str:
        _api_base, _api_key, default_model = self._load_effective_provider()
        return (model or default_model or DEFAULT_AI_MODEL).strip()

    def summarize_sections(self, sections: dict[str, str], model: str | None = None) -> dict[str, str]:
        """Summarize paper sections using the configured AI provider.

        If no API key is configured, falls back to a placeholder result.
        """
        model_name = self.resolve_model(model)
        if not self.api_key:
            logger.warning("AI provider API key not configured, using placeholder result")
            return self._fallback_result(sections)

        try:
            return self._summarize_via_api(sections, model_name)
        except Exception:
            logger.exception("AI provider API call failed, falling back to placeholder")
            return self._fallback_result(sections)

    def _summarize_via_api(self, sections: dict[str, str], model: str) -> dict[str, str]:
        user_content = self._build_user_message(sections)
        logger.info(
            "Calling AI provider for summarization (%d chars input)", len(user_content)
        )
        endpoint = self._resolve_chat_endpoint()

        # Use system + user for all models; merge if needed later
        messages = [
            {"role": "system", "content": _SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        request_body: dict = {
            "model": model,
            "messages": messages,
            "stream": True,  # Proxy returns null content in non-stream mode
        }

        content = self._stream_chat(endpoint, request_body)
        logger.debug("AI provider streaming response collected (%d chars)", len(content))

        # Parse JSON from response — handle possible markdown code fences
        import re

        json_str = content

        # Try to find a JSON object in the response using regex
        match = re.search(r"\{[\s\S]*\}", json_str)
        if match:
            json_str = match.group(0)

        try:
            parsed = json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse JSON. Raw response: %s", content)
            raise e

        result = {
            "one_line_summary": parsed.get("one_line_summary", ""),
            "core_contributions": parsed.get("core_contributions", ""),
            "method_summary": parsed.get("method_summary", ""),
            "use_cases": parsed.get("use_cases", ""),
            "limitations": parsed.get("limitations", ""),
            "relevance_note": parsed.get("relevance_note", ""),
            "model_name": model,
            "prompt_version": "v3",
        }

        # 校验核心字段：避免 LLM 返回英文/章节标签/过短占位符
        if not _is_meaningful_chinese(result["one_line_summary"]):
            logger.warning(
                "AI provider output rejected (one_line_summary not valid Chinese): %r",
                result["one_line_summary"][:80],
            )
            raise RuntimeError("AI provider summary failed validation: one_line_summary not valid Chinese")

        return result

    def translate_to_chinese(self, text: str, model: str | None = None) -> str:
        """Translate English text to Chinese using the configured AI provider.

        Returns original text if API unavailable or translation fails.
        """
        model_name = self.resolve_model(model)
        if not text or not self.api_key:
            return text
        try:
            messages = [
                {"role": "system", "content": "你是一个专业的技术文档翻译助手。请将用户提供的英文项目描述翻译成简洁流畅的中文（50字以内）。仅返回翻译结果，不要解释。"},
                {"role": "user", "content": f"请翻译以下项目描述：\n\n{text}"},
            ]
            result = self._stream_chat(self._resolve_chat_endpoint(), {
                "model": model_name, "messages": messages, "stream": True,
            })
            # Validate: result should be Chinese
            if _is_meaningful_chinese(result):
                return result.strip()
            return text
        except Exception:
            logger.warning("Translation failed, using local Chinese fallback: %s", text[:80])
            return text

    def translate_block_text(
        self,
        *,
        text: str,
        target_language: str = "zh-CN",
        model: str | None = None,
        page_index: int | None = None,
        block_type: str = "text",
    ) -> dict[str, str]:
        model_name = self.resolve_model(model)
        if not text.strip():
            raise ValueError("block has no translatable text")
        if not self.api_key:
            raise RuntimeError("AI provider API Key is not configured")
        system = (
            "You are an academic translation assistant. Translate the user's paper "
            "block into the target language. Preserve formulas, citations, tables, "
            "code, and technical terms. Return only the translation."
        )
        user = (
            f"Target language: {target_language}\nBlock type: {block_type}\n"
            f"Page index: {page_index if page_index is not None else 'unknown'}\n\n{text}"
        )
        translated = self._stream_chat(
            self._resolve_chat_endpoint(),
                {"model": model_name, "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ], "stream": True},
        )
        return {"translated_text": translated.strip(), "model_name": model_name, "prompt_version": BLOCK_TRANSLATION_PROMPT_VERSION}

    def chat(self, messages: list[dict[str, str]], model: str | None = None, thinking: str | None = None) -> str:
        """Send a chat message to the configured AI provider.
        
        Args:
            messages: Chat messages
            model: Model name
            thinking: Thinking mode - "none", "low", "medium", "high".
                      None means use the system default from settings.
        """
        model_name = self.resolve_model(model)
        if not self.api_key:
            return "AI 供应商 API Key 未配置，无法进行真实对话。请在偏好设置中配置 API Key。"

        # Resolve thinking mode
        effective_thinking = thinking if thinking is not None else settings.deepseek_thinking

        request_body: dict = {
            "model": model_name,
            "messages": messages,
            "stream": True,
        }

        # Add thinking parameter if not "none"
        if effective_thinking and effective_thinking != "none":
            request_body["thinking"] = {"type": "enabled", "budget_tokens": _thinking_budget(effective_thinking)}

        try:
            return self._stream_chat(self._resolve_chat_endpoint(), request_body)
        except Exception as e:
            logger.exception("AI provider chat failed")
            return f"对话失败，请稍后再试（错误信息：{str(e)}）。"

    def _stream_chat(self, endpoint: str, request_body: dict) -> str:
        """Send a streaming request and collect the content from SSE chunks.

        The API proxy returns null content in non-streaming mode,
        so we use streaming and manually concatenate delta chunks.

        Total streaming time is capped by STREAM_TOTAL_TIMEOUT_SECONDS to prevent
        indefinite hangs when the provider keeps sending chunks without [DONE]
        or the connection is half-open.
        """
        collected_content: list[str] = []

        # LLM calls must use the same URL/API key path as paper summarization.
        # Do not reuse automation proxy settings, which are intended for source fetching.
        # Per-phase timeouts: read=30s detects half-open connections quickly;
        # the total deadline below caps the whole streaming duration.
        client = get_http_client(
            timeout=httpx.Timeout(connect=10.0, read=30.0, write=30.0, pool=10.0),
            use_db_proxy=False,
        )
        start = time.monotonic()
        try:
            with client.stream(
                "POST",
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                },
                json=request_body,
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if time.monotonic() - start > STREAM_TOTAL_TIMEOUT_SECONDS:
                        raise TimeoutError(
                            f"Streaming response exceeded total timeout {STREAM_TOTAL_TIMEOUT_SECONDS}s"
                        )
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    payload = line[len("data: "):]
                    if payload == "[DONE]":
                        break
                    try:
                        chunk = json.loads(payload)
                        delta = chunk["choices"][0].get("delta", {})
                        # Only collect 'content' (skip 'reasoning_content')
                        text = delta.get("content")
                        if text:
                            collected_content.append(text)
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
        finally:
            client.close()

        result = "".join(collected_content).strip()
        if not result:
            raise RuntimeError("Streaming response returned no content")
        return result

    def _resolve_chat_endpoint(self) -> str:
        if self.api_base.endswith("/chat/completions"):
            endpoint = self.api_base
        elif self.api_base.endswith("/v1"):
            endpoint = f"{self.api_base}/chat/completions"
        else:
            endpoint = f"{self.api_base}/v1/chat/completions"
        logger.debug("Resolved AI provider chat endpoint: %s", endpoint)
        return endpoint

    def _build_user_message(self, sections: dict[str, str]) -> str:
        parts = ["以下是论文各章节的内容：\n"]

        section_labels = {
            "abstract_md": "摘要 (Abstract)",
            "introduction_md": "引言 (Introduction)",
            "method_md": "方法 (Methods)",
            "conclusion_md": "结论 (Conclusion)",
        }

        for key, label in section_labels.items():
            text = sections.get(key, "").strip()
            if text:
                parts.append(f"### {label}\n{text}\n")
            else:
                parts.append(f"### {label}\n（该章节内容为空）\n")

        parts.append("\n请根据以上内容生成结构化摘要，以 JSON 格式返回。")
        return "\n".join(parts)

    def _fallback_result(self, sections: dict[str, str]) -> dict[str, str]:
        """Return placeholder result when API is not available or validation failed.
        
        Returns Chinese-only placeholder to avoid showing English abstracts in briefing.
        """
        placeholder = "摘要生成暂时不可用，请检查偏好设置中的 AI 供应商 API Key，或稍后重试。如需使用原始摘要，请在论文详情页查看。"
        return {
            "one_line_summary": placeholder,
            "core_contributions": placeholder,
            "method_summary": "",
            "use_cases": "",
            "limitations": "",
            "relevance_note": placeholder,
            "model_name": "fallback",
            "prompt_version": "v3",
        }
