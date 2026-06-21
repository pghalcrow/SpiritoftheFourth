import unittest
from botocore.exceptions import ClientError

from backend.shared.admin_auth import (
    AdminAuthService,
    ROLE_ADMIN,
    ROLE_DEVELOPER,
    ROLE_SUPER_ADMIN,
    ROLE_VIEWER,
    can_delete_submissions,
    can_edit,
    can_manage_role,
    can_read,
    can_update_test_mode,
)


class FakeResetClient:
    def __init__(self, error_code=None):
        self.error_code = error_code
        self.forgot_password_calls = []

    def forgot_password(self, **kwargs):
        self.forgot_password_calls.append(kwargs)
        if self.error_code:
            raise ClientError({"Error": {"Code": self.error_code}}, "ForgotPassword")


class FakeLoginClient:
    def __init__(self, error_code=None, message=""):
        self.error_code = error_code
        self.message = message

    def initiate_auth(self, **kwargs):
        if self.error_code:
            raise ClientError({"Error": {"Code": self.error_code, "Message": self.message}}, "InitiateAuth")
        return {"AuthenticationResult": {"AccessToken": "access-token", "IdToken": "id-token"}}

    def get_user(self, AccessToken):
        return {
            "Username": "viewer@example.com",
            "UserAttributes": [{"Name": "email", "Value": "viewer@example.com"}],
        }

    def admin_list_groups_for_user(self, **kwargs):
        return {"Groups": [{"GroupName": "Viewer"}]}


class FakeCreateClient:
    def __init__(self, create_error_code=None):
        self.create_error_code = create_error_code

    def admin_create_user(self, **kwargs):
        if self.create_error_code:
            raise ClientError({"Error": {"Code": self.create_error_code}}, "AdminCreateUser")

    def admin_add_user_to_group(self, **kwargs):
        pass

    def forgot_password(self, **kwargs):
        pass


class AdminRolePermissionTests(unittest.TestCase):
    def test_role_permissions_match_initial_admin_constraints(self):
        self.assertTrue(can_read(ROLE_DEVELOPER))
        self.assertTrue(can_read(ROLE_SUPER_ADMIN))
        self.assertTrue(can_read(ROLE_ADMIN))
        self.assertTrue(can_read(ROLE_VIEWER))

        self.assertTrue(can_edit(ROLE_DEVELOPER))
        self.assertTrue(can_edit(ROLE_SUPER_ADMIN))
        self.assertTrue(can_edit(ROLE_ADMIN))
        self.assertFalse(can_edit(ROLE_VIEWER))

        self.assertTrue(can_delete_submissions(ROLE_DEVELOPER))
        self.assertTrue(can_delete_submissions(ROLE_SUPER_ADMIN))
        self.assertFalse(can_delete_submissions(ROLE_ADMIN))
        self.assertFalse(can_delete_submissions(ROLE_VIEWER))

        self.assertTrue(can_update_test_mode(ROLE_DEVELOPER))
        self.assertFalse(can_update_test_mode(ROLE_SUPER_ADMIN))

    def test_user_management_cannot_exceed_allowed_role_scope(self):
        self.assertTrue(can_manage_role(ROLE_DEVELOPER, ROLE_DEVELOPER))
        self.assertTrue(can_manage_role(ROLE_DEVELOPER, ROLE_SUPER_ADMIN))
        self.assertTrue(can_manage_role(ROLE_DEVELOPER, ROLE_ADMIN))
        self.assertTrue(can_manage_role(ROLE_DEVELOPER, ROLE_VIEWER))

        self.assertFalse(can_manage_role(ROLE_SUPER_ADMIN, ROLE_DEVELOPER))
        self.assertTrue(can_manage_role(ROLE_SUPER_ADMIN, ROLE_SUPER_ADMIN))
        self.assertTrue(can_manage_role(ROLE_SUPER_ADMIN, ROLE_ADMIN))
        self.assertTrue(can_manage_role(ROLE_SUPER_ADMIN, ROLE_VIEWER))

        self.assertFalse(can_manage_role(ROLE_ADMIN, ROLE_ADMIN))
        self.assertTrue(can_manage_role(ROLE_ADMIN, ROLE_VIEWER))
        self.assertFalse(can_manage_role(ROLE_VIEWER, ROLE_VIEWER))


class AdminAuthServiceTests(unittest.TestCase):
    def test_login_reports_disabled_cognito_users_without_exposing_bad_credentials(self):
        client = FakeLoginClient(error_code="NotAuthorizedException", message="User is disabled.")
        service = AdminAuthService(client=client, client_id="client-id")

        response = service.login("viewer@example.com", "secret7")

        self.assertEqual(response, {"success": False, "reason": "disabled"})

    def test_password_reset_does_not_reveal_unknown_cognito_users(self):
        client = FakeResetClient(error_code="UserNotFoundException")
        service = AdminAuthService(client=client, client_id="client-id")

        response = service.request_password_reset("missing@example.com")

        self.assertEqual(response, {"success": True})
        self.assertEqual(client.forgot_password_calls[0]["Username"], "missing@example.com")

    def test_password_reset_still_raises_unexpected_cognito_errors(self):
        client = FakeResetClient(error_code="TooManyRequestsException")
        service = AdminAuthService(client=client, client_id="client-id")

        with self.assertRaises(ClientError):
            service.request_password_reset("admin@example.com")

    def test_create_user_rejects_existing_cognito_user(self):
        client = FakeCreateClient(create_error_code="UsernameExistsException")
        service = AdminAuthService(client=client, client_id="client-id")

        with self.assertRaisesRegex(ValueError, "already exists"):
            service.create_user("viewer@example.com", ROLE_VIEWER)


if __name__ == "__main__":
    unittest.main()
