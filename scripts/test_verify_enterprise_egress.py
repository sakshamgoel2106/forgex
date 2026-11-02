import unittest
from pathlib import Path
from unittest.mock import patch

from verify_enterprise_egress import verify


class EnterpriseEgressTests(unittest.TestCase):
    @patch("verify_enterprise_egress.run")
    def test_checks_resolved_internal_network_and_labels_unchecked_controls(self, run):
        run.side_effect = [
            '{"networks":{"forgex_internal":{"name":"project_forgex_internal","internal":true}},'
            '"services":{"api":{"networks":{"forgex_internal":{}}},"worker":{"networks":{"forgex_internal":{}}}}}'
        ]
        report = verify(Path(__file__), static_only=True)
        self.assertEqual(report["internal_networks"], ["project_forgex_internal"])
        self.assertEqual(report["host_firewall_check"], "not performed")
        self.assertEqual(report["packet_capture_check"], "not performed")

    @patch("verify_enterprise_egress.run")
    def test_rejects_non_internal_service_network(self, run):
        run.return_value = (
            '{"networks":{"internal":{"internal":true},"public":{"internal":false}},'
            '"services":{"api":{"networks":{"internal":{},"public":{}}}}}'
        )
        with self.assertRaisesRegex(ValueError, "non-internal network"):
            verify(Path(__file__), static_only=True)

    @patch("verify_enterprise_egress.run")
    def test_runtime_checks_actual_network_internal_flag_and_membership(self, run):
        run.side_effect = [
            '{"networks":{"internal":{"name":"project_internal","internal":true}},'
            '"services":{"api":{"networks":{"internal":{}}}}}',
            "container-id",
            "true",
            '[{"NetworkSettings":{"Networks":{"project_internal":{}}}}]',
        ]
        report = verify(Path(__file__), static_only=False)
        self.assertEqual(report["runtime_network_check"], "passed")
        self.assertEqual(report["running_containers"], 1)


if __name__ == "__main__":
    unittest.main()
