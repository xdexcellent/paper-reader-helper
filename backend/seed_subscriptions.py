"""一键添加针对计算机视觉、扩散模型、CS+医学方向的订阅源。

运行方式: python seed_subscriptions.py
会跳过已存在同名的订阅。
"""

import json
import sys

from sqlmodel import Session, select

sys.path.insert(0, ".")
from app.core.db import engine
from app.models.subscription import Subscription

SUBSCRIPTIONS = [
    # ═══════════════════════════════════════════════════════════
    # arXiv 分类订阅（最稳定，直链 PDF）
    # ═══════════════════════════════════════════════════════════
    {
        "name": "arXiv · 计算机视觉 (cs.CV)",
        "source_kind": "arxiv",
        "query": "cat:cs.CV",
        "fetch_limit": 15,
    },
    {
        "name": "arXiv · 扩散模型",
        "source_kind": "arxiv",
        "query": "diffusion model generation",
        "fetch_limit": 10,
    },
    {
        "name": "arXiv · 医学图像分析",
        "source_kind": "arxiv",
        "query": "medical image segmentation",
        "fetch_limit": 10,
    },
    {
        "name": "arXiv · AI+医疗 (cs.AI+医学)",
        "source_kind": "arxiv",
        "query": "deep learning clinical diagnosis",
        "fetch_limit": 10,
    },
    {
        "name": "arXiv · 图像生成 (image synthesis)",
        "source_kind": "arxiv",
        "query": "image synthesis generative model",
        "fetch_limit": 10,
    },

    # ═══════════════════════════════════════════════════════════
    # Semantic Scholar（语义搜索，覆盖面广）
    # ═══════════════════════════════════════════════════════════
    {
        "name": "S2 · Diffusion Models 2024-2025",
        "source_kind": "semantic_scholar",
        "query": "diffusion models image generation",
        "config": {"year": "2024-2025", "open_access_only": "true", "fields_of_study": "Computer Science"},
        "fetch_limit": 10,
    },
    {
        "name": "S2 · Medical Image Segmentation",
        "source_kind": "semantic_scholar",
        "query": "medical image segmentation deep learning",
        "config": {"year": "2024-2025", "open_access_only": "true"},
        "fetch_limit": 10,
    },
    {
        "name": "S2 · Vision Transformer",
        "source_kind": "semantic_scholar",
        "query": "vision transformer ViT",
        "config": {"year": "2024-2025", "open_access_only": "true", "fields_of_study": "Computer Science"},
        "fetch_limit": 10,
    },
    {
        "name": "S2 · AI for Drug Discovery",
        "source_kind": "semantic_scholar",
        "query": "artificial intelligence drug discovery",
        "config": {"year": "2024-2025", "open_access_only": "true"},
        "fetch_limit": 10,
    },

    # ═══════════════════════════════════════════════════════════
    # Papers With Code（带代码实现的论文）
    # ═══════════════════════════════════════════════════════════
    {
        "name": "PwC · 扩散模型 + 代码",
        "source_kind": "pwc",
        "query": "diffusion model",
        "config": {},
        "fetch_limit": 10,
    },
    {
        "name": "PwC · 医学影像 + 代码",
        "source_kind": "pwc",
        "query": "medical image",
        "config": {},
        "fetch_limit": 10,
    },
    {
        "name": "PwC · 热门论文",
        "source_kind": "pwc",
        "query": "",
        "config": {"mode": "trending"},
        "fetch_limit": 10,
    },

    # ═══════════════════════════════════════════════════════════
    # DBLP（顶会论文检索）
    # ═══════════════════════════════════════════════════════════
    {
        "name": "DBLP · CVPR/ICCV 扩散模型",
        "source_kind": "dblp",
        "query": "diffusion model image",
        "config": {"type": "Conference and Workshop Papers"},
        "fetch_limit": 10,
    },
    {
        "name": "DBLP · MICCAI 医学影像",
        "source_kind": "dblp",
        "query": "medical image segmentation MICCAI",
        "config": {"type": "Conference and Workshop Papers"},
        "fetch_limit": 10,
    },

    # ═══════════════════════════════════════════════════════════
    # CrossRef（跨学科，含医学期刊）
    # ═══════════════════════════════════════════════════════════
    {
        "name": "CrossRef · AI in Radiology",
        "source_kind": "crossref",
        "query": "artificial intelligence radiology imaging",
        "config": {"sort": "published", "order": "desc", "from_date": "2024-01-01"},
        "fetch_limit": 10,
    },
    {
        "name": "CrossRef · Diffusion MRI/CT",
        "source_kind": "crossref",
        "query": "diffusion model medical imaging CT MRI",
        "config": {"sort": "published", "order": "desc", "from_date": "2024-01-01"},
        "fetch_limit": 10,
    },

    # ═══════════════════════════════════════════════════════════
    # RSS（arXiv 每日推送）
    # ═══════════════════════════════════════════════════════════
    {
        "name": "arXiv RSS · cs.CV 每日",
        "source_kind": "rss",
        "query": "https://rss.arxiv.org/rss/cs.CV",
        "config": {"feed_url": "https://rss.arxiv.org/rss/cs.CV"},
        "fetch_limit": 15,
    },
    {
        "name": "arXiv RSS · eess.IV 医学影像",
        "source_kind": "rss",
        "query": "https://rss.arxiv.org/rss/eess.IV",
        "config": {"feed_url": "https://rss.arxiv.org/rss/eess.IV"},
        "fetch_limit": 15,
    },

    # ═══════════════════════════════════════════════════════════
    # OpenReview（顶会）
    # ═══════════════════════════════════════════════════════════
    {
        "name": "OpenReview · CVPR 2025",
        "source_kind": "openreview",
        "query": "",
        "config": {"venue": "CVPR.cc/2025/Conference"},
        "fetch_limit": 10,
    },
    {
        "name": "OpenReview · MICCAI 2025",
        "source_kind": "openreview",
        "query": "",
        "config": {"venue": "MICCAI.org/2025/Conference"},
        "fetch_limit": 10,
    },
    {
        "name": "OpenReview · NeurIPS 2025 扩散",
        "source_kind": "openreview",
        "query": "diffusion",
        "config": {"venue": "NeurIPS.cc/2025/Conference"},
        "fetch_limit": 10,
    },

    # ═══════════════════════════════════════════════════════════
    # HF Papers（每日精选）
    # ═══════════════════════════════════════════════════════════
    {
        "name": "HuggingFace Daily Papers",
        "source_kind": "hf_papers",
        "query": "",
        "config": {},
        "fetch_limit": 10,
    },
]


def main():
    with Session(engine) as session:
        existing_names = set(
            session.exec(select(Subscription.name)).all()
        )

        added = 0
        skipped = 0
        for sub_data in SUBSCRIPTIONS:
            if sub_data["name"] in existing_names:
                print(f"  跳过（已存在）: {sub_data['name']}")
                skipped += 1
                continue

            sub = Subscription(
                name=sub_data["name"],
                type=sub_data["source_kind"],
                source_kind=sub_data["source_kind"],
                display_name=sub_data["name"],
                query=sub_data.get("query", ""),
                config_json=json.dumps(sub_data.get("config", {}), ensure_ascii=False),
                fetch_limit=sub_data.get("fetch_limit", 10),
            )
            session.add(sub)
            print(f"  ✓ 添加: {sub_data['name']}")
            added += 1

        session.commit()
        print(f"\n完成！新增 {added} 个订阅，跳过 {skipped} 个已存在的。")


if __name__ == "__main__":
    main()
