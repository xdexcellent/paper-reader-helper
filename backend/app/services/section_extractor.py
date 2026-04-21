import re


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
_SECTION_PREFIX_RE = re.compile(
    r"^(?:(?:\(?[ivxlcdm]+\)?|\d+(?:\.\d+)*|[A-Z])[\.\)]\s+)+",
    re.IGNORECASE,
)
_INLINE_ABSTRACT_RE = re.compile(
    r"^(?:#+\s*)?(abstract|\u6458\u8981)\s*[:\-\u2013\u2014\uff1a]+\s*(.+)$",
    re.IGNORECASE | re.DOTALL,
)
_PLAIN_ABSTRACT_RE = re.compile(r"^(?:#+\s*)?(abstract|\u6458\u8981)\s*$", re.IGNORECASE)
_KEYWORD_PREFIX_RE = re.compile(
    r"^(index terms|keywords?|key words?)\s*[:\-\u2013\u2014\uff1a]+",
    re.IGNORECASE,
)
_SENTENCE_END_RE = re.compile(r"[.!?;:\u3002\uff01\uff1f\uff1b\uff1a]")
_METADATA_HINTS = (
    "university",
    "department",
    "school of",
    "institute",
    "laboratory",
    "laboratory",
    "hospital",
    "corresponding author",
    "funded",
    "grant",
    "acknowledg",
    "email",
    "@",
)


class SectionExtractor:
    def extract(self, markdown: str) -> dict[str, str]:
        blocks = self._split_blocks(markdown)
        sections = {
            "abstract_md": self._extract_abstract(markdown, blocks),
            "introduction_md": self._find_first_matching_block(
                blocks,
                ("introduction", "background", "\u5f15\u8a00", "\u80cc\u666f"),
            ),
            "method_md": self._find_method_block(blocks),
            "conclusion_md": self._find_first_matching_block(
                blocks,
                ("conclusion", "conclusions", "summary", "\u7ed3\u8bba", "\u603b\u7ed3"),
            ),
        }
        if not sections["abstract_md"]:
            sections["abstract_md"] = self._fallback_abstract(markdown)
        return sections

    def _extract_abstract(self, markdown: str, blocks: list[dict[str, str]]) -> str:
        heading_match = self._find_first_matching_block(
            blocks,
            ("abstract", "\u6458\u8981"),
        )
        if heading_match:
            return heading_match

        paragraphs = self._paragraphs(markdown)
        for index, paragraph in enumerate(paragraphs):
            inline_match = _INLINE_ABSTRACT_RE.match(paragraph)
            if inline_match:
                return inline_match.group(2).strip()

            if _PLAIN_ABSTRACT_RE.match(paragraph):
                next_paragraph = paragraphs[index + 1] if index + 1 < len(paragraphs) else ""
                if next_paragraph and not self._looks_like_metadata(next_paragraph):
                    return next_paragraph

        return ""

    def _find_first_matching_block(
        self,
        blocks: list[dict[str, str]],
        keywords: tuple[str, ...],
    ) -> str:
        for block in blocks:
            normalized_heading = block["normalized_heading"]
            if any(keyword in normalized_heading for keyword in keywords):
                return self._render_block(block)
        return ""

    def _find_method_block(self, blocks: list[dict[str, str]]) -> str:
        preferred_keywords = (
            "method",
            "methods",
            "methodology",
            "approach",
            "approaches",
            "framework",
            "architecture",
            "algorithm",
            "algorithms",
            "pipeline",
            "pipelines",
            "implementation",
            "model",
            "models",
            "\u65b9\u6cd5",
            "\u6a21\u578b",
        )
        disqualifiers = (
            "background",
            "related work",
            "experiment",
            "experiments",
            "result",
            "results",
            "conclusion",
            "conclusions",
            "reference",
            "appendix",
            "\u80cc\u666f",
            "\u5b9e\u9a8c",
            "\u7ed3\u8bba",
            "\u53c2\u8003",
        )
        experiment_boundary = self._find_boundary_index(
            blocks,
            ("experiment", "experiments", "results", "\u5b9e\u9a8c", "\u7ed3\u679c"),
        )

        best_block: dict[str, str] | None = None
        best_score = 0
        for index, block in enumerate(blocks):
            normalized_heading = block["normalized_heading"]
            score = 0
            for keyword in preferred_keywords:
                if keyword in normalized_heading:
                    score += 5 if len(keyword) > 5 else 3
            for disqualifier in disqualifiers:
                if disqualifier in normalized_heading:
                    score -= 4

            if block["content"]:
                score += 1
            if index > 0:
                score += index
            if experiment_boundary is not None and index >= experiment_boundary:
                score -= 6

            if score > best_score:
                best_score = score
                best_block = block

        if best_block is None or best_score <= 0:
            return ""
        return self._render_block(best_block)

    def _fallback_abstract(self, markdown: str) -> str:
        fallback = ""
        for paragraph in self._paragraphs(markdown):
            if paragraph.startswith("#"):
                continue
            if _KEYWORD_PREFIX_RE.match(paragraph):
                continue
            if self._looks_like_metadata(paragraph):
                continue
            fallback = paragraph
            if len(paragraph) >= 60 or _SENTENCE_END_RE.search(paragraph):
                return paragraph
        return fallback or markdown[:500].strip()

    def _split_blocks(self, markdown: str) -> list[dict[str, str]]:
        blocks: list[dict[str, str]] = []
        current_heading = ""
        current_level = 0
        current_lines: list[str] = []

        for line in markdown.splitlines():
            heading_match = _HEADING_RE.match(line.strip())
            if heading_match:
                if current_heading:
                    blocks.append(self._build_block(current_heading, current_level, current_lines))
                current_heading = heading_match.group(2).strip()
                current_level = len(heading_match.group(1))
                current_lines = []
                continue
            if current_heading:
                current_lines.append(line)

        if current_heading:
            blocks.append(self._build_block(current_heading, current_level, current_lines))
        return blocks

    def _build_block(self, heading: str, level: int, lines: list[str]) -> dict[str, str]:
        content = "\n".join(lines).strip()
        return {
            "heading": heading,
            "level": str(level),
            "normalized_heading": self._normalize_heading(heading),
            "content": content,
        }

    def _find_boundary_index(
        self,
        blocks: list[dict[str, str]],
        keywords: tuple[str, ...],
    ) -> int | None:
        for index, block in enumerate(blocks):
            normalized_heading = block["normalized_heading"]
            if any(keyword in normalized_heading for keyword in keywords):
                return index
        return None

    def _normalize_heading(self, heading: str) -> str:
        normalized = heading.replace("\u2014", " ").replace("\u2013", " ")
        normalized = re.sub(r"\s+", " ", normalized).strip()
        normalized = _SECTION_PREFIX_RE.sub("", normalized)
        return normalized.lower().strip(" .:-")

    def _paragraphs(self, markdown: str) -> list[str]:
        return [part.strip() for part in re.split(r"\n\s*\n", markdown) if part.strip()]

    def _render_block(self, block: dict[str, str]) -> str:
        if block["content"]:
            return f'{block["heading"]}\n\n{block["content"]}'.strip()
        return block["heading"]

    def _looks_like_metadata(self, paragraph: str) -> bool:
        compact = " ".join(paragraph.split())
        lowered = compact.lower()

        if not compact:
            return True
        if any(hint in lowered for hint in _METADATA_HINTS):
            return True
        if _KEYWORD_PREFIX_RE.match(compact):
            return True

        if "," not in compact or _SENTENCE_END_RE.search(compact):
            return False

        chunks = [chunk.strip() for chunk in compact.split(",") if chunk.strip()]
        if len(chunks) < 2:
            return False
        return all(self._looks_like_name_chunk(chunk) for chunk in chunks)

    def _looks_like_name_chunk(self, chunk: str) -> bool:
        cleaned_words = []
        for raw_word in chunk.split():
            word = re.sub(r"[^A-Za-z'\-]", "", raw_word)
            if word:
                cleaned_words.append(word)

        if not 1 <= len(cleaned_words) <= 6:
            return False

        for word in cleaned_words:
            if not word[0].isupper():
                return False
            tail = word[1:].replace("-", "").replace("'", "")
            if tail and not tail.isalpha():
                return False

        return True
