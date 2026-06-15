import { fakeAsync, tick } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { VendorsComponent } from './vendors.component';

describe('VendorsComponent', () => {
  let component: VendorsComponent;
  let orderService: any;
  let uploadService: any;

  beforeEach(() => {
    orderService = {
      createStripeEmbeddedSession: jasmine.createSpy('createStripeEmbeddedSession').and.returnValue(
        of({ client_secret: 'cs_test_vendor' })
      )
    };

    uploadService = { postFiles: jasmine.createSpy('postFiles') };

    component = new VendorsComponent(
      new FormBuilder(),
      { sendEmail: jasmine.createSpy('sendEmail').and.returnValue(of({ status: true })) } as any,
      uploadService,
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
    expect(orderService.createStripeEmbeddedSession.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        vendorType: 'Information Only',
        grandTotal: 50,
        type: 'vendorApplication',
        paymentMethod: 'stripe'
      })
    );
    expect(component.showStripeCheckout).toBeTrue();
    expect(component.stripeIsLoading).toBeFalse();
    expect(checkoutSection.nativeElement.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start'
    });
  }));

  it('initializes vendor Stripe checkout with the publishable key returned by the backend', fakeAsync(() => {
    orderService.createStripeEmbeddedSession.and.returnValue(
      of({ client_secret: 'cs_test_vendor', publishable_key: 'pk_test_backend' })
    );
    component.vendorApplicationForm.patchValue(validVendorForm());

    component.onVendorStripeClick();
    tick(60);

    expect((window as any).Stripe).toHaveBeenCalledWith('pk_test_backend');
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

  it('restores the vendor form when embedded checkout response is missing a client secret', fakeAsync(() => {
    orderService.createStripeEmbeddedSession.and.returnValue(of({ status: 'submitted' }));
    spyOn(window, 'alert');
    component.vendorApplicationForm.patchValue(validVendorForm());

    component.onVendorStripeClick();
    tick(60);

    expect(component.showStripeCheckout).toBeFalse();
    expect(component.stripeIsLoading).toBeFalse();
    expect(component.vendorApplicationForm.enabled).toBeTrue();
    expect(window.alert).toHaveBeenCalledWith('Error initiating payment. Please try again.');
  }));

  it('restores the vendor form when attachment upload fails before card payment starts', () => {
    uploadService.postFiles.and.returnValue(throwError(() => ({ status: 405 })));
    spyOn(window, 'alert');
    component.vendorApplicationForm.patchValue(validVendorForm());
    component.files = [new File(['application'], 'vendor.pdf', { type: 'application/pdf' })];

    component.onVendorStripeClick();

    expect(orderService.createStripeEmbeddedSession).not.toHaveBeenCalled();
    expect(component.stripeIsLoading).toBeFalse();
    expect(component.vendorApplicationForm.enabled).toBeTrue();
    expect(window.alert).toHaveBeenCalledWith('Error uploading attachments. Please try again.');
  });

  it('sends structured artist signup metadata for backend submission storage', async () => {
    const emailService = (component as any).emailService;
    component.artistForm.setValue({
      contactName: 'Pat Artist',
      organizationName: 'Studio Test',
      email: 'artist@example.com',
      phone: '555-121-2121',
      message: 'Interested in performing',
    });

    await component.onSubmit(component.artistForm, 'artist');

    const formData = emailService.sendEmail.calls.mostRecent().args[7];
    expect(formData.formType).toBe('artistSignUpForm');
    expect(formData.contactName).toBe('Pat Artist');
    expect(formData.message).toBe('Interested in performing');
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
