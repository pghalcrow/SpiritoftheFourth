import importlib
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


class FakeBoto3Client:
    def get_object(self, *args, **kwargs):
        raise NotImplementedError


boto3 = types.ModuleType("boto3")
boto3.client = lambda *args, **kwargs: FakeBoto3Client()
sys.modules.setdefault("boto3", boto3)
if "stripe" not in sys.modules:
    try:
        importlib.import_module("stripe")
    except ImportError:
        sys.modules["stripe"] = types.ModuleType("stripe")

from backend.local_server import LocalAdminAuthService


class LocalAdminAuthTests(unittest.TestCase):
    def test_disabled_local_user_cannot_login_or_use_existing_token(self):
        service = LocalAdminAuthService()
        service.update_user("superadmin@example.com", enabled=False)

        login_response = service.login("superadmin@example.com", "Bubbles123!@#")

        self.assertEqual(login_response, {"success": False, "reason": "disabled"})
        with self.assertRaises(PermissionError):
            service.get_current_user("local-admin-token:superadmin@example.com")

    def test_created_local_user_persists_for_password_reset_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            users_file = str(Path(tmp) / "admin_users.json")
            with patch.dict("os.environ", {"LOCAL_ADMIN_USERS_FILE": users_file}):
                service = LocalAdminAuthService()
                service.create_user("unconfirmed@example.com", "viewer")

                reloaded_service = LocalAdminAuthService()
                reset_response = reloaded_service.request_password_reset("unconfirmed@example.com")

        self.assertTrue(reset_response["success"])
        self.assertEqual(reset_response["resetCode"], "local-reset")
        self.assertIn("unconfirmed%40example.com", reset_response["resetUrl"])

    def test_local_create_user_rejects_existing_email(self):
        with tempfile.TemporaryDirectory() as tmp:
            users_file = str(Path(tmp) / "admin_users.json")
            with patch.dict("os.environ", {"LOCAL_ADMIN_USERS_FILE": users_file}):
                service = LocalAdminAuthService()

                with self.assertRaisesRegex(ValueError, "already exists"):
                    service.create_user("viewer@example.com", "viewer")

    def test_seeded_local_users_share_the_local_test_password(self):
        with tempfile.TemporaryDirectory() as tmp:
            users_file = str(Path(tmp) / "admin_users.json")
            with patch.dict("os.environ", {"LOCAL_ADMIN_USERS_FILE": users_file}):
                service = LocalAdminAuthService()

        for email in [
            "developer@example.com",
            "superadmin@example.com",
            "admin@example.com",
            "viewer@example.com",
        ]:
            with self.subTest(email=email):
                self.assertTrue(service.login(email, "Bubbles123!@#")["success"])


if __name__ == "__main__":
    unittest.main()
