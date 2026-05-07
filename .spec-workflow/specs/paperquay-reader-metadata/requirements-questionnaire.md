# PaperQuay Reader and Metadata Phase 2 Questionnaire

This questionnaire constrains the next PaperQuay integration phase before coding. It focuses on Reader, richer metadata, favorites, reading state, and user notes. It intentionally excludes MinerU structured blocks, translation cache, Agent operations, and Zotero import unless a future spec promotes them.

## Scope and Rollout

1. Phase 2 must ship behind which route or entry point?
2. Should the existing `/paper/:paperId` route keep showing library detail, or should it redirect to a reader route?
3. Should the reader route be `/paper/:paperId/reader`, `/reader/:paperId`, or another path?
4. Should the first reader view default to Markdown, PDF, or the last-used mode?
5. Should Phase 2 be enabled immediately for all users after deployment?
6. Should there be a feature flag or environment variable to disable the new reader?
7. What is the minimum acceptable Phase 2 completion state for day-to-day use?
8. Which current workflow must remain unchanged during Phase 2?
9. Which existing UI can be removed only after Phase 2 is verified?
10. What should happen if a paper has neither PDF nor Markdown content?

## Metadata Fields

11. Which metadata fields are P0 for editing: title, authors, year, venue, DOI, URL, abstract, source?
12. Which fields are read-only after import?
13. Should `authors` remain a single string in Phase 2?
14. If authors remain a string, what separator should the UI recommend?
15. Should `year` be stored as an integer or derived from `published_at` when empty?
16. Should `venue` support free text only in Phase 2?
17. Should DOI validation be strict, warning-only, or not enforced?
18. Should URL validation allow only HTTP/HTTPS?
19. Should abstract editing update `abstract_raw`, parsed `abstract_md`, or both?
20. Should metadata edits be autosaved or saved through an explicit button?
21. Should invalid metadata block saving all fields or only the invalid field?
22. Should edits record `updated_at` immediately?
23. Should the UI show a dirty state before saving?
24. Should metadata edits be allowed while parse/summarize/embed tasks are running?
25. Should imported subscription papers expose the same metadata editor?

## Favorites

26. Should favorite be a boolean star state?
27. Should favorited papers be filterable from the library list?
28. Should favorites appear in the category sidebar as a virtual bucket?
29. Should favoriting update immediately without a confirmation?
30. Should favorite state appear in daily briefing or recommendations later?
31. Should favorite state be shown in the dense list row?
32. Should favorite state be shown in the metadata panel?
33. Should favorite be editable from keyboard-only interaction?
34. Should favorite changes produce a feedback banner?
35. Should favorite be included in search ranking later?

## Reading State

36. Which reading states are approved: unread, reading, read, skipped?
37. Should a paper start as unread by default?
38. Should opening the reader automatically mark unread papers as reading?
39. Should reaching the bottom of Markdown automatically mark as read?
40. Should PDF scroll progress be tracked in Phase 2?
41. Should Markdown scroll progress be tracked in Phase 2?
42. Should reading progress be an integer percentage from 0 to 100?
43. Should reading state be manually editable from metadata panel?
44. Should reading state be filterable from library list?
45. Should reading state appear in the sidebar counts?
46. Should skipped papers be hidden from default list views?
47. Should reading state changes require confirmation?
48. Should read/skipped papers still appear in recommendations?
49. Should reading state be included in backend API responses for list and detail?
50. Should reading state updates refresh `updated_at`?

## User Notes

51. Should user notes be one free-form Markdown text field in Phase 2?
52. Should notes be stored on `paper` or in a separate `paper_note` table?
53. Should notes autosave after a debounce?
54. Should notes require an explicit Save button?
55. Should notes render Markdown preview in Phase 2?
56. Should notes remain separate from AI-generated summaries?
57. Should notes be searchable in Phase 2?
58. Should notes be visible in the reader side panel?
59. Should notes be visible in the library metadata panel?
60. Should note edit failures preserve unsaved text in the UI?
61. Should note length have a hard limit?
62. Should notes support code blocks and math rendering?
63. Should notes be included in export later?
64. Should notes update the paper `updated_at` timestamp?
65. Should empty notes be stored as an empty string or null?

## Reader Shell

66. Should the reader use a two-pane layout, single-pane tabs, or responsive split?
67. Should the reader show paper metadata in a side panel?
68. Should the reader include a table of contents for Markdown headings?
69. Should the reader include PDF and Markdown mode buttons?
70. Should the reader reuse the existing authenticated `/papers/{id}/pdf` route?
71. Should PDF load errors show a retry button?
72. Should Markdown parse-missing state show a Parse action?
73. Should summary/overview stay visible inside the reader?
74. Should the reader include quick actions for parse, summarize, and embed?
75. Should the reader include a back-to-library button?
76. Should the reader preserve current library filters when returning?
77. Should the reader support keyboard shortcuts in Phase 2?
78. Should the reader show source URL and DOI links?
79. Should the reader allow opening the PDF in a new browser tab?
80. Should the reader revoke PDF blob URLs when switching papers?

## Backend and Migration

81. Which columns are approved for Phase 2 migration?
82. Should migration use the current SQLite-safe `_migrate_add_columns` pattern?
83. Should Phase 2 create any new tables?
84. Should rollback be handled by backup guidance rather than automatic down migration?
85. Should backend tests verify existing rows receive default metadata values?
86. Should list responses include all metadata fields or only detail responses?
87. Should metadata updates use a new route or extend the existing paper update route?
88. Should reading state, favorite, and notes share one update endpoint?
89. Should metadata validation live in route schemas or a service module?
90. Should API errors return field-level validation messages?
91. Should auth behavior remain identical to existing paper routes?
92. Should delete paper behavior delete notes automatically?
93. Should imports prefill year/venue/URL when subscription data already has it?
94. Should upload import confirmation send metadata beyond title in Phase 2?
95. Should a database backup step be documented before applying migration?

## Testing and Acceptance

96. Which backend tests must pass before Phase 2 can be marked complete?
97. Which frontend tests must cover the reader route?
98. Which tests should cover PDF load failure?
99. Which tests should cover Markdown empty/missing state?
100. Which tests should cover favorite toggling?
101. Which tests should cover reading state changes?
102. Which tests should cover notes save failure?
103. Which tests should cover metadata validation?
104. Should production build be required for Phase 2 completion?
105. Should a smoke test import a sample PDF and open it in reader?
106. Should route-level tests verify daily briefing links still enter the library detail first?
107. Should route-level tests verify reader links from metadata panel?
108. Should API wrapper unit tests cover new update payloads?
109. Should migration tests run with an existing SQLite database missing new columns?
110. What exact verification command set is required for final acceptance?

## Deferred Boundaries

111. Should Phase 2 explicitly defer MinerU structured block persistence?
112. Should Phase 2 explicitly defer block-level PDF highlighting?
113. Should Phase 2 explicitly defer translation cache?
114. Should Phase 2 explicitly defer Agent tool operations?
115. Should Phase 2 explicitly defer Zotero import?
116. Should Phase 2 explicitly defer multi-category membership?
117. Should Phase 2 explicitly defer normalized author tables?
118. Should Phase 2 explicitly defer PDF annotation editing?
119. Should Phase 2 explicitly defer export/citation generation?
120. Which deferred item should become Phase 3?
