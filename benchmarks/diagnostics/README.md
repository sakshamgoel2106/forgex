# Diagnostic and RAG benchmark

This evaluator separates retrieval quality from answer quality. It does not infer a
correct diagnosis from model scores. An expert must label the ground truth and review
each answer claim. Do not publish accuracy claims from an empty, synthetic, or
non-representative dataset.

## JSONL case format

Store one JSON object per line. Keep patient, employee, and confidential plant data
out of benchmark files unless the data owner has approved its use.

```json
{
  "case_id": "site-approved-anonymous-id",
  "modality": "text|audio|image|multimodal",
  "query": "The anonymized diagnostic question",
  "relevant_chunk_ids": ["expert-labeled-relevant-chunk"],
  "retrieved_chunk_ids": ["chunk-returned-by-the-system"],
  "reference_fault_labels": ["expert-labeled-fault"],
  "predicted_fault_labels": ["system-predicted-fault"],
  "answer_claims": [
    {
      "claim": "One independently checkable answer claim",
      "correct": true,
      "evidence_chunk_ids": ["source-chunk-id"],
      "evidence_supported": true
    }
  ],
  "reviewer_id": "approved-reviewer-reference",
  "reviewed_at": "2026-01-15T12:00:00Z"
}
```

`correct` and `evidence_supported` must be reviewed booleans or `null` while
unreviewed. Human-reviewed labels require `reviewer_id` and `reviewed_at`. Retrieval
metrics are macro-averaged per case. Answer correctness and evidence support are
calculated only over individually reviewed claims; their 95% percentile bootstrap
interval resamples cases (not individual claims). Diagnostic exact match, precision,
and recall are calculated only when both reference and predicted fault labels are
provided. For audio and image diagnosis, reviewers must label the ground-truth fault
independently of the system output and record acquisition conditions and known
limitations alongside the dataset release.

## Run

```powershell
python benchmarks\diagnostics\evaluate_benchmark.py path\to\approved-benchmark.jsonl
```

The repository intentionally contains no empirical scores: representative,
expert-labeled industrial diagnostic examples have not been supplied.
