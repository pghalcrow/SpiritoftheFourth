import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PaypalDonationService {
  renderDonationButton(containerSelector: string): void {
    const paypal = (window as any).PayPal;
    const hostedButtonId = environment.paypal.donationHostedButtonId;

    if (!hostedButtonId || !document.querySelector(containerSelector) || !paypal?.Donation?.Button) {
      return;
    }

    paypal.Donation.Button({
      onInit: function () {
        console.log('called');
      },
      env: environment.paypal.donationEnv,
      hosted_button_id: hostedButtonId,
      image: {
        title: 'PayPal - The safer, easier way to pay online!',
        alt: 'Donate with PayPal button'
      },
      onComplete: function () {
        console.log('called');
      },
    }).render(containerSelector);
  }
}
