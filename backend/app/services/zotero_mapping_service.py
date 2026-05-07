"""Zotero SQLite 数据读取和映射服务。

从 Zotero SQLite 数据库中扫描文献条目，提取元数据、作者、分类、标签和附件信息，
并将其映射为规范化的候选项格式。
"""

import re
import sqlite3
from typing import Any


class ZoteroMappingService:
    """Zotero SQLite → 规范化候选项映射器。"""

    # 支持的 Zotero 文献类型
    SUPPORTED_TYPES = {
        "journalArticle",
        "conferencePaper",
        "bookSection",
        "thesis",
        "preprint",
        "report",
        "book",
        "magazineArticle",
        "newspaperArticle",
        "webpage",
        "presentation",
        "manuscript",
        "document",
        "interview",
        "film",
        "artwork",
        "audioRecording",
        "videoRecording",
        "computerProgram",
        "case",
        "email",
        "forumPost",
        "instantMessage",
        "map",
        "patent",
        "podcast",
        "radioBroadcast",
        "tvBroadcast",
        "statute",
        "bill",
        "hearing",
        "encyclopediaArticle",
        "dictionaryEntry",
    }

    # 明确不支持的（附件、笔记、标注）——默认跳过
    SKIP_TYPES = {"attachment", "note", "annotation"}

    def scan_items(self, conn: sqlite3.Connection) -> list[dict]:
        """扫描 Zotero SQLite 数据库中的非附件/笔记类条目的元数据。

        返回 list[dict]，每个 dict 包含：
        - item_id, item_key, item_type
        - title, creators (list of {firstName, lastName})
        - abstract_note, doi, url, publication_title, date, year
        - collections (list[str]), tags (list[str])
        - attachment_path, attachment_mime_type
        - warning_message
        """
        tables = self._get_table_set(conn)
        items = []

        # 获取 itemTypes（JSON 字段名映射）
        if "itemTypes" not in tables:
            return items

        # 获取要排除的类型 ID
        excluded_type_ids = self._get_type_ids(conn, self.SKIP_TYPES)
        if not excluded_type_ids:
            # 没找到排除类型，也不会有常规类型
            return items

        # 查询非排除类型的 items
        placeholders = ",".join("?" for _ in excluded_type_ids)
        try:
            rows = conn.execute(
                f"""SELECT i.itemID, i.key, it.typeName
                    FROM items i
                    JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
                    WHERE i.itemTypeID NOT IN ({placeholders})
                    ORDER BY i.itemID""",
                list(excluded_type_ids),
            ).fetchall()
        except sqlite3.Error:
            return items

        for row in rows:
            item_id, item_key, item_type = row
            item: dict[str, Any] = {
                "item_id": item_id,
                "item_key": item_key,
                "item_type": item_type,
                "title": "",
                "creators": [],
                "abstract_note": "",
                "doi": "",
                "url": "",
                "publication_title": "",
                "date": "",
                "year": None,
                "collections": [],
                "tags": [],
                "attachment_path": "",
                "attachment_mime_type": "",
                "warning_message": "",
            }

            # ── 字段值 (title, abstractNote, DOI, url, date, publicationTitle) ──
            if "itemData" in tables and "itemDataValues" in tables and "fields" in tables:
                self._fill_fields(conn, item_id, item)

            # ── 作者 ──
            if "creators" in tables and "creatorData" in tables:
                self._fill_creators(conn, item_id, item)

            # ── 分类 (collections) ──
            if "collectionItems" in tables and "collections" in tables:
                self._fill_collections(conn, item_id, item)

            # ── 标签 ──
            if "itemTags" in tables and "tags" in tables:
                self._fill_tags(conn, item_id, item)

            # ── 附件 ──
            if "itemAttachments" in tables:
                self._fill_attachments(conn, item_id, item, tables)

            # 不支持的类型标记
            if item_type not in self.SUPPORTED_TYPES:
                item["warning_message"] = f"不支持的文献类型: {item_type}"

            items.append(item)

        return items

    def map_candidate(self, item: dict) -> dict:
        """将原始 Zotero 条目映射为规范化的候选项字典。

        返回 dict 包含：
        - mapped_title, mapped_authors, mapped_year
        - mapped_doi, mapped_url, mapped_venue
        - mapped_abstract_note, mapped_publication_title
        - mapped_collections (list[str]), mapped_tags (list[str])
        - attachment_path, attachment_exists
        - source_key, zotero_item_type, warning_message
        """
        # 作者格式化: "LastName1 FirstName1; LastName2 FirstName2"
        creators = item.get("creators", [])
        author_parts = []
        for c in creators:
            last = (c.get("lastName") or "").strip()
            first = (c.get("firstName") or "").strip()
            if last or first:
                author_parts.append(f"{last} {first}".strip())
        mapped_authors = "; ".join(author_parts)

        # 年份提取
        date_str = (item.get("date") or "").strip()
        year = None
        if date_str:
            year = self._extract_year(date_str)

        # 附件检查
        attachment_path = (item.get("attachment_path") or "").strip()

        mapped = {
            "mapped_title": (item.get("title") or "").strip(),
            "mapped_authors": mapped_authors,
            "mapped_year": year,
            "mapped_doi": (item.get("doi") or "").strip(),
            "mapped_url": (item.get("url") or "").strip(),
            "mapped_venue": (item.get("publication_title") or "").strip(),
            "mapped_abstract_note": (item.get("abstract_note") or "").strip(),
            "mapped_publication_title": (item.get("publication_title") or "").strip(),
            "mapped_collections": item.get("collections", []),
            "mapped_tags": item.get("tags", []),
            "attachment_path": attachment_path,
            "attachment_exists": False,  # 将在 import service 中检查
            "source_key": (item.get("item_key") or "").strip(),
            "zotero_item_type": (item.get("item_type") or "").strip(),
            "warning_message": (item.get("warning_message") or "").strip(),
        }
        return mapped

    # ── 内部辅助方法 ──

    def _get_table_set(self, conn: sqlite3.Connection) -> set[str]:
        try:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
            return {r[0] for r in rows}
        except sqlite3.Error:
            return set()

    def _get_type_ids(self, conn: sqlite3.Connection, type_names: set[str]) -> set[int]:
        """获取指定类型名称对应的 itemTypeID。"""
        try:
            placeholders = ",".join("?" for _ in type_names)
            rows = conn.execute(
                f"SELECT itemTypeID FROM itemTypes WHERE typeName IN ({placeholders})",
                list(type_names),
            ).fetchall()
            return {r[0] for r in rows}
        except sqlite3.Error:
            return set()

    def _fill_fields(self, conn: sqlite3.Connection, item_id: int, item: dict) -> None:
        """填充文献字段：title, abstractNote, DOI, url, date, publicationTitle。"""
        try:
            rows = conn.execute(
                """SELECT f.fieldName, idv.value
                   FROM itemData id
                   JOIN fields f ON id.fieldID = f.fieldID
                   JOIN itemDataValues idv ON id.valueID = idv.valueID
                   WHERE id.itemID = ?""",
                (item_id,),
            ).fetchall()
        except sqlite3.Error:
            return

        for field_name, value in rows:
            if value is None:
                continue
            if field_name == "title":
                item["title"] = value
            elif field_name == "abstractNote":
                item["abstract_note"] = value
            elif field_name == "DOI":
                item["doi"] = value
            elif field_name == "url":
                item["url"] = value
            elif field_name == "date":
                item["date"] = value
            elif field_name == "publicationTitle":
                item["publication_title"] = value

    def _fill_creators(self, conn: sqlite3.Connection, item_id: int, item: dict) -> None:
        """填充作者列表。"""
        try:
            rows = conn.execute(
                """SELECT cd.firstName, cd.lastName
                   FROM creators c
                   JOIN creatorData cd ON c.creatorDataID = cd.creatorDataID
                   JOIN creatorTypes ct ON c.creatorTypeID = ct.creatorTypeID
                   WHERE c.itemID = ? AND ct.creatorType = 'author'
                   ORDER BY c.orderIndex""",
                (item_id,),
            ).fetchall()
        except sqlite3.Error:
            return

        item["creators"] = [
            {"firstName": (row[0] or ""), "lastName": (row[1] or "")}
            for row in rows
        ]

    def _fill_collections(self, conn: sqlite3.Connection, item_id: int, item: dict) -> None:
        """填充所属分类列表。"""
        try:
            rows = conn.execute(
                """SELECT col.collectionName
                   FROM collectionItems ci
                   JOIN collections col ON ci.collectionID = col.collectionID
                   WHERE ci.itemID = ?
                   ORDER BY col.collectionName""",
                (item_id,),
            ).fetchall()
        except sqlite3.Error:
            return

        item["collections"] = [r[0] for r in rows if r[0]]

    def _fill_tags(self, conn: sqlite3.Connection, item_id: int, item: dict) -> None:
        """填充标签列表。"""
        try:
            rows = conn.execute(
                """SELECT t.name
                   FROM itemTags it
                   JOIN tags t ON it.tagID = t.tagID
                   WHERE it.itemID = ?
                   ORDER BY t.name""",
                (item_id,),
            ).fetchall()
        except sqlite3.Error:
            return

        item["tags"] = [r[0] for r in rows if r[0]]

    def _fill_attachments(self, conn: sqlite3.Connection, item_id: int, item: dict, tables: set) -> None:
        """填充附件信息（查找子附件项）。"""
        try:
            # 附件是独立的 items，其 parentItemID 指向父文献
            # 需要找到 itemTypeID=attachment 的子项
            attach_type_ids = self._get_type_ids(conn, {"attachment"})
            if not attach_type_ids:
                return

            aid_placeholders = ",".join("?" for _ in attach_type_ids)
            rows = conn.execute(
                f"""SELECT ia.path, ia.contentType
                    FROM items att
                    JOIN itemAttachments ia ON att.itemID = ia.itemID
                    WHERE att.parentItemID = ?
                      AND att.itemTypeID IN ({aid_placeholders})
                      AND ia.path IS NOT NULL AND ia.path != ''
                    LIMIT 1""",
                [item_id] + list(attach_type_ids),
            ).fetchall()
        except sqlite3.Error:
            return

        if rows:
            item["attachment_path"] = rows[0][0] or ""
            item["attachment_mime_type"] = rows[0][1] or ""

    def _extract_year(self, date_str: str) -> int | None:
        """从日期字符串中提取年份。"""
        # 纯年份
        m = re.match(r"^(\d{4})$", date_str)
        if m:
            return int(m.group(1))

        # YYYY-MM-DD 或 YYYY/MM/DD
        m = re.match(r"^(\d{4})[-/]\d{2}[-/]\d{2}", date_str)
        if m:
            return int(m.group(1))

        # YYYY-MM 或 YYYY/MM
        m = re.match(r"^(\d{4})[-/]\d{2}", date_str)
        if m:
            return int(m.group(1))

        # 尝试匹配任何位置的 4 位年份
        m = re.search(r"(\d{4})", date_str)
        if m:
            year = int(m.group(1))
            if 1500 <= year <= 3000:
                return year

        return None
