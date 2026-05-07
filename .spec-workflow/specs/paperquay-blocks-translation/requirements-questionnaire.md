# PaperQuay Phase 3 Requirements Questionnaire

> Scope: MinerU structured blocks, PDF/region linkage, and translation cache.
> Fill P0/P1 before implementation. P2 can remain open for later refinement.

## A. Scope and Rollout

1. P0: Phase 3 should ship as an incremental extension to the existing web app, not a desktop rewrite: yes/no = ___
2. P0: Phase 3 should exclude Agent library operations and Zotero import until a separate Phase 4 spec: yes/no = ___
3. P0: Initial block support should use existing MinerU parse tasks rather than a new parser: yes/no = ___
4. P0: Existing PDF/Markdown reader must remain usable if block extraction fails: yes/no = ___
5. P0: Translation must require explicit user action, not automatic full-library translation: yes/no = ___
6. P0: All new API endpoints must remain behind existing authentication: yes/no = ___
7. P1: Should Phase 3 be enabled by default for all parsed papers? answer = ___
8. P1: Should legacy papers be re-parsed to populate blocks automatically? answer = ___
9. P1: Maximum acceptable first implementation scope: blocks only / blocks+translation / blocks+translation+PDF link = ___
10. P1: Success demo paper count for acceptance: 1 / 5 / 20 / other = ___

## B. MinerU Structured Output

11. P0: Store block page index from MinerU output: yes/no = ___
12. P0: Store normalized bbox coordinates from MinerU output: yes/no = ___
13. P0: Store block type such as text/title/table/image/list/code/formula: yes/no = ___
14. P0: Store original source JSON for debugging and future compatibility: yes/no = ___
15. P0: Preserve raw markdown output exactly as Phase 2 currently does: yes/no = ___
16. P1: Store lines/spans separately or inside block source JSON only? answer = ___
17. P1: Should tables be stored as HTML, Markdown, raw JSON, or all available forms? answer = ___
18. P1: Should image/chart blocks show extracted image references when MinerU provides them? answer = ___
19. P1: Should equations be stored separately from surrounding text? answer = ___
20. P1: Should references/bibliography blocks be marked as a special subtype? answer = ___
21. P1: Should headers/footers/page numbers be hidden by default? answer = ___
22. P1: Should low-confidence or unknown block types remain visible? answer = ___
23. P2: Expected support for MinerU pipeline backend output version: ___
24. P2: Expected support for MinerU VLM backend output version: ___
25. P2: Should block extraction retry use the current parse retry action? answer = ___

## C. Storage and Migration

26. P0: Add new tables for blocks and translations instead of embedding everything into `paper_content`: yes/no = ___
27. P0: Migrations must be additive and non-destructive: yes/no = ___
28. P0: Existing papers must keep their current statuses after migration: yes/no = ___
29. P0: Deleting a paper should delete its blocks and translations: yes/no = ___
30. P1: Should replacing parse output delete old blocks before inserting new blocks? answer = ___
31. P1: Should translations become stale when block source text changes? answer = ___
32. P1: Should source JSON be stored in SQLite text columns or file paths? answer = ___
33. P1: Max block count per paper to optimize for in Phase 3: 500 / 2000 / 10000 / other = ___
34. P1: Max translation records per paper expected: ___
35. P2: Should block records include reading order groups/sections? answer = ___

## D. Backend API

36. P0: Add `GET /papers/{id}/blocks` for block list retrieval: yes/no = ___
37. P0: Add page/type/search filters for block list retrieval: yes/no = ___
38. P0: Add `POST /papers/{id}/blocks/rebuild` only if parse output already exists: yes/no = ___
39. P0: Add `POST /papers/{id}/blocks/{block_id}/translate` for explicit translation: yes/no = ___
40. P0: Return cached translation without calling the model if source hash/model/language match: yes/no = ___
41. P1: Translation target language default: Chinese / English / user selectable = ___
42. P1: Translation model default: existing default / user selectable / backend config only = ___
43. P1: Should translation endpoint support multiple blocks in one request? answer = ___
44. P1: Should failed translations be cached as failed records or only logged? answer = ___
45. P1: Should block API include translation status counts? answer = ___
46. P1: Should block API include neighboring blocks for context? answer = ___
47. P2: Should API support section grouping based on headings? answer = ___
48. P2: Should API support block comments/notes in Phase 3? answer = ___
49. P2: Should API expose block source JSON to normal frontend clients? answer = ___
50. P2: Should API include page dimensions when available? answer = ___

## E. Translation Behavior

51. P0: Translation prompts must never include API keys or local file paths: yes/no = ___
52. P0: Translation must preserve formulas/code/table structure as much as possible: yes/no = ___
53. P0: User notes must not be sent as translation context unless explicitly selected: yes/no = ___
54. P0: Translation cache key must include source hash, target language, model, and prompt version: yes/no = ___
55. P1: Translation output format: plain text / markdown / structured JSON = ___
56. P1: Should table translations preserve original cells? answer = ___
57. P1: Should code blocks be skipped, summarized, or translated comments only? answer = ___
58. P1: Should formulas be left unchanged? answer = ___
59. P1: Should a block translation include title/section context? answer = ___
60. P1: Maximum block text length before chunking: ___
61. P1: Should users be able to force-refresh a cached translation? answer = ___
62. P1: Should failed translation retry keep previous successful translation visible? answer = ___
63. P2: Should full-page translation be supported after block translation? answer = ___
64. P2: Should translation diffs be shown when source changes? answer = ___
65. P2: Should translation support glossary terms? answer = ___

## F. Reader UI and PDF Linkage

66. P0: Reader should gain a structured blocks tab/pane: yes/no = ___
67. P0: Blocks should be filterable by page and type: yes/no = ___
68. P0: Clicking a block should switch/open PDF mode and target the corresponding page when possible: yes/no = ___
69. P0: If exact PDF region highlighting is not feasible in iframe, show page-level linkage first: yes/no = ___
70. P0: Translation controls must be keyboard reachable and labeled: yes/no = ___
71. P1: Preferred layout: block list beside PDF / block list under Markdown / tabbed view = ___
72. P1: Should block cards show bbox/page metadata by default? answer = ___
73. P1: Should table/image blocks be visually distinct? answer = ___
74. P1: Should translation appear inline under each block or in side-by-side columns? answer = ___
75. P1: Should long blocks collapse by default? answer = ___
76. P1: Should translated blocks be searchable? answer = ___
77. P1: Should block type counts appear in reader toolbar? answer = ___
78. P2: Should region overlay be implemented with a PDF.js viewer instead of iframe? answer = ___
79. P2: Should block reading order be manually adjustable? answer = ___
80. P2: Should users be able to export translated blocks? answer = ___

## G. Error Handling and Recovery

81. P0: If MinerU returns no structured file, show a clear no-blocks state: yes/no = ___
82. P0: If a structured file is malformed, keep Markdown/PDF usable: yes/no = ___
83. P0: If translation fails, preserve block display and show retry: yes/no = ___
84. P0: If a cached translation is stale, label it clearly: yes/no = ___
85. P1: Should malformed individual blocks be skipped or stored as `unknown`? answer = ___
86. P1: Should rebuild failures change paper parse status? answer = ___
87. P1: Should translation failures create task records? answer = ___
88. P1: Should users see model/provider error details or a short safe message? answer = ___
89. P2: Should users be able to report bad block segmentation? answer = ___
90. P2: Should block extraction be manually reversible? answer = ___

## H. Security and Privacy

91. P0: Frontend must never receive raw local PDF file paths beyond existing contract: yes/no = ___
92. P0: Translation requests must be server-side only: yes/no = ___
93. P0: New endpoints must use parameterized queries/SQLModel filters only: yes/no = ___
94. P0: Do not render untrusted raw HTML from blocks without sanitization: yes/no = ___
95. P1: Should raw source JSON be downloadable by authenticated users? answer = ___
96. P1: Should translation provider/model names be visible in UI? answer = ___
97. P1: Should block content be redacted in logs? answer = ___
98. P2: Should per-paper translation disable switch exist? answer = ___
99. P2: Should admin-only settings control translation provider? answer = ___
100. P2: Should exported translations include model metadata? answer = ___

## I. Testing and Acceptance

101. P0: Migration tests must prove existing databases gain new tables safely: yes/no = ___
102. P0: Parser tests must cover stored text/table/image/list/code blocks: yes/no = ___
103. P0: API tests must cover block retrieval and translation cache hits: yes/no = ___
104. P0: Frontend tests must cover no-blocks, block list, translate success/failure, and PDF page action: yes/no = ___
105. P0: Build must pass before marking tasks complete: yes/no = ___
106. P1: Should smoke test use real MinerU output fixture or synthetic fixture? answer = ___
107. P1: Should translation tests mock the model client only? answer = ___
108. P1: Required browser widths for responsive checks: 375/768/1024/1440 or other = ___
109. P1: Should tests assert no raw HTML injection from block content? answer = ___
110. P1: Should performance tests include 2000 synthetic blocks? answer = ___

## J. Phase 4 Handoff Boundaries

111. P0: Agent library operations are out of Phase 3: yes/no = ___
112. P0: Zotero import is out of Phase 3: yes/no = ___
113. P0: Phase 3 should record enough block/translation provenance for later Agent tools: yes/no = ___
114. P0: Phase 3 should not introduce destructive bulk operations: yes/no = ___
115. P1: Which Phase 4 should follow first: Agent operations / Zotero import / both in parallel = ___
116. P1: Should Agent be allowed to translate blocks using Phase 3 cache later? answer = ___
117. P1: Should Zotero imported PDFs immediately enter block extraction later? answer = ___
118. P2: Should Phase 4 require an audit log table shared with translation tasks? answer = ___
119. P2: Should Phase 4 define a permission model beyond current app password? answer = ___
120. P2: Any Phase 3 item that must be excluded before coding: ___
