#!/usr/bin/env python3
"""Evaluate human-labeled retrieval and diagnostic-answer benchmark JSONL."""

import argparse
import json
import math
import random
from pathlib import Path
from typing import Any


def load_cases(path: Path) -> list[dict[str, Any]]:
    cases = []
    with path.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                continue
            try:
                case = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {error}") from error
            if not isinstance(case, dict) or not case.get("case_id"):
                raise ValueError(f"{path}:{line_number}: each case needs a case_id.")
            if not isinstance(case.get("query"), str) or not case["query"].strip():
                raise ValueError(f"{path}:{line_number}: each case needs an anonymized query.")
            if not isinstance(case.get("relevant_chunk_ids"), list) or not case["relevant_chunk_ids"]:
                raise ValueError(f"{path}:{line_number}: relevant_chunk_ids must be a non-empty labeled list.")
            if not isinstance(case.get("retrieved_chunk_ids"), list):
                raise ValueError(f"{path}:{line_number}: retrieved_chunk_ids must be a list.")
            if not isinstance(case.get("answer_claims"), list):
                raise ValueError(f"{path}:{line_number}: answer_claims must be a list.")
            if ("reference_fault_labels" in case) != ("predicted_fault_labels" in case):
                raise ValueError(
                    f"{path}:{line_number}: provide both reference_fault_labels and predicted_fault_labels."
                )
            for label_key in ("reference_fault_labels", "predicted_fault_labels"):
                if label_key in case and (
                    not isinstance(case[label_key], list)
                    or not all(isinstance(label, str) and label.strip() for label in case[label_key])
                ):
                    raise ValueError(f"{path}:{line_number}: {label_key} must be a list of non-empty labels.")
            has_human_labels = "reference_fault_labels" in case or any(
                claim.get("correct") is not None or claim.get("evidence_supported") is not None
                for claim in case["answer_claims"]
                if isinstance(claim, dict)
            )
            if has_human_labels and not case.get("reviewer_id", "").strip():
                raise ValueError(f"{path}:{line_number}: human labels require reviewer_id.")
            if has_human_labels and not case.get("reviewed_at", "").strip():
                raise ValueError(f"{path}:{line_number}: human labels require reviewed_at.")
            cases.append(case)
    if not cases:
        raise ValueError(f"{path}: no labeled cases found; no empirical metric can be reported.")
    return cases


def mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def bootstrap_interval(
    groups: list[list[float]], seed: int = 1337, iterations: int = 2000
) -> list[float] | None:
    if len(groups) < 2:
        return None
    randomizer = random.Random(seed)
    sample_means = []
    for _ in range(iterations):
        sample = [groups[randomizer.randrange(len(groups))] for _ in groups]
        flattened = [value for group in sample for value in group]
        if flattened:
            sample_means.append(sum(flattened) / len(flattened))
    sample_means.sort()
    return [
        sample_means[math.floor(0.025 * (iterations - 1))],
        sample_means[math.ceil(0.975 * (iterations - 1))],
    ]


def evaluate(cases: list[dict[str, Any]]) -> dict[str, Any]:
    if not cases:
        raise ValueError("no labeled cases found; no empirical metric can be reported.")
    precisions: list[float] = []
    recalls: list[float] = []
    reviewed_correctness: list[float] = []
    reviewed_grounding: list[float] = []
    correctness_by_case: list[list[float]] = []
    grounding_by_case: list[list[float]] = []
    exact_diagnosis_matches: list[float] = []
    diagnostic_precisions: list[float] = []
    diagnostic_recalls: list[float] = []
    total_claims = 0

    for case in cases:
        relevant = set(case["relevant_chunk_ids"])
        retrieved = set(case["retrieved_chunk_ids"])
        matches = len(relevant & retrieved)
        precisions.append(matches / len(retrieved) if retrieved else 0.0)
        recalls.append(matches / len(relevant))

        case_correctness = []
        case_grounding = []
        for claim in case["answer_claims"]:
            if not isinstance(claim, dict):
                raise ValueError(f"{case['case_id']}: answer_claims entries must be objects.")
            total_claims += 1
            if claim.get("correct") is not None:
                if not isinstance(claim["correct"], bool):
                    raise ValueError(f"{case['case_id']}: claim 'correct' must be true, false, or null.")
                value = float(claim["correct"])
                reviewed_correctness.append(value)
                case_correctness.append(value)
            if claim.get("evidence_supported") is not None:
                if not isinstance(claim["evidence_supported"], bool):
                    raise ValueError(
                        f"{case['case_id']}: claim 'evidence_supported' must be true, false, or null."
                    )
                value = float(claim["evidence_supported"])
                reviewed_grounding.append(value)
                case_grounding.append(value)
        if case_correctness:
            correctness_by_case.append(case_correctness)
        if case_grounding:
            grounding_by_case.append(case_grounding)
        if "reference_fault_labels" in case:
            expected_labels = set(case["reference_fault_labels"])
            predicted_labels = set(case["predicted_fault_labels"])
            intersection = len(expected_labels & predicted_labels)
            exact_diagnosis_matches.append(float(expected_labels == predicted_labels))
            diagnostic_precisions.append(intersection / len(predicted_labels) if predicted_labels else 0.0)
            diagnostic_recalls.append(intersection / len(expected_labels) if expected_labels else 1.0)

    return {
        "case_count": len(cases),
        "retrieval_precision_at_k_macro": mean(precisions),
        "retrieval_precision_at_k_macro_95_ci": bootstrap_interval([[value] for value in precisions]),
        "retrieval_recall_at_k_macro": mean(recalls),
        "retrieval_recall_at_k_macro_95_ci": bootstrap_interval([[value] for value in recalls]),
        "reviewed_claim_count": len(reviewed_correctness),
        "answer_claim_correctness_rate": mean(reviewed_correctness),
        "answer_claim_correctness_rate_95_ci": bootstrap_interval(correctness_by_case),
        "grounding_reviewed_claim_count": len(reviewed_grounding),
        "evidence_support_rate": mean(reviewed_grounding),
        "evidence_support_rate_95_ci": bootstrap_interval(grounding_by_case),
        "diagnostic_case_count": len(exact_diagnosis_matches),
        "diagnostic_exact_match_rate": mean(exact_diagnosis_matches),
        "diagnostic_precision_macro": mean(diagnostic_precisions),
        "diagnostic_recall_macro": mean(diagnostic_recalls),
        "unreviewed_claim_count": total_claims - len(reviewed_correctness),
        "note": (
            "Metrics are descriptive only; use a representative, expert-reviewed holdout set "
            "and report sampling, confidence intervals, and limitations before making accuracy claims."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jsonl", type=Path, help="Human-labeled JSONL benchmark file")
    args = parser.parse_args()
    report = evaluate(load_cases(args.jsonl))
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
