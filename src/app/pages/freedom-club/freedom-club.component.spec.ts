import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { OrderService } from 'src/app/services/order.service';
import { FreedomClubComponent } from './freedom-club.component';

describe('FreedomClubComponent', () => {
  let fixture: ComponentFixture<FreedomClubComponent>;
  let component: FreedomClubComponent;
  let orderService: jasmine.SpyObj<OrderService>;

  beforeEach(async () => {
    orderService = jasmine.createSpyObj<OrderService>('OrderService', [
      'createEventPayPalOrder',
      'createStripeEmbeddedSession',
    ]);

    await TestBed.configureTestingModule({
      declarations: [FreedomClubComponent],
      imports: [ReactiveFormsModule],
      providers: [{ provide: OrderService, useValue: orderService }],
    }).compileComponents();

    fixture = TestBed.createComponent(FreedomClubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    delete (window as any).Stripe;
  });

  it('selects preset donation amounts and uses the selected amount in the payment payload', () => {
    component.openDonationForm();
    component.selectAmount(150);
    component.donationForm.patchValue({
      fullName: 'Pat Halcrow',
      email: 'pat@example.com',
      phone: '555-1212',
    });
    orderService.createEventPayPalOrder.and.returnValue(of({ links: [] }));

    component.submitPayPalDonation();

    expect(component.selectedAmount).toBe(150);
    expect(orderService.createEventPayPalOrder).toHaveBeenCalledWith(jasmine.objectContaining({
      action: 'createOrder',
      type: 'freedomClubDonation',
      eventTitle: 'Freedom Club Donation',
      fullName: 'Pat Halcrow',
      email: 'pat@example.com',
      phone: '555-1212',
      grandTotal: 150,
      donationAmount: 150,
      paymentMethod: 'paypal',
    }));
  });

  it('uses the custom amount when selected', () => {
    component.openDonationForm();
    component.selectCustomAmount();
    component.donationForm.patchValue({ customAmount: 275 });

    expect(component.currentAmount).toBe(275);
  });

  it('initializes Stripe embedded checkout for a valid donation', fakeAsync(() => {
    component.openDonationForm();
    tick();
    component.selectAmount(50);
    component.donationForm.patchValue({
      fullName: 'Pat Halcrow',
      email: 'pat@example.com',
      phone: '555-1212',
    });
    orderService.createStripeEmbeddedSession.and.returnValue(
      of({ client_secret: 'cs_test_donation', publishable_key: 'pk_test_backend' })
    );
    const mount = jasmine.createSpy('mount');
    const initEmbeddedCheckout = jasmine.createSpy('initEmbeddedCheckout').and.returnValue(Promise.resolve({ mount }));
    (window as any).Stripe = jasmine.createSpy('Stripe').and.returnValue({ initEmbeddedCheckout });

    component.submitStripeDonation();
    tick(75);

    expect((window as any).Stripe).toHaveBeenCalledWith('pk_test_backend');
    expect(initEmbeddedCheckout).toHaveBeenCalled();
    expect(mount).toHaveBeenCalledWith('#stripe-checkout-freedom-club');
    expect(orderService.createStripeEmbeddedSession).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'freedomClubDonation',
      grandTotal: 50,
      paymentMethod: 'stripe',
    }));
  }));
});
