import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { SponsorsComponent } from './sponsors.component';

describe('SponsorsComponent', () => {
  it('sends structured sponsorship metadata including sponsorship level', async () => {
    const emailService = jasmine.createSpyObj('EmailService', ['sendEmail']);
    emailService.sendEmail.and.returnValue(of({ status: true }));
    const component = new SponsorsComponent(new FormBuilder(), emailService);

    component.sponsorForm.setValue({
      contactName: 'Pat Halcrow',
      contactTitle: 'Owner',
      companyName: 'Pat Co',
      website: 'https://example.com',
      email: 'pat@example.com',
      phone: '555-121-2121',
      streetAddress: '123 Main St',
      city: 'San Diego',
      zipcode: '92128',
      state: 'CA',
      sponsorshipLevel: 'platinum',
    });

    await component.onSubmit(component.sponsorForm);

    const formData = emailService.sendEmail.calls.mostRecent().args[7];
    expect(formData.formType).toBe('sponsorshipForm');
    expect(formData.companyName).toBe('Pat Co');
    expect(formData.sponsorshipLevel).toBe('platinum');
    expect(emailService.sendEmail.calls.mostRecent().args[2]).toBe(
      'New Sponsorship Submission - Name: Pat Co | Email: pat@example.com'
    );
  });
});
