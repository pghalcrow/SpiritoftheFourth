import { FormControl, FormGroup } from '@angular/forms';
import { EmailUtlity } from './email-utility';

describe('EmailUtlity', () => {
  it('formats volunteer request emails as a readable admin summary', () => {
    const form = new FormGroup({
      contactName: new FormControl('Pat Halcrow'),
      organizationName: new FormControl('Spirit Testers'),
      email: new FormControl('pat@example.com'),
      phone: new FormControl('555-121-2121'),
      availability: new FormControl('Morning setup'),
      message: new FormControl('Happy to help wherever needed.'),
    });

    const html = EmailUtlity.createVolunteerFormHTMLBody(form);

    expect(html).toContain('Volunteer Request');
    expect(html).toContain('New volunteer signup');
    expect(html).toContain('border-collapse: collapse');
    expect(html).toContain('mailto:pat@example.com');
    expect(html).toContain('tel:5551212121');
    expect(html).toContain('Morning setup');
    expect(html).toContain('Happy to help wherever needed.');
  });

  it('formats parade entry emails as a complete normalized admin summary', () => {
    const form = new FormGroup({
      entryName: new FormControl('Rancho Float'),
      contactName: new FormControl('Pat Halcrow'),
      email: new FormControl('pat@example.com'),
      phone: new FormControl('555-121-2121'),
      streetAddress: new FormControl('123 Main St'),
      city: new FormControl('San Diego'),
      state: new FormControl('CA'),
      zipcode: new FormControl('92128'),
      description: new FormControl('Decorated community float'),
      paradeAnnouncement: new FormControl('Celebrating the Fourth'),
      wantGift: new FormControl('Yes'),
      entryType: new FormControl('Float'),
      signatureName: new FormControl('Pat Halcrow'),
    });

    const html = EmailUtlity.createParadeEntryHTMLBody(form);

    expect(html).toContain('Parade Entry Request');
    expect(html).toContain('New parade entry');
    expect(html).toContain('border-collapse: collapse');
    expect(html).toContain('Rancho Float');
    expect(html).toContain('Pat Halcrow');
    expect(html).toContain('mailto:pat@example.com');
    expect(html).toContain('tel:5551212121');
    expect(html).toContain('123 Main St, San Diego, CA 92128');
    expect(html).toContain('Decorated community float');
    expect(html).toContain('Celebrating the Fourth');
    expect(html).toContain('Appreciation Gift');
    expect(html).toContain('Entry Type');
    expect(html).toContain('Signature Name');
  });

  it('formats car entry emails with driver and vehicle details in the normalized summary', () => {
    const form = new FormGroup({
      contactName: new FormControl('Pat Halcrow'),
      email: new FormControl('pat@example.com'),
      phone: new FormControl('555-121-2121'),
      streetAddress: new FormControl('123 Main St'),
      city: new FormControl('San Diego'),
      state: new FormControl('CA'),
      zipcode: new FormControl('92128'),
      year: new FormControl('1969'),
      make: new FormControl('Chevrolet'),
      model: new FormControl('Camaro'),
      color: new FormControl('Blue'),
      availableSeats: new FormControl('2'),
      description: new FormControl('Convertible available for VIPs'),
      wantGift: new FormControl('No'),
      signatureName: new FormControl('Pat Halcrow'),
    });

    const html = EmailUtlity.createCarEntryHTMLBody(form);

    expect(html).toContain('Parade Car Entry Request');
    expect(html).toContain('1969 Chevrolet Camaro, Blue');
    expect(html).toContain('Available VIP Seats');
    expect(html).toContain('Convertible available for VIPs');
    expect(html).toContain('Appreciation Gift');
  });

  it('formats vip entry emails with optional vehicle fields when the VIP provides a car', () => {
    const form = new FormGroup({
      vipName: new FormControl('Council Member Smith'),
      contactName: new FormControl('Pat Halcrow'),
      email: new FormControl('pat@example.com'),
      phone: new FormControl('555-121-2121'),
      streetAddress: new FormControl('123 Main St'),
      city: new FormControl('San Diego'),
      state: new FormControl('CA'),
      zipcode: new FormControl('92128'),
      paradeAnnouncement: new FormControl('Welcome our VIP'),
      vipOwnCar: new FormControl('Yes'),
      driversName: new FormControl('Driver One'),
      driversEmail: new FormControl('driver@example.com'),
      driversPhone: new FormControl('555-222-3333'),
      year: new FormControl('2020'),
      make: new FormControl('Ford'),
      model: new FormControl('Mustang'),
      color: new FormControl('Red'),
      signatureName: new FormControl('Pat Halcrow'),
    });

    const html = EmailUtlity.createVIPEntryHTMLBody(form);

    expect(html).toContain('Parade VIP Entry Request');
    expect(html).toContain('Council Member Smith');
    expect(html).toContain('Driver One');
    expect(html).toContain('mailto:driver@example.com');
    expect(html).toContain('tel:5552223333');
    expect(html).toContain('2020 Ford Mustang, Red');
  });

  it('formats sponsorship emails with sponsorship level included', () => {
    const form = new FormGroup({
      contactName: new FormControl('Pat Halcrow'),
      contactTitle: new FormControl('Owner'),
      companyName: new FormControl('Pat Co'),
      website: new FormControl('https://example.com'),
      email: new FormControl('pat@example.com'),
      phone: new FormControl('555-121-2121'),
      streetAddress: new FormControl('123 Main St'),
      city: new FormControl('San Diego'),
      state: new FormControl('CA'),
      zipcode: new FormControl('92128'),
      sponsorshipLevel: new FormControl('platinum'),
    });

    const html = EmailUtlity.createSponsorshipHTMLBody(form);

    expect(html).toContain('Sponsorship Submission');
    expect(html).toContain('Sponsorship Level');
    expect(html).toContain('platinum');
    expect(html).toContain('https://example.com');
  });

  it('formats motor show check confirmation emails as a standardized customer summary', () => {
    const html = EmailUtlity.createMotorShowCheckConfirmationHTMLBody({
      name: 'Pat Driver',
      vehicle: '1967 Ford Mustang (Red)',
      shirtBundle: 'Yes - Large',
      totalDue: 60,
    });

    expect(html).toContain('Wheels of Freedom Motor Show Entry Confirmation');
    expect(html).toContain('Pay by check confirmation');
    expect(html).toContain('border-collapse: collapse');
    expect(html).toContain('Your entry has been received.');
    expect(html).toContain('Pat Driver');
    expect(html).toContain('1967 Ford Mustang (Red)');
    expect(html).toContain('T-Shirt &amp; Plaque Bundle');
    expect(html).toContain('Yes - Large');
    expect(html).toContain('$60.00');
    expect(html).toContain('The Spirit of the Fourth');
    expect(html).toContain('P.O. Box 270736');
    expect(html).toContain('San Diego, CA 92198');
    expect(html).not.toContain('Reply directly to this email to contact the submitter.');
  });

  it('formats motor show check admin emails as a normalized admin summary', () => {
    const html = EmailUtlity.createMotorShowCheckAdminHTMLBody({
      name: 'Pat Driver',
      email: 'pat@example.com',
      phone: '555-555-1212',
      address: '123 Main St, San Diego, CA 92128',
      vehicle: '1967 Ford Mustang (Red)',
      clubAffiliation: 'Fourth Club',
      shirtBundle: 'No',
      totalDue: 25,
    });

    expect(html).toContain('Motor Show Check Payment Entry');
    expect(html).toContain('New motor show check payment');
    expect(html).toContain('border-collapse: collapse');
    expect(html).toContain('Pat Driver');
    expect(html).toContain('mailto:pat@example.com');
    expect(html).toContain('tel:5555551212');
    expect(html).toContain('123 Main St, San Diego, CA 92128');
    expect(html).toContain('1967 Ford Mustang (Red)');
    expect(html).toContain('Fourth Club');
    expect(html).toContain('$25.00');
    expect(html).toContain('Reply directly to this email to contact the submitter.');
  });
});
