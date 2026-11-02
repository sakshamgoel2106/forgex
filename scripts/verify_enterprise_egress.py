#!/usr/bin/env python3
"""Check Enterprise Compose network isolation; this is not a host firewall audit."""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def run(command: list[str], cwd: Path) -> str:
    completed = subprocess.run(command, cwd=cwd, check=True, capture_output=True, text=True)
    return completed.stdout.strip()


def verify(compose_file: Path, static_only: bool) -> dict[str, Any]:
    compose_file = compose_file.resolve()
    cwd = compose_file.parent
    compose_config = json.loads(
        run(["docker", "compose", "-f", str(compose_file), "config", "--format", "json"], cwd)
    )
    networks = compose_config.get("networks", {})
    internal_network_names = {
        config.get("name", name)
        for name, config in networks.items()
        if config.get("internal") is True
    }
    internal_network_keys = {
        name for name, config in networks.items() if config.get("internal") is True
    }
    if not internal_network_keys:
        raise ValueError("Resolved Compose configuration has no internal network.")

    service_networks = {
        service: set((config.get("networks") or {}).keys())
        for service, config in compose_config.get("services", {}).items()
    }
    if not service_networks or any(
        not attached or not attached.issubset(internal_network_keys)
        for attached in service_networks.values()
    ):
        raise ValueError("At least one service is detached or attached to a non-internal network.")

    report: dict[str, Any] = {
        "compose_services": len(service_networks),
        "internal_networks": sorted(internal_network_names),
        "static_compose_check": "passed",
        "runtime_network_check": "not requested",
        "host_firewall_check": "not performed",
        "packet_capture_check": "not performed",
        "warning": "Docker internal-network configuration alone does not prove host/plant zero-egress.",
    }
    if not static_only:
        containers = run(["docker", "compose", "-f", str(compose_file), "ps", "-q"], cwd).splitlines()
        if not containers:
            raise ValueError("No Compose containers are running; start the Enterprise stack for runtime checks.")
        for network_name in internal_network_names:
            is_internal = run(
                ["docker", "network", "inspect", network_name, "--format", "{{.Internal}}"], cwd
            ).lower()
            if is_internal != "true":
                raise ValueError(f"Runtime Docker network '{network_name}' is not internal.")
        expected = internal_network_names
        for container in containers:
            details = json.loads(run(["docker", "inspect", container], cwd))[0]
            attached = set(details.get("NetworkSettings", {}).get("Networks", {}).keys())
            if not attached or not attached.issubset(expected):
                raise ValueError(
                    f"Container {container[:12]} is attached to unexpected networks: {sorted(attached)}."
                )
        report["running_containers"] = len(containers)
        report["runtime_network_check"] = "passed"
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--compose-file",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "infra" / "docker-compose.yml",
    )
    parser.add_argument(
        "--static-only",
        action="store_true",
        help="Inspect resolved Compose configuration without requiring running containers.",
    )
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.compose_file, args.static_only), indent=2))
    except (OSError, ValueError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print(f"Enterprise egress check failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
