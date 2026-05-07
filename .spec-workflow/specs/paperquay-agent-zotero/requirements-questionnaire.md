# PaperQuay Phase 4 Requirements Questionnaire

> Answer these questions before coding if an implementing AI model needs stricter product constraints. P0/P1 answers should be treated as binding.

## A. Phase 4 Scope

1. P0. Phase 4 must include Agent only, Zotero only, or both in one delivery?
2. P0. Should Agent and Zotero ship behind a feature flag?
3. P0. Should the legacy `/assistant` route be replaced, extended, or kept unchanged?
4. P0. Which user roles exist in this app today, if any besides the single authenticated user?
5. P0. Are destructive Agent actions such as delete paper explicitly out of scope?
6. P1. Should metadata-only Zotero imports be allowed?
7. P1. Should Zotero import be synchronous for small libraries or always background-task based?
8. P1. Should Agent execution be synchronous or task-based?
9. P1. Should Phase 4 include browser-side file picker UX for Zotero source paths, or a typed path field only?
10. P2. What wording should the navigation use: Agent, Library Agent, Research Agent, or 文库 Agent?

## B. Agent Scope and Context

11. P0. What is the default Agent scope: whole library, selected category, selected papers, or current reader paper?
12. P0. Should users be able to pin papers into the Agent scope manually?
13. P0. Should Agent tool access include full markdown, summarized markdown, or block snippets only?
14. P0. What maximum number of papers can a single Agent run inspect?
15. P0. What maximum text length can be sent to the model per run?
16. P1. Should semantic search results be included automatically for every Agent prompt?
17. P1. Should current reader block context be included when launched from reader?
18. P1. Should Agent be allowed to inspect cached translations?
19. P1. Should Agent be allowed to inspect user notes?
20. P2. Should the UI show exact tool result snippets or only high-level trace summaries?

## C. Agent Models and Prompting

21. P0. Which model should be the default Agent model?
22. P0. Which models are allowed for Agent runs?
23. P0. Should users be allowed to choose model per run?
24. P0. Should the frontend be allowed to send custom system instructions?
25. P0. What language should Agent responses use by default?
26. P1. Should Agent produce JSON-only action proposals, natural language plus JSON, or server-validated tool calls?
27. P1. Should failed model JSON be repair-parsed or rejected?
28. P1. Should prompt versions be persisted on Agent runs?
29. P1. Should model temperature or reasoning settings be configurable?
30. P2. Should Agent answers include citations to paper ids/titles?

## D. Agent Read-Only Tools

31. P0. Which read-only tools are required: list papers, paper detail, categories, tags, blocks, translations, semantic search?
32. P0. Should read-only tools expose paper abstracts?
33. P0. Should read-only tools expose generated summaries?
34. P0. Should read-only tools expose full markdown?
35. P0. Should read-only tools expose local PDF path? Recommended answer: no.
36. P1. Should read-only tools support category filters?
37. P1. Should read-only tools support reading status filters?
38. P1. Should read-only tools support favorite-only filters?
39. P1. Should read-only tools support tag intersections?
40. P2. Should tool traces be exportable as markdown?

## E. Agent Write Actions

41. P0. Which write actions are allowed: tags, category, favorite, reading status, progress, notes, title, authors, year, venue, DOI, URL?
42. P0. Should creating categories be allowed?
43. P0. Should renaming categories be allowed?
44. P0. Should merging categories be allowed?
45. P0. Should deleting categories be allowed?
46. P0. Should paper deletion be blocked?
47. P0. Should parsing, summarizing, embedding, and translation triggers be blocked from Agent writes?
48. P1. Should Agent be allowed to append to notes or only replace notes after approval?
49. P1. Should Agent be allowed to remove tags or only add tags?
50. P2. Should Agent be allowed to create saved filters or collections in a later phase?

## F. Confirmation and Risk

51. P0. Which action types require per-action confirmation?
52. P0. Which action types can be batch-approved?
53. P0. Should high-risk actions be disabled by default?
54. P0. Should users type a confirmation phrase for batch operations?
55. P0. Should before/after values be mandatory in every proposal?
56. P1. What risk levels should be used: low, medium, high, irreversible?
57. P1. Should confidence scores be shown to users?
58. P1. Should the user be able to edit a proposal before approval?
59. P1. Should rejected proposals be hidden, collapsed, or kept visible?
60. P2. Should confirmation UI support keyboard shortcuts?

## G. Audit and Revert

61. P0. How long should Agent audit records be retained?
62. P0. Should audit records survive paper deletion with safe textual summaries?
63. P0. Should revert be available for scalar metadata changes?
64. P0. Should revert be available for tag/category changes?
65. P0. Should revert be disabled when target values have changed since execution?
66. P1. Should audit events be searchable?
67. P1. Should audit events be filterable by action type?
68. P1. Should audit events be filterable by paper?
69. P1. Should audit records include model/tool input summaries?
70. P2. Should audit reports be exportable?

## H. Zotero Source and Safety

71. P0. Will users provide a direct `zotero.sqlite` path?
72. P0. Should the app try to auto-detect common Zotero profile locations?
73. P0. Should original Zotero DB ever be opened directly? Recommended answer: no, copy first.
74. P0. Where should temporary Zotero DB copies be stored?
75. P0. How should temporary copies be cleaned up after failures?
76. P1. Should the source path be masked in UI reports?
77. P1. Should source fingerprints be stored to recognize repeated imports?
78. P1. Should the system import from exported Zotero RDF/BibTeX later?
79. P1. Should locked Zotero databases show a special error?
80. P2. Should Zotero source settings be saved for reuse?

## I. Zotero Mapping

81. P0. Which Zotero item types should be imported in Phase 4?
82. P0. Which Zotero item types should be skipped?
83. P0. How should creators be flattened into `Paper.authors`?
84. P0. How should Zotero collections map: primary category, tags, or import-only groups?
85. P0. How should Zotero tags map to current `tags_json`?
86. P0. Should Zotero notes be imported into `user_notes`?
87. P1. Should multiple PDF attachments be supported?
88. P1. Should non-PDF attachments be ignored or recorded as warnings?
89. P1. How should publication date be normalized into `year`?
90. P2. Should Zotero item keys be stored for future sync?

## J. Zotero Deduplication

91. P0. Which duplicate keys are authoritative: DOI, title, URL, attachment filename, Zotero key?
92. P0. Should duplicates default to unselected?
93. P0. Should users be able to force import a duplicate?
94. P0. Should duplicate candidates be mergeable into existing papers?
95. P1. Should title matching be case-insensitive and punctuation-insensitive?
96. P1. Should DOI matching normalize URL prefixes?
97. P1. Should missing DOI candidates rely on title plus year?
98. P1. Should attachment filename be used only as a weak signal?
99. P2. Should duplicate decisions be remembered across runs?
100. P2. Should import preview show a duplicate confidence score?

## K. Zotero Import Execution

101. P0. Should selected candidates be imported in one background task?
102. P0. Should per-candidate failures stop the whole import?
103. P0. Should metadata-only import create papers with empty PDF path or a special missing-PDF state?
104. P0. Should candidates with inaccessible PDFs be skipped by default?
105. P1. Should imported papers automatically enter pending category review?
106. P1. Should imported papers automatically trigger parse?
107. P1. Should imported papers automatically trigger summarize/embed?
108. P1. Should imported tags be cleaned or preserved exactly?
109. P2. Should import run reports link to newly imported papers?
110. P2. Should import progress show candidate titles as they are processed?

## L. Verification and Delivery

111. P0. Which backend test files must pass before claiming Phase 4 complete?
112. P0. Which frontend test files must pass before claiming Phase 4 complete?
113. P0. Is `npm run build` required for handoff completion?
114. P0. Is `tsc --noEmit` required separately from build?
115. P0. Should implementing models commit after each task?
116. P1. Should implementation logs be required after every task?
117. P1. Should a browser smoke test be required for Agent and Zotero?
118. P1. Should feature flags be tested in both enabled and disabled states?
119. P2. Should performance be tested with synthetic 1,000-item Zotero fixtures?
120. P2. What final acceptance demo should other AI models prepare?
