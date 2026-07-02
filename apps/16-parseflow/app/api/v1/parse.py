"""POST /v1/parse — the core endpoint.

TODO:
- [ ] accept multipart file or URL; document types: invoice, receipt,
      bank_statement, id, resume, or custom (user-supplied JSON schema)
- [ ] sync mode (small docs) vs async mode (batch -> webhook callback)
- [ ] response: extracted fields + per-field confidence + page provenance
- [ ] page counting -> usage metering hook
"""
