import unittest

from evaluate_benchmark import evaluate, load_cases


class BenchmarkEvaluatorTests(unittest.TestCase):
    def test_separates_retrieval_answer_correctness_and_grounding(self):
        report = evaluate([
            {
                "case_id": "case-1",
                "query": "Question",
                "relevant_chunk_ids": ["a", "b"],
                "retrieved_chunk_ids": ["a", "c"],
                "answer_claims": [
                    {"correct": True, "evidence_supported": True},
                    {"correct": False, "evidence_supported": False},
                    {"correct": None, "evidence_supported": None},
                ],
                "reviewer_id": "reviewer-1",
                "reviewed_at": "2026-01-15T12:00:00Z",
            }
        ])
        self.assertEqual(report["retrieval_precision_at_k_macro"], 0.5)
        self.assertEqual(report["retrieval_recall_at_k_macro"], 0.5)
        self.assertEqual(report["answer_claim_correctness_rate"], 0.5)
        self.assertEqual(report["evidence_support_rate"], 0.5)
        self.assertEqual(report["unreviewed_claim_count"], 1)

    def test_empty_benchmark_is_not_reported_as_accuracy(self):
        with self.assertRaisesRegex(ValueError, "no labeled cases"):
            evaluate([])

    def test_rejects_missing_relevant_labels(self):
        with self.assertRaisesRegex(ValueError, "non-empty labeled list"):
            load_cases_with_invalid_labels()

    def test_scores_expert_labeled_diagnostic_faults(self):
        report = evaluate([
            {
                "case_id": "bearing-case",
                "query": "Bearing noise and temperature",
                "relevant_chunk_ids": ["manual-1"],
                "retrieved_chunk_ids": ["manual-1"],
                "reference_fault_labels": ["bearing-wear", "lubrication-loss"],
                "predicted_fault_labels": ["bearing-wear"],
                "answer_claims": [],
                "reviewer_id": "expert-1",
                "reviewed_at": "2026-01-15T12:00:00Z",
            },
            {
                "case_id": "no-fault-case",
                "query": "No unusual noise",
                "relevant_chunk_ids": ["manual-2"],
                "retrieved_chunk_ids": ["manual-2"],
                "reference_fault_labels": ["none"],
                "predicted_fault_labels": ["none"],
                "answer_claims": [],
                "reviewer_id": "expert-2",
                "reviewed_at": "2026-01-15T12:00:00Z",
            },
        ])
        self.assertEqual(report["diagnostic_exact_match_rate"], 0.5)
        self.assertEqual(report["diagnostic_precision_macro"], 1.0)
        self.assertEqual(report["diagnostic_recall_macro"], 0.75)
        self.assertEqual(len(report["retrieval_recall_at_k_macro_95_ci"]), 2)


def load_cases_with_invalid_labels():
    import json
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as temporary_directory:
        path = Path(temporary_directory) / "benchmark.jsonl"
        path.write_text(json.dumps({
            "case_id": "case-1",
            "query": "Question",
            "relevant_chunk_ids": [],
            "retrieved_chunk_ids": [],
            "answer_claims": [],
        }), encoding="utf-8")
        return load_cases(path)


if __name__ == "__main__":
    unittest.main()
