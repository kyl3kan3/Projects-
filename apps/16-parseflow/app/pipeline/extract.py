"""Extraction pipeline: pdfplumber text layer -> OCR fallback (pytesseract)
-> Claude structured extraction against the target schema.

TODO:
- [ ] layout-aware chunking for multi-page docs
- [ ] tool-use forced JSON output; schema validation + one retry
- [ ] confidence scoring (model self-report x heuristic agreement)
- [ ] PII handling + retention window enforcement (DOC_RETENTION_HOURS)
"""
