import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { EmailService } from 'src/app/services/email.service';
import { VolunteersComponent } from './volunteers.component';

describe('VolunteersComponent', () => {
  let fixture: ComponentFixture<VolunteersComponent>;
  let component: VolunteersComponent;
  let emailService: jasmine.SpyObj<EmailService>;

  beforeEach(async () => {
    emailService = jasmine.createSpyObj<EmailService>('EmailService', ['sendEmail']);
    emailService.sendEmail.and.returnValue(of({ status: true }));

    await TestBed.configureTestingModule({
      declarations: [VolunteersComponent],
      imports: [ReactiveFormsModule],
      providers: [{ provide: EmailService, useValue: emailService }],
    }).compileComponents();

    fixture = TestBed.createComponent(VolunteersComponent);
    component = fixture.componentInstance;
  });

  it('sends volunteer form metadata for backend submission storage', async () => {
    component.volunteerForm.setValue({
      contactName: 'Pat Halcrow',
      organizationName: 'Spirit Testers',
      email: 'pat@example.com',
      phone: '555-121-2121',
      availability: 'Morning setup',
      message: 'Happy to help',
    });

    await component.onSubmit(component.volunteerForm);

    expect(emailService.sendEmail).toHaveBeenCalled();
    const formData = emailService.sendEmail.calls.mostRecent().args[7];
    expect(formData.formType).toBe('volunteerForm');
    expect(formData.contactName).toBe('Pat Halcrow');
    expect(formData.availability).toBe('Morning setup');
    expect(formData.message).toBe('Happy to help');
  });
});
