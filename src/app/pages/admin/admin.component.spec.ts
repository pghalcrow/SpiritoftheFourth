import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { AdminComponent } from './admin.component';
import { CmsService } from 'src/app/services/cms.service';

describe('AdminComponent', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let component: AdminComponent;
  let cmsService: jasmine.SpyObj<CmsService>;

  beforeEach(async () => {
    cmsService = jasmine.createSpyObj<CmsService>('CmsService', [
      'getEvents',
      'updateEvents',
      'uploadImage',
      'resolveAssetUrl',
      'getSubmissions',
      'updateSubmissionAdminFields',
    ]);
    cmsService.getEvents.and.returnValue(of({
      events: [{
        title: 'Golf Fundraiser',
        type: 'golfEvent',
        flyerUrl: 'assets/2026_golf_flyer.png',
        description: 'Fundraiser details',
        eventMeta: {
          dateOfEvent: 'Saturday June 6, 2026',
          location: 'Oaks North Golf Course',
          endBlurb: 'Check in opens at 7:30 AM.',
          contactEmail: 'test@example.com'
        },
        pricing: {
          basePlayerField: 'teamMembers',
          includePrimaryPlayer: true,
          pricePerPlayer: 110,
          addOns: [{ field: 'Tee Sign Hole Sponsor', price: 100 }]
        },
        formFields: [{
          name: 'fullName',
          label: 'Full Name',
          type: 'text',
          required: true,
          fields: []
        }],
        sections: []
      }]
    }));
    cmsService.updateEvents.and.returnValue(of({ success: true }));
    cmsService.uploadImage.and.returnValue(of({ success: true, url: 'assets/new-flyer.png' }));
    cmsService.resolveAssetUrl.and.callFake((url: string) => url);
    cmsService.getSubmissions.and.returnValue(of({ items: [] }));
    cmsService.updateSubmissionAdminFields.and.returnValue(of({} as any));

    await TestBed.configureTestingModule({
      declarations: [AdminComponent],
      imports: [FormsModule, DragDropModule],
      providers: [
        { provide: CmsService, useValue: cmsService },
        {
          provide: Router,
          useValue: { navigate: jasmine.createSpy('navigate') }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
    spyOn(window, 'alert');
    spyOn(window, 'confirm').and.returnValue(false);
    fixture.detectChanges();
  });

  it('renders the admin editor with modern form controls', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(nativeElement.querySelector('.admin-shell')).toBeTruthy();
    expect(nativeElement.querySelector('.admin-toolbar')).toBeTruthy();
    expect(nativeElement.querySelector('.event-tabs')).toBeTruthy();
    expect(nativeElement.querySelector('.event-tab.active')).toBeTruthy();
    expect(nativeElement.querySelector('.event-card')).toBeTruthy();
    expect(nativeElement.querySelectorAll('.control-group').length).toBeGreaterThan(6);
    expect(nativeElement.querySelector('.field-card')).toBeTruthy();
    expect(nativeElement.querySelector('.toggle-control')).toBeTruthy();
    expect(nativeElement.querySelector('.action-button.primary')).toBeTruthy();
    expect(nativeElement.querySelector('.action-button.danger')).toBeTruthy();
  });

  it('adds a new event tab and selects it', () => {
    component.addEvent();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const tabs = nativeElement.querySelectorAll('.event-tab');

    expect(component.events.length).toBe(2);
    expect(component.activeEventIndex).toBe(1);
    expect(tabs.length).toBe(2);
    expect(tabs[1].classList).toContain('active');
    expect(tabs[1].textContent).toContain('New Event 2');
  });

  it('hides the flyer preview for a new event without an image', () => {
    component.addEvent();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(component.activeEvent?.flyerUrl).toBe('');
    expect(nativeElement.querySelector('.upload-panel')).toBeTruthy();
    expect(nativeElement.querySelector('.flyer-img')).toBeFalsy();
  });

  it('saves the uploaded flyer url for a new event', () => {
    component.addEvent();
    const selectedFile = new File(['image'], 'new-flyer.png', { type: 'image/png' });
    component.activeEvent!.selectedFile = selectedFile;

    component.saveEvents();

    expect(cmsService.uploadImage).toHaveBeenCalledWith(selectedFile);
    expect(cmsService.updateEvents).toHaveBeenCalled();

    const savedEvents = cmsService.updateEvents.calls.mostRecent().args[0];
    expect(savedEvents[1].flyerUrl).toBe('assets/new-flyer.png');
  });

  it('shows save success in a modal instead of a browser alert', () => {
    component.saveEvents();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(window.alert).not.toHaveBeenCalled();
    expect(nativeElement.querySelector('.admin-modal')).toBeTruthy();
    expect(nativeElement.querySelector('.admin-modal')?.textContent).toContain('Events saved');
  });

  it('shows invalid image errors in a modal instead of a browser alert', () => {
    const file = new File(['not image'], 'notes.txt', { type: 'text/plain' });

    component.onFileSelected({ target: { files: [file] } }, component.events[0]);
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(window.alert).not.toHaveBeenCalled();
    expect(nativeElement.querySelector('.admin-modal')).toBeTruthy();
    expect(nativeElement.querySelector('.admin-modal')?.textContent).toContain('Only images are allowed');
  });

  it('uses a modal confirmation before deleting an event', () => {
    component.deleteEvent(0);
    fixture.detectChanges();

    let nativeElement = fixture.nativeElement as HTMLElement;

    expect(window.confirm).not.toHaveBeenCalled();
    expect(component.events.length).toBe(1);
    expect(nativeElement.querySelector('.admin-modal')).toBeTruthy();
    expect(nativeElement.querySelector('.admin-modal')?.textContent).toContain('Delete event');

    component.confirmModal();
    fixture.detectChanges();
    nativeElement = fixture.nativeElement as HTMLElement;

    expect(component.events.length).toBe(0);
    expect(nativeElement.querySelector('.admin-modal')).toBeFalsy();
  });

  it('switches to submissions and renders spreadsheet rows', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 's1',
        submissionTitle: 'Volunteer Request',
        submittedAt: '2026-06-05T10:00:00-07:00',
        name: 'Pat Halcrow',
        email: 'pat@example.com',
        phone: '555-1212',
        paymentStatus: 'none',
        paymentProvider: 'none',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: { message: 'Available morning' },
      }]
    }));

    const nativeElement = fixture.nativeElement as HTMLElement;
    const button = nativeElement.querySelector('[data-testid="admin-section-submissions"]') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(cmsService.getSubmissions).toHaveBeenCalled();
    expect(nativeElement.querySelector('.submissions-table')?.textContent).toContain('Volunteer Request');
    expect(nativeElement.querySelector('.submissions-table')?.textContent).toContain('Pat Halcrow');
  });

  it('opens a submission detail panel and saves admin fields', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 's1',
        submissionTitle: 'Volunteer Request',
        submittedAt: '2026-06-05T10:00:00-07:00',
        name: 'Pat Halcrow',
        email: 'pat@example.com',
        phone: '555-1212',
        paymentStatus: 'none',
        paymentProvider: 'none',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: { message: 'Available morning' },
      }]
    }));
    cmsService.updateSubmissionAdminFields.and.returnValue(of({
      submissionId: 's1',
      submissionTitle: 'Volunteer Request',
      status: 'Complete',
      assignedTo: 'Patrick',
      notes: 'Verified',
    } as any));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();
    nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-s1"]')!.click();
    fixture.detectChanges();

    component.selectedSubmission!.status = 'Complete';
    component.selectedSubmission!.assignedTo = 'Patrick';
    component.selectedSubmission!.notes = 'Verified';
    component.saveSelectedSubmission();

    expect(cmsService.updateSubmissionAdminFields).toHaveBeenCalledWith('s1', {
      status: 'Complete',
      assignedTo: 'Patrick',
      notes: 'Verified',
    });
  });
});
