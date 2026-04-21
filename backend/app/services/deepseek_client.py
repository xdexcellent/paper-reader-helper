import json
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_SUMMARY_SYSTEM_PROMPT = """\
你是一个学术论文分析助手。请根据用户提供的论文各章节内容，生成结构化的论文摘要。

请严格以 JSON 格式返回结果，包含以下 6 个字段：
{
  "one_line_summary": "一句话总结论文的核心发现或贡献（50字以内）",
  "core_contributions": "核心贡献，列出论文的主要创新点（100-200字）",
  "method_summary": "方法概述，简要描述论文使用的技术方法和实验设计（100-200字）",
  "use_cases": "应用场景，论文成果可以应用在哪些领域（50-100字）",
  "limitations": "局限性，论文的不足之处和待改进方向（50-100字）",
  "relevance_note": "相关性注记，该论文与当前研究热点的关系和阅读价值（50-100字）"
}

注意：
- 所有字段使用中文回答
- 仅返回 JSON，不要包含任何其他文本或 markdown 标记
- 如果某个章节内容为空，根据已有内容尽可能推断
"""


class DeepSeekClient:
    """Client for DeepSeek Chat API to generate paper summaries."""

    def __init__(
        self,
        api_base: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.api_base = (api_base or settings.deepseek_api_base).rstrip("/")
        self.api_key = api_key or settings.deepseek_api_key

    def summarize_sections(self, sections: dict[str, str], model: str = "gpt-5.4-mini") -> dict[str, str]:
        """Summarize paper sections using DeepSeek Chat API.

        If no API key is configured, falls back to a placeholder result.
        """
        if not self.api_key:
            logger.warning("DEEPSEEK_API_KEY not configured, using placeholder result")
            return self._fallback_result(sections)

        try:
            return self._summarize_via_api(sections, model)
        except Exception:
            logger.exception("DeepSeek API call failed, falling back to placeholder")
            return self._fallback_result(sections)

    def _summarize_via_api(self, sections: dict[str, str], model: str = "gpt-5.4-mini") -> dict[str, str]:
        user_content = self._build_user_message(sections)
        logger.info(
            "Calling DeepSeek API for summarization (%d chars input)", len(user_content)
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
        print(f"[DeepSeek DEBUG] got content ({len(content)} chars)", flush=True)

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

        return {
            "one_line_summary": parsed.get("one_line_summary", ""),
            "core_contributions": parsed.get("core_contributions", ""),
            "method_summary": parsed.get("method_summary", ""),
            "use_cases": parsed.get("use_cases", ""),
            "limitations": parsed.get("limitations", ""),
            "relevance_note": parsed.get("relevance_note", ""),
            "model_name": model,
            "prompt_version": "v2",
        }

    def chat(self, messages: list[dict[str, str]], model: str = "gpt-5.4-mini") -> str:
        """Send a chat message to DeepSeek API."""
        if not self.api_key:
            return "DeepSeek API Key 未配置，无法进行真实对话。请在 backend/.env 中配置 DEEPSEEK_API_KEY。"

        endpoint = self._resolve_chat_endpoint()

        try:
            request_body = {
                "model": model,
                "messages": messages,
                "stream": True,
            }
            return self._stream_chat(endpoint, request_body)
        except Exception as e:
            logger.exception("DeepSeek chat failed")
            return f"对话失败，请稍后再试（错误信息：{str(e)}）。"

    def _stream_chat(self, endpoint: str, request_body: dict) -> str:
        """Send a streaming request and collect the content from SSE chunks.

        The API proxy returns null content in non-streaming mode,
        so we use streaming and manually concatenate delta chunks.
        """
        collected_content: list[str] = []

        with httpx.Client(timeout=180) as client:
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
        print(f"[DeepSeek DEBUG] resolved endpoint: {endpoint}", flush=True)
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
        """Return placeholder result when API key is not configured."""
        abstract_text = sections.get("abstract_md", "").strip()
        return {
            "one_line_summary": abstract_text[:120]
            if abstract_text
            else "DeepSeek API Key 未配置，请在 .env 中设置 DEEPSEEK_API_KEY",
            "core_contributions": "API Key 未配置，无法生成真实摘要。请在 backend/.env 中配置 DEEPSEEK_API_KEY。",
            "method_summary": "",
            "use_cases": "",
            "limitations": "",
            "relevance_note": "",
            "model_name": "fallback",
            "prompt_version": "v2",
        }
