"""构建最小化 Zotero 格式的 SQLite 数据库，用于测试。

模拟 Zotero 6/7 的 SQLite schema 核心表：
- items, itemTypes, fields, itemDataValues, itemData
- creators, creatorData, creatorTypes
- collections, collectionItems
- tags, itemTags
- itemAttachments, itemNotes
"""

import sqlite3
from pathlib import Path


def build_minimal_zotero_db(db_path: Path) -> None:
    """创建一个最小 Zotero 数据库，包含 3 篇论文。

    项目类型：
    - #4: journalArticle
    - #5: conferencePaper
    - #3: bookSection
    - #1: note
    - #14: attachment (Zotero 5/6/7)

    字段 ID：
    - 1: title
    - 2: abstractNote
    - 3: DOI
    - 4: url
    - 5: date
    - 6: publicationTitle
    """
    conn = sqlite3.connect(str(db_path))
    c = conn.cursor

    # ── itemTypes ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS itemTypes (
            itemTypeID INTEGER PRIMARY KEY,
            typeName TEXT NOT NULL,
            displayName TEXT NOT NULL
        )
        """
    )
    c().executemany(
        "INSERT INTO itemTypes VALUES (?, ?, ?)",
        [
            (1, "note", "Note"),
            (2, "book", "Book"),
            (3, "bookSection", "Book Section"),
            (4, "journalArticle", "Journal Article"),
            (5, "conferencePaper", "Conference Paper"),
            (6, "newspaperArticle", "Newspaper Article"),
            (7, "thesis", "Thesis"),
            (14, "attachment", "Attachment"),
        ],
    )

    # ── fields ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS fields (
            fieldID INTEGER PRIMARY KEY,
            fieldName TEXT NOT NULL
        )
        """
    )
    c().executemany(
        "INSERT INTO fields VALUES (?, ?)",
        [
            (1, "title"),
            (2, "abstractNote"),
            (3, "DOI"),
            (4, "url"),
            (5, "date"),
            (6, "publicationTitle"),
        ],
    )

    # ── creatorTypes ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS creatorTypes (
            creatorTypeID INTEGER PRIMARY KEY,
            creatorType TEXT NOT NULL
        )
        """
    )
    c().executemany(
        "INSERT INTO creatorTypes VALUES (?, ?)",
        [
            (1, "author"),
            (2, "editor"),
        ],
    )

    # ── itemDataValues ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS itemDataValues (
            valueID INTEGER PRIMARY KEY,
            value TEXT
        )
        """
    )
    # valueID mapping:
    # 1: "Deep Learning for NLP"
    # 2: "This paper presents..."
    # 3: "10.1234/dl.nlp.2024"
    # 4: "https://example.com/dl-nlp"
    # 5: "2024-03-15"
    # 6: "Journal of AI Research"
    # 7: "Vision Transformer Survey"
    # 8: "A comprehensive survey..."
    # 9: "10.5678/vit.survey.2023"
    # 10: "https://example.com/vit-survey"
    # 11: "2023"
    # 12: "IEEE Conference on CVPR"
    # 13: "Chapter: Advanced Methods"
    # 14: "An in-depth chapter..."
    # 15: "" (no DOI)
    # 16: "https://example.com/book-chapter"
    # 17: "2022-07-01"
    # 18: "Handbook of ML"
    c().executemany(
        "INSERT INTO itemDataValues VALUES (?, ?)",
        [
            (1, "Deep Learning for NLP"),
            (2, "This paper presents a novel approach to natural language processing using deep transformer models."),
            (3, "10.1234/dl.nlp.2024"),
            (4, "https://example.com/dl-nlp"),
            (5, "2024-03-15"),
            (6, "Journal of AI Research"),
            (7, "Vision Transformer Survey"),
            (8, "A comprehensive survey of vision transformer architectures in computer vision."),
            (9, "10.5678/vit.survey.2023"),
            (10, "https://example.com/vit-survey"),
            (11, "2023"),
            (12, "IEEE Conference on CVPR"),
            (13, "Advanced Methods in ML"),
            (14, "An in-depth chapter exploring advanced machine learning methods."),
            (15, None),
            (16, "https://example.com/book-chapter"),
            (17, "2022-07-01"),
            (18, "Handbook of Machine Learning"),
        ],
    )

    # ── items ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS items (
            itemID INTEGER PRIMARY KEY,
            itemTypeID INTEGER NOT NULL,
            dateAdded TEXT NOT NULL DEFAULT '',
            dateModified TEXT NOT NULL DEFAULT '',
            clientDateModified TEXT NOT NULL DEFAULT '',
            key TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 0,
            synced INTEGER NOT NULL DEFAULT 0,
            parentItemID INTEGER DEFAULT NULL,
            deleted INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    c().executemany(
        "INSERT INTO items (itemID, itemTypeID, key, dateAdded, dateModified, parentItemID) VALUES (?, ?, ?, ?, ?, ?)",
        [
            # 论文 1: journalArticle with full metadata + DOI + attachment
            (1, 4, "JART001", "2024-01-01", "2024-01-01", None),
            # 论文 2: conferencePaper with DOI, no attachment
            (2, 5, "CONF001", "2023-06-01", "2023-06-01", None),
            # 论文 3: bookSection with no DOI, missing attachment
            (3, 3, "BOOK001", "2022-09-01", "2022-09-01", None),
            # 附件 1 (belongs to 论文 1)
            (4, 14, "ATT001", "2024-01-01", "2024-01-01", 1),
            # 附件 2 (belongs to 论文 2 - file doesn't exist)
            (5, 14, "ATT002", "2023-06-01", "2023-06-01", 2),
        ],
    )

    # ── itemData ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS itemData (
            itemID INTEGER NOT NULL,
            fieldID INTEGER NOT NULL,
            valueID INTEGER NOT NULL
        )
        """
    )
    c().executemany(
        "INSERT INTO itemData (itemID, fieldID, valueID) VALUES (?, ?, ?)",
        [
            # 论文 1 (itemID=1)
            (1, 1, 1),   # title
            (1, 2, 2),   # abstractNote
            (1, 3, 3),   # DOI
            (1, 4, 4),   # url
            (1, 5, 5),   # date
            (1, 6, 6),   # publicationTitle
            # 论文 2 (itemID=2)
            (2, 1, 7),   # title
            (2, 2, 8),   # abstractNote
            (2, 3, 9),   # DOI
            (2, 4, 10),  # url
            (2, 5, 11),  # date
            (2, 6, 12),  # publicationTitle
            # 论文 3 (itemID=3)
            (3, 1, 13),  # title
            (3, 2, 14),  # abstractNote
            (3, 3, 15),  # DOI (NULL = no DOI)
            (3, 4, 16),  # url
            (3, 5, 17),  # date
            (3, 6, 18),  # publicationTitle
        ],
    )

    # ── creatorData ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS creatorData (
            creatorDataID INTEGER PRIMARY KEY,
            firstName TEXT DEFAULT '',
            lastName TEXT DEFAULT ''
        )
        """
    )
    c().executemany(
        "INSERT INTO creatorData (creatorDataID, firstName, lastName) VALUES (?, ?, ?)",
        [
            (1, "John", "Smith"),
            (2, "Alice", "Johnson"),
            (3, "Bob", "Lee"),
            (4, "Wei", "Zhang"),
            (5, "Carol", "Brown"),
        ],
    )

    # ── creators (join: items ↔ creatorData via creatorType) ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS creators (
            creatorID INTEGER PRIMARY KEY,
            itemID INTEGER NOT NULL,
            creatorTypeID INTEGER NOT NULL DEFAULT 1,
            creatorDataID INTEGER NOT NULL,
            orderIndex INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    c().executemany(
        "INSERT INTO creators (creatorID, itemID, creatorDataID, creatorTypeID, orderIndex) VALUES (?, ?, ?, ?, ?)",
        [
            (1, 1, 1, 1, 0),  # 论文1作者1: John Smith
            (2, 1, 2, 1, 1),  # 论文1作者2: Alice Johnson
            (3, 2, 3, 1, 0),  # 论文2作者: Bob Lee
            (4, 2, 4, 1, 1),  # 论文2作者: Wei Zhang
            (5, 3, 5, 1, 0),  # 论文3作者: Carol Brown
        ],
    )

    # ── collections ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS collections (
            collectionID INTEGER PRIMARY KEY,
            collectionName TEXT NOT NULL,
            key TEXT NOT NULL,
            parentCollectionID INTEGER DEFAULT NULL
        )
        """
    )
    c().executemany(
        "INSERT INTO collections (collectionID, collectionName, key) VALUES (?, ?, ?)",
        [
            (1, "NLP", "COL001"),
            (2, "Computer Vision", "COL002"),
            (3, "Machine Learning", "COL003"),
        ],
    )

    # ── collectionItems ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS collectionItems (
            collectionID INTEGER NOT NULL,
            itemID INTEGER NOT NULL,
            orderIndex INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    c().executemany(
        "INSERT INTO collectionItems (collectionID, itemID) VALUES (?, ?)",
        [
            (1, 1),  # 论文1 ∈ NLP
            (2, 2),  # 论文2 ∈ Computer Vision
            (3, 1),  # 论文1 ∈ Machine Learning
            (3, 2),  # 论文2 ∈ Machine Learning
            (3, 3),  # 论文3 ∈ Machine Learning
        ],
    )

    # ── tags ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS tags (
            tagID INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            key TEXT NOT NULL DEFAULT ''
        )
        """
    )
    c().executemany(
        "INSERT INTO tags (tagID, name) VALUES (?, ?)",
        [
            (1, "transformer"),
            (2, "deep-learning"),
            (3, "survey"),
            (4, "important"),
        ],
    )

    # ── itemTags ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS itemTags (
            itemID INTEGER NOT NULL,
            tagID INTEGER NOT NULL,
            type INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    c().executemany(
        "INSERT INTO itemTags (itemID, tagID) VALUES (?, ?)",
        [
            (1, 1),  # 论文1 → transformer
            (1, 2),  # 论文1 → deep-learning
            (1, 4),  # 论文1 → important
            (2, 1),  # 论文2 → transformer
            (2, 3),  # 论文2 → survey
        ],
    )

    # ── itemAttachments ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS itemAttachments (
            itemID INTEGER NOT NULL PRIMARY KEY,
            parentItemID INTEGER NOT NULL,
            path TEXT DEFAULT '',
            contentType TEXT DEFAULT '',
            linkMode INTEGER NOT NULL DEFAULT 0,
            mtime TEXT DEFAULT ''
        )
        """
    )
    c().executemany(
        "INSERT INTO itemAttachments (itemID, parentItemID, path, contentType) VALUES (?, ?, ?, ?)",
        [
            (4, 1, "storage:dl_nlp_paper.pdf", "application/pdf"),
            (5, 2, "attach:vit_survey.pdf", "application/pdf"),
        ],
    )

    # ── itemNotes (基本表，可能不存在于老版本；测试兼容性) ──
    c().execute(
        """
        CREATE TABLE IF NOT EXISTS itemNotes (
            itemID INTEGER NOT NULL PRIMARY KEY,
            parentItemID INTEGER NOT NULL DEFAULT 0,
            note TEXT DEFAULT '',
            title TEXT DEFAULT '',
            dateAdded TEXT DEFAULT '',
            dateModified TEXT DEFAULT ''
        )
        """
    )
    # 添加一条笔记（将被跳过）
    c().execute(
        "INSERT INTO itemNotes (itemID, parentItemID, note) VALUES (?, ?, ?)",
        (6, 1, "This is a note on paper 1"),
    )
    # 笔记 item 本身（typeID=1）
    c().execute(
        "INSERT INTO items (itemID, itemTypeID, key, dateAdded, dateModified, parentItemID) VALUES (?, ?, ?, ?, ?, ?)",
        (6, 1, "NOTE001", "2024-01-01", "2024-01-01", 1),
    )

    conn.commit()
    conn.close()
