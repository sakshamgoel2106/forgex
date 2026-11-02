import asyncio
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from main import Passage, RerankRequest, rerank_passages


class WorkerRerankerTests(unittest.TestCase):
    def test_heuristic_endpoint_returns_rankable_scores(self):
        request = RerankRequest(
            model="heuristic-v1",
            query="PUMP-204-B operating pressure 120 PSI",
            passages=[
                Passage(id="weak", text="Generic maintenance instructions."),
                Passage(id="strong", text="PUMP-204-B operating pressure is 120 PSI."),
            ],
        )
        with patch.dict(os.environ, {"RERANKER_MODEL": "heuristic-v1"}):
            result = asyncio.run(rerank_passages(request))
        self.assertEqual(result.results[0].id, "strong")
        self.assertTrue(all(0 <= row.score <= 1 for row in result.results))

    def test_learned_model_fails_closed_when_weights_are_missing(self):
        request = RerankRequest(model="staged-cross-encoder", query="query", passages=[Passage(id="a", text="text")])
        with patch.dict(os.environ, {
            "RERANKER_MODEL": "staged-cross-encoder",
            "RERANKER_MODEL_PATH": "missing-test-model-path",
        }), patch("main.os.path.isdir", return_value=False):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(rerank_passages(request))
        self.assertEqual(raised.exception.status_code, 503)

    def test_learned_model_uses_worker_scores_when_weights_are_staged(self):
        request = RerankRequest(
            model="staged-cross-encoder",
            query="query",
            passages=[Passage(id="a", text="text"), Passage(id="b", text="text")],
        )
        with patch.dict(os.environ, {
            "RERANKER_MODEL": "staged-cross-encoder",
            "RERANKER_MODEL_PATH": "staged-test-model",
        }), patch("main.os.path.isdir", return_value=True), patch(
            "main.score_passages_with_cross_encoder", return_value=[0.1, 0.9]
        ) as score:
            result = asyncio.run(rerank_passages(request))
        score.assert_called_once()
        self.assertEqual([row.id for row in result.results], ["b", "a"])

    def test_rejects_request_model_mismatch(self):
        request = RerankRequest(model="unexpected", query="query", passages=[Passage(id="a", text="text")])
        with patch.dict(os.environ, {"RERANKER_MODEL": "heuristic-v1"}):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(rerank_passages(request))
        self.assertEqual(raised.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
