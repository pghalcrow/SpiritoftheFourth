import json
import os
import subprocess
import sys
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

    def test_package_lambda_vendors_function_requirements(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_dir = tmp_path / "lambda"
            zip_path = tmp_path / "lambda.zip"
            fake_python = tmp_path / "python3"
            pip_calls = tmp_path / "pip-calls.jsonl"
            source_dir.mkdir()
            (source_dir / "lambda_function.py").write_text("def handler(event, context): return {}\n")
            (source_dir / "requirements.txt").write_text("requests==2.32.5\n")
            fake_python.write_text(
                textwrap.dedent(
                    f"""\
                    #!{sys.executable}
                    import json
                    import pathlib
                    import sys

                    args = sys.argv[1:]
                    with open({str(pip_calls)!r}, "a") as calls:
                        calls.write(json.dumps(args) + "\\n")
                    target = pathlib.Path(args[args.index("--target") + 1])
                    (target / "requests").mkdir()
                    (target / "requests" / "__init__.py").write_text("__version__ = '2.32.5'\\n")
                    """
                )
            )
            fake_python.chmod(0o755)

            env = os.environ.copy()
            env["PATH"] = f"{tmp_path}{os.pathsep}{env['PATH']}"

            result = subprocess.run(
                ["backend/scripts/package_lambda.sh", str(source_dir), str(zip_path), "3.10"],
                cwd=Path(__file__).resolve().parents[2],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            pip_args = json.loads(pip_calls.read_text().splitlines()[0])
            self.assertIn("--platform", pip_args)
            self.assertIn("manylinux2014_x86_64", pip_args)
            self.assertIn("--python-version", pip_args)
            self.assertIn("3.10", pip_args)
            zip_listing = subprocess.check_output(["unzip", "-Z1", str(zip_path)], text=True)
            self.assertIn("requests/__init__.py", zip_listing)

    def test_package_lambda_can_include_google_sheet_credentials_from_env(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_dir = tmp_path / "lambda"
            zip_path = tmp_path / "lambda.zip"
            credentials_path = tmp_path / "creds-sa.json"
            source_dir.mkdir()
            (source_dir / "lambda_function.py").write_text("def handler(event, context): return {}\n")
            credentials_path.write_text('{"client_email":"service@example.com"}\n')

            env = os.environ.copy()
            env["GOOGLE_SHEET_CREDENTIALS_FILE"] = str(credentials_path)
            result = subprocess.run(
                ["backend/scripts/package_lambda.sh", str(source_dir), str(zip_path)],
                cwd=Path(__file__).resolve().parents[2],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            zip_listing = subprocess.check_output(["unzip", "-Z1", str(zip_path)], text=True)
            self.assertIn("creds-sa.json", zip_listing)
            content = subprocess.check_output(["unzip", "-p", str(zip_path), "creds-sa.json"], text=True)
            self.assertIn("service@example.com", content)

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
                    elif args[:2] == ["lambda", "update-function-url-config"]:
                        cors_arg = args[args.index("--cors") + 1]
                        cors = json.loads(cors_arg)
                        assert args[args.index("--function-name") + 1] == "dev_events_service"
                        assert "PATCH" in cors["AllowMethods"]
                        assert "DELETE" in cors["AllowMethods"]
                        assert "OPTIONS" in cors["AllowMethods"]
                        assert "cache-control" in cors["AllowHeaders"]
                        assert "pragma" in cors["AllowHeaders"]
                    else:
                        raise SystemExit(f"Unexpected aws args: {{args}}")
                    """
                )
            )
            fake_aws.chmod(0o755)

            env = os.environ.copy()
            env["PATH"] = f"{tmp_path}{os.pathsep}{env['PATH']}"
            env["LAMBDA_VENDOR_DEPS"] = "false"

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
            function_url_updates = [call for call in calls if call[:2] == ["lambda", "update-function-url-config"]]
            self.assertEqual(len(function_url_updates), 1)


if __name__ == "__main__":
    unittest.main()
