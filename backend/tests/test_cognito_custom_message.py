import unittest

from backend.lambdas.cognito_custom_message.lambda_function import lambda_handler


class CognitoCustomMessageTests(unittest.TestCase):
    def test_forgot_password_message_includes_prefilled_reset_url(self):
        event = {
            "triggerSource": "CustomMessage_ForgotPassword",
            "request": {
                "codeParameter": "{####}",
                "userAttributes": {"email": "pghalcrow@gmail.com"},
            },
            "response": {},
        }

        result = lambda_handler(event, None)

        self.assertIs(result, event)
        self.assertEqual(result["response"]["emailSubject"], "Spirit of the Fourth password reset code")
        self.assertIn("https://spiritofthefourth.org/admin/reset-password?email=pghalcrow%40gmail.com", result["response"]["emailMessage"])
        self.assertIn("{####}", result["response"]["emailMessage"])

    def test_forgot_password_message_uses_user_name_when_email_attribute_is_missing(self):
        event = {
            "triggerSource": "CustomMessage_ForgotPassword",
            "userName": "admin+test@example.com",
            "request": {
                "codeParameter": "{####}",
                "userAttributes": {},
            },
            "response": {},
        }

        result = lambda_handler(event, None)

        self.assertIn("email=admin%2Btest%40example.com", result["response"]["emailMessage"])

    def test_non_password_reset_message_is_unchanged(self):
        event = {
            "triggerSource": "CustomMessage_AdminCreateUser",
            "request": {
                "codeParameter": "{####}",
                "userAttributes": {"email": "viewer@example.com"},
            },
            "response": {},
        }

        result = lambda_handler(event, None)

        self.assertIs(result, event)
        self.assertEqual(result["response"], {})


if __name__ == "__main__":
    unittest.main()
