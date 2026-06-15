import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { ParadeComponent } from './parade.component';

describe('ParadeComponent', () => {
  it('sends structured parade form metadata for backend submission storage', () => {
    const emailService = jasmine.createSpyObj('EmailService', ['sendEmail']);
    emailService.sendEmail.and.returnValue(of({ status: true }));
    const component = new ParadeComponent(new FormBuilder(), emailService);

    component.paradeEntryForm.setValue({
      entryName: 'Rancho Float',
      contactName: 'Pat Halcrow',
      email: 'pat@example.com',
      phone: '555-121-2121',
      streetAddress: '123 Main St',
      city: 'San Diego',
      zipcode: '92128',
      state: 'CA',
      description: 'Decorated community float',
      paradeAnnouncement: 'Celebrating the Fourth',
      wantGift: 'Yes',
      signatureName: 'Pat Halcrow',
      entryType: 'Float',
    });

    component.onSubmit('PARADE');

    const formData = emailService.sendEmail.calls.mostRecent().args[7];
    expect(formData.formType).toBe('paradeEntryForm');
    expect(formData.entryName).toBe('Rancho Float');
    expect(formData.paradeAnnouncement).toBe('Celebrating the Fourth');
    expect(formData.entryType).toBe('Float');
  });

  it('sends structured car and vip metadata for backend submission storage', () => {
    const emailService = jasmine.createSpyObj('EmailService', ['sendEmail']);
    emailService.sendEmail.and.returnValue(of({ status: true }));
    const component = new ParadeComponent(new FormBuilder(), emailService);

    component.carEntryForm.setValue({
      contactName: 'Pat Driver',
      email: 'driver@example.com',
      phone: '555-121-2121',
      streetAddress: '123 Main St',
      city: 'San Diego',
      zipcode: '92128',
      state: 'CA',
      description: 'Convertible',
      wantGift: 'No',
      signatureName: 'Pat Driver',
      make: 'Chevrolet',
      model: 'Camaro',
      color: 'Blue',
      year: '1969',
      availableSeats: '2',
    });

    component.onSubmit('CAR');

    let formData = emailService.sendEmail.calls.mostRecent().args[7];
    expect(formData.formType).toBe('carEntryForm');
    expect(formData.make).toBe('Chevrolet');
    expect(formData.availableSeats).toBe('2');

    component.vipEntryForm.setValue({
      vipName: 'Council Member Smith',
      contactName: 'Pat VIP',
      email: 'vip@example.com',
      phone: '555-121-2121',
      streetAddress: '123 Main St',
      city: 'San Diego',
      zipcode: '92128',
      state: 'CA',
      paradeAnnouncement: 'Welcome our VIP',
      signatureName: 'Pat VIP',
      vipOwnCar: 'Yes',
      make: 'Ford',
      model: 'Mustang',
      color: 'Red',
      year: '2020',
      driversName: 'Driver One',
      driversPhone: '555-222-3333',
      driversEmail: 'driver@example.com',
    });

    component.onSubmit('VIP');

    formData = emailService.sendEmail.calls.mostRecent().args[7];
    expect(formData.formType).toBe('vipEntryForm');
    expect(formData.vipName).toBe('Council Member Smith');
    expect(formData.driversName).toBe('Driver One');
  });
});
