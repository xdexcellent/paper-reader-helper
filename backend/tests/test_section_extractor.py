from app.services.section_extractor import SectionExtractor


def test_extract_handles_inline_abstract_and_roman_numeral_sections() -> None:
    markdown = """# MRI Super-Resolution with Partial Diffusion Models

Kai Zhao, Kaifeng Pang, Alex Ling Yu Hung

Abstract— Diffusion models can improve MRI super-resolution while remaining computationally expensive.

Index Terms— MRI, diffusion, super-resolution

# I. INTRODUCTION

Magnetic resonance imaging benefits from higher spatial resolution.

# IV. PARTIAL DIFFUSION MODELS FOR IMAGE SR

We approximate high-resolution latents with low-resolution latents to skip denoising steps.

# VI. CONCLUSIONS

Partial diffusion models preserve quality with fewer denoising steps.
"""

    sections = SectionExtractor().extract(markdown)

    assert "Diffusion models can improve MRI super-resolution" in sections["abstract_md"]
    assert "Magnetic resonance imaging benefits" in sections["introduction_md"]
    assert "approximate high-resolution latents" in sections["method_md"]
    assert "preserve quality with fewer denoising steps" in sections["conclusion_md"]


def test_extract_fallback_skips_author_block_when_abstract_heading_is_missing() -> None:
    markdown = """# A Paper Without Structured Headings

Alice Smith, Bob Jones, Carol Lee

We present a practical method for extracting useful summaries from loosely formatted papers.

The method adapts to noisy exports without relying on rigid heading names.
"""

    sections = SectionExtractor().extract(markdown)

    assert sections["abstract_md"].startswith("We present a practical method")
