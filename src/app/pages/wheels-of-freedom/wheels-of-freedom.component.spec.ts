import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { of, Subject } from 'rxjs';
import { EmailService } from 'src/app/services/email.service';
import { OrderService } from 'src/app/services/order.service';
import { PaypalDonationService } from 'src/app/services/paypal-donation.service';
import { WheelsOfFreedomComponent } from './wheels-of-freedom.component';

describe('WheelsOfFreedomComponent', () => {
  let component: WheelsOfFreedomComponent;
  let fixture: ComponentFixture<WheelsOfFreedomComponent>;
  let orderService: any;
  let emailService: any;
  let paypalDonationService: any;

  beforeEach(async () => {
    emailService = {
      sendEmail: jasmine.createSpy('sendEmail').and.returnValue(of({ status: true }))
    };
    orderService = {
      createStripeEmbeddedSession: jasmine.createSpy('createStripeEmbeddedSession').and.returnValue(
        of({ client_secret: 'cs_test_preloaded' })
      ),
      submitOrder: jasmine.createSpy('submitOrder')
    };
    paypalDonationService = {
      renderDonationButton: jasmine.createSpy('renderDonationButton')
    };

    await TestBed.configureTestingModule({
      declarations: [WheelsOfFreedomComponent],
      imports: [ReactiveFormsModule, RouterTestingModule],
      providers: [
        FormBuilder,
        { provide: EmailService, useValue: emailService },
        { provide: OrderService, useValue: orderService },
        { provide: PaypalDonationService, useValue: paypalDonationService },
      ],
    }).compileComponents();

    component = new WheelsOfFreedomComponent(
      new FormBuilder(),
      emailService as any,
      orderService,
      paypalDonationService as any,
      { queryParams: of({}) } as any
    );

    (window as any).Stripe = jasmine.createSpy('Stripe').and.returnValue({
      initEmbeddedCheckout: jasmine.createSpy('initEmbeddedCheckout').and.returnValue(
        Promise.resolve({
          mount: jasmine.createSpy('mount'),
          destroy: jasmine.createSpy('destroy')
        })
      )
    });
  });

  afterEach(() => {
    delete (window as any).Stripe;
  });

  it('shows the motor show as closed without registration controls', () => {
    fixture = TestBed.createComponent(WheelsOfFreedomComponent);
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(nativeElement.textContent).toContain('Motor show registration is closed for the season.');
    expect(nativeElement.textContent).not.toContain('Enter Motor Show');
    expect(nativeElement.querySelector('[data-bs-target="#motorShowModal"]')).toBeFalsy();
    expect(nativeElement.querySelector('#motorShowModal')).toBeFalsy();
    expect(nativeElement.querySelector('form')).toBeFalsy();
    expect(nativeElement.textContent).not.toContain('Pay by Credit Card');
    expect(nativeElement.textContent).not.toContain('PayPal');
    expect(nativeElement.textContent).not.toContain('Pay by Check');
  });

  it('preloads a Stripe session after the motor show form is valid and stable', fakeAsync(() => {
    component.ngOnInit();
    component.motorShowForm.patchValue(validMotorShowForm());

    tick(700);

    expect(orderService.createStripeEmbeddedSession).toHaveBeenCalledTimes(1);
    expect(component.preloadedStripeClientSecret).toBe('cs_test_preloaded');
  }));

  it('uses the preloaded Stripe session when the credit card button is clicked', fakeAsync(() => {
    component.ngOnInit();
    component.motorShowForm.patchValue(validMotorShowForm());
    tick(700);

    component.onStripeClick();
    tick(60);

    expect(orderService.createStripeEmbeddedSession).toHaveBeenCalledTimes(1);
    expect(component.showStripeCheckout).toBeTrue();
    expect(component.stripeIsLoading).toBeFalse();
  }));

  it('waits for an in-flight preload instead of creating a second Stripe session', fakeAsync(() => {
    const preloadResponse = new Subject<any>();
    orderService.createStripeEmbeddedSession.and.returnValue(preloadResponse.asObservable());
    component.ngOnInit();
    component.motorShowForm.patchValue(validMotorShowForm());
    tick(700);

    component.onStripeClick();

    expect(orderService.createStripeEmbeddedSession).toHaveBeenCalledTimes(1);
    expect(component.stripeIsLoading).toBeTrue();

    preloadResponse.next({ client_secret: 'cs_test_waited_for_preload' });
    preloadResponse.complete();
    tick(60);

    expect(orderService.createStripeEmbeddedSession).toHaveBeenCalledTimes(1);
    expect(component.showStripeCheckout).toBeTrue();
    expect(component.stripeIsLoading).toBeFalse();
  }));

  it('sends a standardized customer confirmation email for pay by check entries', () => {
    component.motorShowForm.patchValue(validMotorShowForm());
    component.cartTotal = 25;

    component.onPayByCheck();

    expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
    const receiptCall = emailService.sendEmail.calls.argsFor(1);
    expect(receiptCall[0]).toBe('pat@example.com');
    expect(receiptCall[2]).toBe('Wheels of Freedom Motor Show — Entry Confirmation');
    expect(receiptCall[1]).toContain('Wheels of Freedom Motor Show Entry Confirmation');
    expect(receiptCall[1]).toContain('Pay by check confirmation');
    expect(receiptCall[1]).toContain('border-collapse: collapse');
    expect(receiptCall[1]).toContain('1967 Ford Mustang (Red)');
    expect(receiptCall[1]).toContain('$25.00');
    expect(receiptCall[1]).toContain('P.O. Box 270736');
    expect(receiptCall[1]).not.toContain('Reply directly to this email to contact the submitter.');
  });

  it('sends a standardized admin notification email for pay by check entries', () => {
    component.motorShowForm.patchValue({
      ...validMotorShowForm(),
      clubAffiliation: 'Fourth Club',
    });
    component.cartTotal = 25;

    component.onPayByCheck();

    expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
    const adminCall = emailService.sendEmail.calls.argsFor(0);
    expect(adminCall[2]).toBe('New Motor Show Entry — Check Payment');
    expect(adminCall[1]).toContain('Motor Show Check Payment Entry');
    expect(adminCall[1]).toContain('New motor show check payment');
    expect(adminCall[1]).toContain('border-collapse: collapse');
    expect(adminCall[1]).toContain('mailto:pat@example.com');
    expect(adminCall[1]).toContain('1967 Ford Mustang (Red)');
    expect(adminCall[1]).toContain('Fourth Club');
    expect(adminCall[1]).toContain('$25.00');
    expect(adminCall[1]).not.toContain('New Motor Show Entry — Pay by Check\n\n');
    expect(adminCall[7]).toEqual(jasmine.objectContaining({
      formType: 'motorShowOrder',
      paymentMethod: 'check',
      streetAddress: '123 Main St',
      year: '1967',
      clubAffiliation: 'Fourth Club',
      total: 25,
    }));
  });
});

function validMotorShowForm() {
  return {
    firstName: 'Pat',
    lastName: 'Driver',
    email: 'pat@example.com',
    phone: '555-555-1212',
    streetAddress: '123 Main St',
    city: 'San Diego',
    zipcode: '92128',
    state: 'CA',
    year: '1967',
    make: 'Ford',
    model: 'Mustang',
    color: 'Red',
    clubAffiliation: '',
    addShirtBundle: false,
    selectedShirt: null
  };
}
