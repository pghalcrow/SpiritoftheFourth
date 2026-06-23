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
    generate_temporary_password,
    password_meets_policy,
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
        self.respond_to_challenge_calls = []

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

    def respond_to_auth_challenge(self, **kwargs):
        self.respond_to_challenge_calls.append(kwargs)
        return {"AuthenticationResult": {"AccessToken": "new-access-token", "IdToken": "new-id-token"}}


class FakeNewPasswordRequiredClient(FakeLoginClient):
    def initiate_auth(self, **kwargs):
        return {
            "ChallengeName": "NEW_PASSWORD_REQUIRED",
            "Session": "challenge-session",
        }


class FakeCreateClient:
    def __init__(self, create_error_code=None):
        self.create_error_code = create_error_code
        self.create_user_calls = []
        self.set_password_calls = []
        self.group_calls = []
        self.forgot_password_calls = []

    def admin_create_user(self, **kwargs):
        self.create_user_calls.append(kwargs)
        if self.create_error_code:
            raise ClientError({"Error": {"Code": self.create_error_code}}, "AdminCreateUser")

    def admin_set_user_password(self, **kwargs):
        self.set_password_calls.append(kwargs)

    def admin_add_user_to_group(self, **kwargs):
        self.group_calls.append(kwargs)

    def forgot_password(self, **kwargs):
        self.forgot_password_calls.append(kwargs)


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
    def test_generated_temporary_password_matches_cognito_password_policy(self):
        password = generate_temporary_password()

        self.assertTrue(password_meets_policy(password))
        self.assertGreaterEqual(len(password), 8)
        self.assertTrue(any(char.isupper() for char in password))
        self.assertTrue(any(char.islower() for char in password))
        self.assertTrue(any(char.isdigit() for char in password))
        self.assertTrue(any(not char.isalnum() for char in password))

    def test_password_policy_requires_symbol_and_mixed_character_classes(self):
        self.assertFalse(password_meets_policy("Bubbles123"))
        self.assertTrue(password_meets_policy("Bubbles123!"))

    def test_login_reports_disabled_cognito_users_without_exposing_bad_credentials(self):
        client = FakeLoginClient(error_code="NotAuthorizedException", message="User is disabled.")
        service = AdminAuthService(client=client, client_id="client-id")

        response = service.login("viewer@example.com", "secret7")

        self.assertEqual(response, {"success": False, "reason": "disabled"})

    def test_login_returns_new_password_challenge_for_invited_users(self):
        client = FakeNewPasswordRequiredClient()
        service = AdminAuthService(client=client, client_id="client-id")

        response = service.login("viewer@example.com", "temporary-password")

        self.assertEqual(response, {
            "success": False,
            "challenge": "NEW_PASSWORD_REQUIRED",
            "session": "challenge-session",
            "email": "viewer@example.com",
        })

    def test_complete_new_password_challenge_returns_tokens_and_role(self):
        client = FakeLoginClient()
        service = AdminAuthService(client=client, client_id="client-id")

        response = service.complete_new_password_challenge(
            "viewer@example.com",
            "Bubbles123!",
            "challenge-session",
        )

        self.assertEqual(response["success"], True)
        self.assertEqual(response["token"], "new-access-token")
        self.assertEqual(response["idToken"], "new-id-token")
        self.assertEqual(response["role"], ROLE_VIEWER)
        self.assertEqual(response["email"], "viewer@example.com")
        self.assertEqual(client.respond_to_challenge_calls[0]["ChallengeName"], "NEW_PASSWORD_REQUIRED")
        self.assertEqual(client.respond_to_challenge_calls[0]["Session"], "challenge-session")
        self.assertEqual(client.respond_to_challenge_calls[0]["ChallengeResponses"]["NEW_PASSWORD"], "Bubbles123!")

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

    def test_create_user_sends_cognito_invite_without_consuming_reset_flow(self):
        client = FakeCreateClient()
        service = AdminAuthService(client=client, user_pool_id="pool-id", client_id="client-id")

        response = service.create_user("viewer@example.com", ROLE_VIEWER)

        self.assertEqual(response, {"email": "viewer@example.com", "role": ROLE_VIEWER})
        self.assertNotIn("MessageAction", client.create_user_calls[0])
        self.assertEqual(client.create_user_calls[0]["DesiredDeliveryMediums"], ["EMAIL"])
        self.assertFalse(client.set_password_calls)
        self.assertEqual(client.group_calls[0]["GroupName"], "Viewer")
        self.assertFalse(client.forgot_password_calls)

    def test_resend_user_invite_uses_cognito_resend_action(self):
        client = FakeCreateClient()
        service = AdminAuthService(client=client, user_pool_id="pool-id", client_id="client-id")

        response = service.resend_user_invite("viewer@example.com")

        self.assertEqual(response, {"email": "viewer@example.com"})
        self.assertEqual(client.create_user_calls[0]["UserPoolId"], "pool-id")
        self.assertEqual(client.create_user_calls[0]["Username"], "viewer@example.com")
        self.assertEqual(client.create_user_calls[0]["MessageAction"], "RESEND")
        self.assertEqual(client.create_user_calls[0]["DesiredDeliveryMediums"], ["EMAIL"])


if __name__ == "__main__":
    unittest.main()
