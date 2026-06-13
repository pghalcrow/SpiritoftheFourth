import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


class DeployLambdasScriptTests(unittest.TestCase):
    def test_package_lambda_excludes_python_cache_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_dir = tmp_path / "lambda"
            cache_dir = source_dir / "__pycache__"
            zip_path = tmp_path / "lambda.zip"
            source_dir.mkdir()
            cache_dir.mkdir()
            (source_dir / "lambda_function.py").write_text("def handler(event, context): return {}\n")
            (cache_dir / "lambda_function.cpython-314.pyc").write_bytes(b"cache")

            result = subprocess.run(
                ["backend/scripts/package_lambda.sh", str(source_dir), str(zip_path)],
                cwd=Path(__file__).resolve().parents[2],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            zip_listing = subprocess.check_output(["unzip", "-Z1", str(zip_path)], text=True)
            self.assertIn("lambda_function.py", zip_listing)
            self.assertNotIn("__pycache__", zip_listing)
            self.assertNotIn(".pyc", zip_listing)

    def test_package_lambda_replaces_existing_zip(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_dir = tmp_path / "lambda"
            zip_path = tmp_path / "lambda.zip"
            source_dir.mkdir()
            (source_dir / "lambda_function.py").write_text("def handler(event, context): return {}\n")
            (tmp_path / "stale.pyc").write_bytes(b"stale")

            subprocess.run(
                ["zip", "-q", str(zip_path), "stale.pyc"],
                cwd=tmp_path,
                check=True,
            )
            result = subprocess.run(
                ["backend/scripts/package_lambda.sh", str(source_dir), str(zip_path)],
                cwd=Path(__file__).resolve().parents[2],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            zip_listing = subprocess.check_output(["unzip", "-Z1", str(zip_path)], text=True)
            self.assertIn("lambda_function.py", zip_listing)
            self.assertNotIn("stale.pyc", zip_listing)

    def test_deploy_preserves_existing_environment_variables(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            calls_path = tmp_path / "aws-calls.jsonl"
            fake_aws = tmp_path / "aws"
            fake_aws.write_text(
                textwrap.dedent(
                    f"""\
                    #!/usr/bin/env python3
                    import json
                    import sys

                    args = sys.argv[1:]

                    with open({str(calls_path)!r}, "a") as calls:
                        calls.write(json.dumps(args) + "\\n")

                    if args[:3] == ["lambda", "get-function-configuration", "--region"]:
                        print(json.dumps({{"ADMIN_PASSWORD": "secret", "SMTPHOST": "smtp.example.com"}}))
                    elif args[:2] == ["lambda", "update-function-code"]:
                        pass
                    elif args[:2] == ["lambda", "wait"]:
                        pass
                    elif args[:2] == ["lambda", "update-function-configuration"]:
                        env_arg = args[args.index("--environment") + 1]
                        parsed = json.loads(env_arg)
                        variables = parsed["Variables"]
                        assert variables["ADMIN_PASSWORD"] == "secret"
                        assert variables["SMTPHOST"] == "smtp.example.com"
                        assert variables["SUBMISSIONS_TABLE"] == "sotf-submissions-dev"
                    else:
                        raise SystemExit(f"Unexpected aws args: {{args}}")
                    """
                )
            )
            fake_aws.chmod(0o755)

            env = os.environ.copy()
            env["PATH"] = f"{tmp_path}{os.pathsep}{env['PATH']}"

            subprocess.run(
                ["backend/scripts/deploy_lambdas.sh", "dev"],
                check=True,
                cwd=Path(__file__).resolve().parents[2],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

            calls = [json.loads(line) for line in calls_path.read_text().splitlines()]
            config_updates = [call for call in calls if call[:2] == ["lambda", "update-function-configuration"]]
            self.assertEqual(len(config_updates), 3)


if __name__ == "__main__":
    unittest.main()
