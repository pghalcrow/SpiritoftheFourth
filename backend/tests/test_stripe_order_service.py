import json
import unittest
from unittest.mock import patch

from backend.lambdas.create_order.StripeOrderService import StripeOrderService


class StripeOrderServiceTests(unittest.TestCase):
    def test_create_embedded_checkout_session_uses_stripe_embedded_page_mode(self):
        class FakeStripeSession:
            client_secret = "cs_test_secret"

        captured_params = {}

        def fake_create(**kwargs):
            captured_params.update(kwargs)
            return FakeStripeSession()

        with patch(
            "backend.lambdas.create_order.StripeOrderService.stripe.checkout.Session.create",
            side_effect=fake_create,
        ):
            response = StripeOrderService("sk_test_local").create_embedded_checkout_session(
                event_type="vendorApplication",
                submission_id="sub-1",
                line_items=[
                    {
                        "price_data": {
                            "currency": "usd",
                            "product_data": {"name": "Vendor Booth Fee - Food Vendor"},
                            "unit_amount": 15000,
                        },
                        "quantity": 1,
                    }
                ],
                customer_email="vendor@example.com",
                return_base_url="https://example.com",
            )

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(json.loads(response["body"])["client_secret"], "cs_test_secret")
        self.assertEqual(captured_params["ui_mode"], "embedded_page")

    def test_retrieve_session_serializes_stripe_object(self):
        class FakeStripeSession:
            def _to_dict_recursive(self):
                return {
                    "id": "cs_test_paid",
                    "payment_status": "paid",
                    "metadata": {"submission_id": "sub-1"},
                }

        with patch(
            "backend.lambdas.create_order.StripeOrderService.stripe.checkout.Session.retrieve",
            return_value=FakeStripeSession(),
        ):
            response = StripeOrderService("sk_test_local").retrieve_session("cs_test_paid")

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(json.loads(response["body"])["id"], "cs_test_paid")


if __name__ == "__main__":
    unittest.main()
