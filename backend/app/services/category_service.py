import re
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.models.category import Category
from app.models.category_alias import CategoryAlias
from app.models.paper import CategoryStatus, Paper


DEFAULT_CATEGORY_DEFINITIONS = [
    {
        "name": "待确认",
        "slug": "待确认",
        "description": "分类置信度不足或等待人工确认的论文。",
        "aliases": ["待确认", "未分类", "pending", "review"],
        "is_pending_bucket": True,
        "sort_order": 0,
    },
    {
        "name": "大语言模型",
        "slug": "大语言模型",
        "description": "LLM、agent、推理与语言智能相关论文。",
        "aliases": ["大语言模型", "语言模型", "llm", "large language model", "agent", "foundation model"],
        "sort_order": 10,
    },
    {
        "name": "强化学习",
        "slug": "强化学习",
        "description": "强化学习、策略优化与决策控制相关论文。",
        "aliases": ["强化学习", "reinforcement learning", "rl", "policy optimization", "decision making"],
        "sort_order": 20,
    },
    {
        "name": "扩散与生成",
        "slug": "扩散与生成",
        "description": "扩散模型、生成模型与合成内容相关论文。",
        "aliases": ["扩散", "扩散模型", "生成模型", "diffusion", "generative model", "generation"],
        "sort_order": 30,
    },
    {
        "name": "多模态",
        "slug": "多模态",
        "description": "视觉语言、音视频与跨模态理解生成相关论文。",
        "aliases": ["多模态", "multimodal", "vision language", "vlm", "audio visual"],
        "sort_order": 40,
    },
    {
        "name": "计算机视觉",
        "slug": "计算机视觉",
        "description": "图像、视频、检测、分割等视觉相关论文。",
        "aliases": ["计算机视觉", "computer vision", "vision", "image", "video", "segmentation", "detection"],
        "sort_order": 50,
    },
    {
        "name": "时间序列",
        "slug": "时间序列",
        "description": "时间序列分析、预测与时序建模相关论文。",
        "aliases": ["时间序列", "时序预测", "time series", "forecasting", "temporal modeling"],
        "sort_order": 60,
    },
    {
        "name": "物理信息机器学习",
        "slug": "物理信息机器学习",
        "description": "PINN、科学机器学习与物理约束学习相关论文。",
        "aliases": ["物理信息机器学习", "physics informed", "physics-informed", "pinn", "scientific machine learning"],
        "sort_order": 70,
    },
    {
        "name": "物理模拟",
        "slug": "物理模拟",
        "description": "物理仿真、模拟器与基于模拟的学习相关论文。",
        "aliases": ["物理模拟", "physics simulator", "physics simulation", "simulator", "simulation"],
        "sort_order": 80,
    },
    {
        "name": "状态空间模型",
        "slug": "状态空间模型",
        "description": "SSM、Mamba 与状态空间建模相关论文。",
        "aliases": ["状态空间模型", "state space model", "ssm", "mamba"],
        "sort_order": 90,
    },
    {
        "name": "科学推理",
        "slug": "科学推理",
        "description": "科学发现、推理与科研辅助相关论文。",
        "aliases": ["科学推理", "scientific reasoning", "reasoning", "discovery", "science agent"],
        "sort_order": 100,
    },
    {
        "name": "系统与边缘",
        "slug": "系统与边缘",
        "description": "系统优化、部署、推理系统与边缘计算相关论文。",
        "aliases": ["系统与边缘", "边缘计算", "edge computing", "systems", "inference system", "deployment"],
        "sort_order": 110,
    },
    {
        "name": "其他",
        "slug": "其他",
        "description": "无法归入其他受控目录的论文。",
        "aliases": ["其他", "other", "misc"],
        "sort_order": 999,
    },
]


def normalize_alias(value: str) -> str:
    collapsed = re.sub(r"[\s\-_:/]+", " ", value.strip().lower())
    return collapsed


def slugify_category_name(name: str) -> str:
    return re.sub(r"\s+", "-", name.strip().lower())


def list_categories(session: Session, *, active_only: bool = False) -> list[Category]:
    query = select(Category)
    if active_only:
        query = query.where(Category.is_active == True)  # noqa: E712
    return list(session.exec(query.order_by(Category.sort_order.asc(), Category.name.asc())).all())


def get_pending_category(session: Session) -> Category:
    category = session.exec(
        select(Category).where(Category.is_pending_bucket == True)  # noqa: E712
    ).first()
    if category is None:
        raise RuntimeError("Pending category bucket is not initialized")
    return category


def get_category_aliases(session: Session, category_ids: list[int] | None = None) -> dict[int, list[str]]:
    if category_ids == []:
        return {}
    query = select(CategoryAlias)
    if category_ids:
        query = query.where(CategoryAlias.category_id.in_(category_ids))
    aliases = list(session.exec(query).all())
    mapping: dict[int, list[str]] = {}
    for alias in aliases:
        mapping.setdefault(alias.category_id, []).append(alias.alias)
    return mapping


def ensure_default_categories(session: Session) -> None:
    existing = {category.slug: category for category in list_categories(session)}
    existing_aliases = {
        (alias.category_id, alias.normalized_alias): alias
        for alias in session.exec(select(CategoryAlias)).all()
    }
    has_changes = False

    for definition in DEFAULT_CATEGORY_DEFINITIONS:
        slug = definition["slug"]
        category = existing.get(slug)
        if category is None:
            category = Category(
                name=definition["name"],
                slug=slug,
                description=definition["description"],
                is_system=True,
                is_active=True,
                is_pending_bucket=definition.get("is_pending_bucket", False),
                sort_order=definition["sort_order"],
            )
            session.add(category)
            session.flush()
            existing[slug] = category
            has_changes = True
        else:
            updated = False
            for field in ["description", "sort_order"]:
                new_value = definition[field]
                if getattr(category, field) != new_value:
                    setattr(category, field, new_value)
                    updated = True
            if category.is_system is not True:
                category.is_system = True
                updated = True
            if category.is_pending_bucket != definition.get("is_pending_bucket", False):
                category.is_pending_bucket = definition.get("is_pending_bucket", False)
                updated = True
            if updated:
                category.updated_at = datetime.now(timezone.utc)
                session.add(category)
                has_changes = True

        for alias_text in definition["aliases"]:
            normalized = normalize_alias(alias_text)
            key = (category.id, normalized)
            if key in existing_aliases:
                continue
            alias = CategoryAlias(
                category_id=category.id,
                alias=alias_text,
                normalized_alias=normalized,
            )
            session.add(alias)
            existing_aliases[key] = alias
            has_changes = True

    if has_changes:
        session.commit()


def create_category(session: Session, name: str, description: str = "") -> Category:
    normalized_name = name.strip()
    if not normalized_name:
        raise ValueError("分类名称不能为空")

    slug = slugify_category_name(normalized_name)
    if session.exec(select(Category).where(Category.slug == slug)).first() is not None:
        raise ValueError("分类名称已存在")

    category = Category(
        name=normalized_name,
        slug=slug,
        description=description.strip(),
        is_system=False,
        is_active=True,
        sort_order=500,
    )
    session.add(category)
    session.flush()
    session.add(
        CategoryAlias(
            category_id=category.id,
            alias=normalized_name,
            normalized_alias=normalize_alias(normalized_name),
        )
    )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise ValueError("分类名称已存在") from exc
    session.refresh(category)
    return category


def update_paper_category(
    session: Session,
    paper: Paper,
    category: Category,
    *,
    confidence: float,
    status: str,
    reason: str,
) -> Paper:
    paper.primary_category_id = category.id
    paper.category_confidence = round(float(confidence), 2)
    paper.category_status = status
    paper.category_reason = reason
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


def initialize_pending_category(session: Session, paper: Paper, *, reason: str) -> None:
    pending = get_pending_category(session)
    paper.primary_category_id = pending.id
    paper.category_confidence = 0.0
    paper.category_status = CategoryStatus.PENDING_REVIEW
    paper.category_reason = reason


def list_categories_with_counts(session: Session) -> list[dict]:
    categories = list_categories(session)
    papers = list(session.exec(select(Paper)).all())

    direct_counts: dict[int, int] = {}
    pending_counts: dict[int, int] = {}
    for paper in papers:
        if paper.primary_category_id is None:
            continue
        direct_counts[paper.primary_category_id] = direct_counts.get(paper.primary_category_id, 0) + 1
        if paper.category_status == CategoryStatus.PENDING_REVIEW:
            pending_counts[paper.primary_category_id] = pending_counts.get(paper.primary_category_id, 0) + 1

    results: list[dict] = []
    for category in categories:
        results.append(
            {
                "id": category.id,
                "name": category.name,
                "slug": category.slug,
                "parent_id": category.parent_id,
                "description": category.description,
                "is_system": category.is_system,
                "is_active": category.is_active,
                "is_pending_bucket": category.is_pending_bucket,
                "sort_order": category.sort_order,
                "paper_count": direct_counts.get(category.id, 0),
                "pending_count": pending_counts.get(category.id, 0),
            }
        )
    return results


def backfill_uncategorized_papers(session: Session) -> None:
    uncategorized = list(
        session.exec(select(Paper).where(Paper.primary_category_id == None)).all()  # noqa: E711
    )
    if not uncategorized:
        return

    categories = [category for category in list_categories(session, active_only=True) if not category.is_pending_bucket]
    alias_map = get_category_aliases(session, [category.id for category in categories])
    normalized_lookup: dict[str, Category] = {}
    for category in categories:
        for alias in [category.name, *alias_map.get(category.id, [])]:
            normalized_lookup[normalize_alias(alias)] = category

    pending = get_pending_category(session)
    has_changes = False

    for paper in uncategorized:
        matched_category = None
        for tag in paper.tags:
            matched_category = normalized_lookup.get(normalize_alias(tag))
            if matched_category is not None:
                break
        if matched_category is None:
            paper.primary_category_id = pending.id
            paper.category_confidence = 0.0
            paper.category_status = CategoryStatus.PENDING_REVIEW
            paper.category_reason = "Waiting for summary and classification."
        else:
            paper.primary_category_id = matched_category.id
            paper.category_confidence = 0.68
            paper.category_status = CategoryStatus.AUTO_CONFIRMED
            paper.category_reason = "Migrated from existing research tags."
        session.add(paper)
        has_changes = True

    if has_changes:
        session.commit()
