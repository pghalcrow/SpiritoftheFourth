import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { OrderService } from 'src/app/services/order.service';

@Component({
  selector: 'app-order',
  templateUrl: './order.component.html',
  styleUrls: ['./order.component.css']
})
export class OrderComponent implements OnInit {

  message: string = '';
  eventDate: string = '';
  emailContact: string = '';
  orderType: string | null = null;

  constructor(private route: ActivatedRoute, private orderService: OrderService) { }

  ngOnInit() {
    this.orderType = this.route.snapshot.queryParamMap.get('order_type');

    switch (this.orderType) {
      case 'golf_event':
        this.eventDate = '06/01/2025';
        this.emailContact = 'resacoopat15@gmail.com';
        break;
      case 'motor_show':
        this.eventDate = 'the date of the event';
        this.emailContact = 'cowge@cox.net';
        break;
      case 'pickelball_event':
        this.eventDate = '06/29/2025';
        this.emailContact = 'pool49@hotmail.com';
        break;
      default:
        this.eventDate = 'the event date';
        this.emailContact = 'dave.spiritofthefourth@gmail.com';
        break;
    }

    this.route.paramMap.subscribe((params) => {
      const status = params.get('status') ?? '';

      if (status === 'success') {
        this.message = 'processing...';

        this.route.queryParamMap.subscribe(queryParams => {
          const sessionId = queryParams.get('session_id');
          const token = queryParams.get('token');

          if (sessionId) {
            this.handleStripePayment(sessionId);
          } else if (token) {
            this.handlePayPalPayment(token);
          } else {
            this.message = `An error occurred. Please try again or contact us at ${this.emailContact} for support.`;
          }
        });
      } else if (status === 'cancel') {
        this.message = `You’ve canceled your registration. If this was a mistake, please try again or contact us at ${this.emailContact}.`;
      }
    });
  }

  // Handle Stripe payment confirmation
  private handleStripePayment(sessionId: string) {
    if (sessionId) {
      this.message = `Thank you for your order. Your merchandise will be available for pick up at the event registration table on ${this.eventDate}`;
    } else {
      this.message = `An error occurred. Session ID is missing. Please contact us at ${this.emailContact}.`;
    }
  }

  // Handle PayPal payment confirmation
  private handlePayPalPayment(token: string) {
    this.orderService.captureOrder(token).subscribe(
      results => {
        this.message = `Thank you for your order. Feel free to contact us if you have any questions at ${this.emailContact}`;
      },
      error => {
        this.message = `An error occurred while confirming your PayPal payment. Please contact us at ${this.emailContact}. Token: ${token}. Error: ${error.message}`;
      }
    );
  }
}

