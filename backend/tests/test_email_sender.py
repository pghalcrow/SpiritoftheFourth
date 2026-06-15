import unittest
from unittest.mock import patch
from pathlib import Path

from backend.lambdas.create_order.EmailSender import EmailSender, resolve_email_recipient


class EmailSenderTests(unittest.TestCase):
    def test_format_email_resolves_templates_relative_to_sender_module(self):
        sender = EmailSender.__new__(EmailSender)

        body = sender.format_email("emails/buyer__receipt.html", {"buyers_first_name": "Local"})

        self.assertIn("Hi Local {buyers_last_name}", body)
        self.assertIn("<html", body.lower())

    def test_local_transport_does_not_require_smtp_environment(self):
        with patch.dict("os.environ", {"EMAIL_TRANSPORT": "local"}, clear=True):
            sender = EmailSender()

        self.assertTrue(sender.send_email(
            body="<p>Local</p>",
            subject="Local checkout",
            mail_to="buyer@example.com",
            mail_from="no-reply@example.com",
        ))

    def test_build_form_fields_html_uses_readable_labels_and_escapes_values(self):
        sender = EmailSender.__new__(EmailSender)

        html = sender.build_form_fields_html({
            "contactName": "Pat Halcrow",
            "streetAddress": "123 Main <St>",
            "zipcode": "92128",
            "paradeAnnouncement": "Happy Fourth",
            "emptyField": "",
        })

        self.assertIn("Contact Name", html)
        self.assertIn("Street Address", html)
        self.assertIn("Zip Code", html)
        self.assertIn("Parade Announcement", html)
        self.assertIn("123 Main &lt;St&gt;", html)
        self.assertNotIn("contactName", html)
        self.assertNotIn("emptyField", html)

    def test_test_mode_routes_create_order_email_to_test_recipient(self):
        with patch("backend.lambdas.create_order.EmailSender.is_test_mode", return_value=True), \
            patch.dict("os.environ", {"TEST_MODE_EMAIL": "pghalcrow@gmail.com"}, clear=True):
            recipient = resolve_email_recipient("live@example.com")

        self.assertEqual(recipient["send_to"], "pghalcrow@gmail.com")
        self.assertEqual(recipient["header_to"], "pghalcrow@gmail.com")
        self.assertEqual(recipient["original_to"], "live@example.com")


if __name__ == "__main__":
    unittest.main()
