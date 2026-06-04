import { fakeAsync, tick } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { VendorsComponent } from './vendors.component';

describe('VendorsComponent', () => {
  let component: VendorsComponent;
  let orderService: any;

  beforeEach(() => {
    orderService = {
      createStripeEmbeddedSession: jasmine.createSpy('createStripeEmbeddedSession').and.returnValue(
        of({ client_secret: 'cs_test_vendor' })
      )
    };

    component = new VendorsComponent(
      new FormBuilder(),
      { sendEmail: jasmine.createSpy('sendEmail').and.returnValue(of({ status: true })) } as any,
      { postFiles: jasmine.createSpy('postFiles') } as any,
      orderService
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

  it('uses card loading state and scrolls to embedded checkout for vendor credit card payments', fakeAsync(() => {
    const checkoutSection = {
      nativeElement: {
        scrollIntoView: jasmine.createSpy('scrollIntoView')
      }
    };
    (component as any).stripeCheckoutSection = checkoutSection;
    component.vendorApplicationForm.patchValue(validVendorForm());

    component.onVendorStripeClick();

    expect(component.paymentMethod).toBe('stripe');
    expect(component.isLoading).toBeFalse();
    expect(component.stripeIsLoading).toBeTrue();

    tick(60);

    expect(orderService.createStripeEmbeddedSession).toHaveBeenCalledTimes(1);
    expect(component.showStripeCheckout).toBeTrue();
    expect(component.stripeIsLoading).toBeFalse();
    expect(checkoutSection.nativeElement.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start'
    });
  }));

  it('scrolls to the first invalid field when credit card payment is clicked with an incomplete form', () => {
    const invalidControl = {
      scrollIntoView: jasmine.createSpy('scrollIntoView'),
      focus: jasmine.createSpy('focus')
    };
    spyOn(document, 'querySelector').and.returnValue(invalidControl as any);

    component.onVendorStripeClick();

    expect(orderService.createStripeEmbeddedSession).not.toHaveBeenCalled();
    expect(component.stripeIsLoading).toBeFalse();
    expect(invalidControl.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center'
    });
    expect(invalidControl.focus).toHaveBeenCalled();
  });
});

function validVendorForm() {
  return {
    vendorStatus: 'New Vendor',
    vendorType: 'Information Only',
    companyName: 'Test Company',
    contactName: 'Pat Vendor',
    email: 'pat@example.com',
    phone: '555-555-1212',
    streetAddress: '123 Main St',
    city: 'San Diego',
    zipcode: '92128',
    state: 'CA',
    website: 'https://example.com',
    specialRequests: '',
    description: 'Information booth',
    agreeCheckbox: true,
    signatureName: 'Pat Vendor'
  };
}
