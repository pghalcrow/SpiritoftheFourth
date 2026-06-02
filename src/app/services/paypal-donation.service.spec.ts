import { TestBed } from '@angular/core/testing';
import { environment } from 'src/environments/environment';

import { PaypalDonationService } from './paypal-donation.service';

describe('PaypalDonationService', () => {
  let service: PaypalDonationService;
  let originalPayPal: any;
  let originalHostedButtonId: string;
  let container: HTMLElement;

  beforeEach(() => {
    originalPayPal = (window as any).PayPal;
    originalHostedButtonId = environment.paypal.donationHostedButtonId;
    container = document.createElement('div');
    container.id = 'paypal-test';
    document.body.appendChild(container);
    TestBed.configureTestingModule({});
    service = TestBed.inject(PaypalDonationService);
  });

  afterEach(() => {
    (window as any).PayPal = originalPayPal;
    environment.paypal.donationHostedButtonId = originalHostedButtonId;
    container.remove();
  });

  it('renders donation buttons from the configured PayPal environment', () => {
    const buttonSpy = jasmine.createSpy('Button').and.returnValue({
      render: jasmine.createSpy('render')
    });
    (window as any).PayPal = {
      Donation: {
        Button: buttonSpy
      }
    };
    environment.paypal.donationHostedButtonId = 'SANDBOX_BUTTON';

    service.renderDonationButton('#paypal-test');

    expect(buttonSpy).toHaveBeenCalledWith(jasmine.objectContaining({
      env: environment.paypal.donationEnv,
      hosted_button_id: 'SANDBOX_BUTTON'
    }));
  });

  it('does not render when no hosted donation button is configured', () => {
    const buttonSpy = jasmine.createSpy('Button');
    (window as any).PayPal = {
      Donation: {
        Button: buttonSpy
      }
    };
    environment.paypal.donationHostedButtonId = '';

    service.renderDonationButton('#paypal-test');

    expect(buttonSpy).not.toHaveBeenCalled();
  });
});
