import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { AdminComponent } from './admin.component';
import { CmsService } from 'src/app/services/cms.service';
import { environment } from 'src/environments/environment';

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
      'deleteSubmission',
      'getTestMode',
      'updateTestMode',
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
    cmsService.deleteSubmission.and.returnValue(of({ success: true, submissionId: 's1' }));
    cmsService.getTestMode.and.returnValue(of({ testMode: false }));
    cmsService.updateTestMode.and.returnValue(of({ testMode: true, updatedBy: 'developer' }));

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
    spyOn(URL, 'createObjectURL').and.returnValue('blob:preview-flyer');
    spyOn(URL, 'revokeObjectURL');
    fixture.detectChanges();
  });

  it('renders the admin editor with modern form controls', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(nativeElement.querySelector('.admin-shell')).toBeTruthy();
    expect(nativeElement.querySelector('.admin-toolbar')).toBeTruthy();
    expect(nativeElement.querySelector('.submissions-workspace')).toBeTruthy();
    expect(nativeElement.querySelector('.submissions-table')).toBeTruthy();
    expect(nativeElement.querySelector('.event-tabs')).toBeFalsy();
    expect(nativeElement.querySelector('.event-card')).toBeFalsy();
  });

  it('defaults to submissions and uses a dynamic admin header', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(component.adminSection).toBe('submissions');
    expect(cmsService.getSubmissions).toHaveBeenCalled();
    expect(nativeElement.querySelector('.admin-toolbar h1')?.textContent).toContain('Submissions');

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-events"]')!.click();
    fixture.detectChanges();

    expect(component.adminSection).toBe('events');
    expect(nativeElement.querySelector('.admin-toolbar h1')?.textContent).toContain('Upcoming Events');
  });

  it('shows events before submissions in the admin section selector', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;
    const sectionButtons = Array.from(nativeElement.querySelectorAll<HTMLButtonElement>('.section-switcher .section-button'));

    expect(sectionButtons.map(button => button.textContent?.trim())).toEqual(['Events', 'Submissions']);
  });

  it('does not show test mode controls for normal admins', () => {
    sessionStorage.setItem('adminRole', 'admin');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="developer-test-mode"]')).toBeFalsy();
    expect(cmsService.getTestMode).not.toHaveBeenCalled();
  });

  it('shows developer test mode controls and toggles live test mode', () => {
    const originalProduction = environment.production;
    environment.production = true;
    sessionStorage.setItem('adminRole', 'developer');
    try {
      component.ngOnInit();
      fixture.detectChanges();

      const panel = fixture.nativeElement.querySelector('[data-testid="developer-test-mode"]') as HTMLElement;
      const toggle = fixture.nativeElement.querySelector('[data-testid="toggle-test-mode"]') as HTMLInputElement;

      expect(panel.textContent).toContain('Live Mode');
      expect(toggle.checked).toBeFalse();

      toggle.click();
      fixture.detectChanges();

      expect(cmsService.updateTestMode).toHaveBeenCalledWith(true);
    } finally {
      environment.production = originalProduction;
    }
  });

  it('places event add and save actions on their own toolbar row', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-events"]')!.click();
    fixture.detectChanges();

    const eventActionsRow = nativeElement.querySelector('.event-toolbar-actions');
    const actionButtons = Array.from(eventActionsRow?.querySelectorAll<HTMLButtonElement>('.action-button') || []);

    expect(eventActionsRow).toBeTruthy();
    expect(actionButtons.map(button => button.textContent?.trim())).toEqual(['Add Event', 'Save Changes']);
  });

  it('uses a date picker for the event date and normalizes existing readable dates', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-events"]')!.click();
    fixture.detectChanges();

    const dateInput = nativeElement.querySelector<HTMLInputElement>('input[placeholder="Date"]');

    expect(dateInput?.type).toBe('date');
    expect(dateInput?.value).toBe('2026-06-06');
    expect(component.events[0].eventMeta.dateOfEvent).toBe('2026-06-06');
  });

  it('allows admins to add and remove multiple event contact emails', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-events"]')!.click();
    fixture.detectChanges();

    expect(component.events[0].eventMeta.contactEmails).toEqual(['test@example.com']);
    expect(nativeElement.querySelectorAll('[data-testid="event-contact-email"]').length).toBe(1);

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="add-event-contact-email"]')!.click();
    fixture.detectChanges();

    const emailInputs = nativeElement.querySelectorAll<HTMLInputElement>('[data-testid="event-contact-email"]');
    emailInputs[1].value = 'second@example.com';
    emailInputs[1].dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.events[0].eventMeta.contactEmails).toEqual(['test@example.com', 'second@example.com']);

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="remove-event-contact-email-0"]')!.click();
    fixture.detectChanges();

    expect(component.events[0].eventMeta.contactEmails).toEqual(['second@example.com']);
  });

  it('keeps the contact email input mounted while typing', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-events"]')!.click();
    fixture.detectChanges();
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="add-event-contact-email"]')!.click();
    fixture.detectChanges();

    const inputBefore = nativeElement.querySelectorAll<HTMLInputElement>('[data-testid="event-contact-email"]')[1];
    inputBefore.focus();
    inputBefore.value = 's';
    inputBefore.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const inputAfter = nativeElement.querySelectorAll<HTMLInputElement>('[data-testid="event-contact-email"]')[1];

    expect(inputAfter).toBe(inputBefore);
    expect(document.activeElement).toBe(inputBefore);
    expect(component.events[0].eventMeta.contactEmails).toEqual(['test@example.com', 's']);
  });

  it('keeps a reserved event action row when switching to submissions', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(component.adminSection).toBe('submissions');
    expect(nativeElement.querySelector('.event-toolbar-actions')).toBeTruthy();
    expect(nativeElement.querySelectorAll('.event-toolbar-actions .action-button').length).toBe(0);

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-events"]')!.click();
    fixture.detectChanges();

    expect(nativeElement.querySelectorAll('.event-toolbar-actions .action-button').length).toBe(2);

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();

    expect(nativeElement.querySelector('.event-toolbar-actions')).toBeTruthy();
    expect(nativeElement.querySelectorAll('.event-toolbar-actions .action-button').length).toBe(0);
  });

  it('shows a bottom-right save button in the event editor that saves events', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-events"]')!.click();
    fixture.detectChanges();

    const bottomSaveButton = nativeElement.querySelector<HTMLButtonElement>('[data-testid="event-editor-bottom-save"]');

    expect(bottomSaveButton).toBeTruthy();
    expect(bottomSaveButton?.textContent?.trim()).toBe('Save Changes');

    bottomSaveButton!.click();
    fixture.detectChanges();

    expect(cmsService.updateEvents).toHaveBeenCalled();
  });

  it('uses fixed price mode without requiring a participant group field', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    component.addEvent();
    component.activeEvent!.title = 'Dinner Ticket';
    component.activeEvent!.eventMeta.dateOfEvent = '2026-07-04';
    component.activeEvent!.eventMeta.location = 'Town Park';
    component.activeEvent!.pricing.pricingMode = 'fixed';
    component.activeEvent!.pricing.pricePerPlayer = 25;
    fixture.detectChanges();

    expect(nativeElement.querySelector('[data-testid="pricing-participant-field"]')).toBeFalsy();
    expect(nativeElement.querySelector('[data-testid="pricing-fixed-price"]')).toBeTruthy();

    component.saveEvents();

    const savedEvents = cmsService.updateEvents.calls.mostRecent().args[0];
    expect(savedEvents[1].pricing.pricingMode).toBe('fixed');
    expect(savedEvents[1].pricing.basePlayerField).toBe('N/A');
    expect(savedEvents[1].pricing.includePrimaryPlayer).toBeFalse();
    expect(savedEvents[1].pricing.pricePerPlayer).toBe(25);
  });

  it('shows participant field controls only for per participant pricing', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    component.addEvent();
    component.addFormField(component.activeEvent!);
    component.activeEvent!.formFields[0].label = 'Guests';
    component.activeEvent!.formFields[0].name = 'guests';
    component.activeEvent!.formFields[0].type = 'group';
    component.activeEvent!.pricing.pricingMode = 'perParticipant';
    fixture.detectChanges();

    const participantField = nativeElement.querySelector<HTMLSelectElement>('[data-testid="pricing-participant-field"]');

    expect(participantField).toBeTruthy();
    expect(participantField?.textContent).toContain('Guests');
    expect(nativeElement.querySelector('[data-testid="pricing-fixed-price"]')).toBeFalsy();
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
    expect(component.activeEvent?.isVisible).toBeTrue();
  });

  it('shows an event visibility toggle and saves hidden events', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-events"]')!.click();
    fixture.detectChanges();

    const toggle = nativeElement.querySelector<HTMLInputElement>('[data-testid="event-visible-toggle"]');

    expect(toggle).toBeTruthy();
    expect(toggle?.checked).toBeTrue();

    toggle!.click();
    fixture.detectChanges();
    component.saveEvents();

    const savedEvents = cmsService.updateEvents.calls.mostRecent().args[0];
    expect(savedEvents[0].isVisible).toBeFalse();
  });

  it('hides the flyer preview for a new event without an image', () => {
    component.addEvent();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(component.activeEvent?.flyerUrl).toBe('');
    expect(nativeElement.querySelector('.upload-panel')).toBeTruthy();
    expect(nativeElement.querySelector('.flyer-img')).toBeFalsy();
  });

  it('only shows the image picker after the current event image is removed', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-events"]')!.click();
    fixture.detectChanges();

    expect(nativeElement.querySelector('.flyer-img')).toBeTruthy();
    expect(nativeElement.querySelector('.file-picker')).toBeFalsy();

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="remove-event-image"]')!.click();
    fixture.detectChanges();

    expect(component.events[0].flyerUrl).toBe('');
    expect(component.events[0].selectedFile).toBeUndefined();
    expect(nativeElement.querySelector('.flyer-img')).toBeFalsy();
    expect(nativeElement.querySelector('.file-picker')).toBeTruthy();
  });

  it('treats a selected replacement file as the single event image until removed', () => {
    component.addEvent();
    const selectedFile = new File(['image'], 'replacement.png', { type: 'image/png' });

    component.onFileSelected({ target: { files: [selectedFile], value: 'replacement.png' } }, component.activeEvent!);
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(component.activeEvent!.selectedFile).toBe(selectedFile);
    expect(nativeElement.querySelector('.file-picker')).toBeFalsy();
    expect(nativeElement.querySelector<HTMLImageElement>('.flyer-img')?.getAttribute('src')).toBe('blob:preview-flyer');
    expect(nativeElement.querySelector('.selected-image-name')).toBeFalsy();

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="remove-event-image"]')!.click();
    fixture.detectChanges();

    expect(component.activeEvent!.selectedFile).toBeUndefined();
    expect(component.activeEvent!.selectedFilePreviewUrl).toBeUndefined();
    expect(nativeElement.querySelector('.file-picker')).toBeTruthy();
  });

  it('requires event title date and location before saving events', () => {
    component.addEvent();
    component.activeEvent!.title = '';
    component.activeEvent!.eventMeta.dateOfEvent = '';
    component.activeEvent!.eventMeta.location = '';

    component.saveEvents();
    fixture.detectChanges();

    expect(cmsService.updateEvents).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.admin-modal')?.textContent).toContain('Event details required');
  });

  it('saves the uploaded flyer url for a new event', () => {
    component.addEvent();
    const selectedFile = new File(['image'], 'new-flyer.png', { type: 'image/png' });
    component.activeEvent!.selectedFile = selectedFile;
    component.activeEvent!.title = 'New Event';
    component.activeEvent!.eventMeta.dateOfEvent = 'July 4, 2026';
    component.activeEvent!.eventMeta.location = 'Town Park';

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

  it('rejects unsupported image formats before saving events', () => {
    const file = new File(['image'], 'event.heic', { type: 'image/heic' });

    component.onFileSelected({ target: { files: [file], value: 'event.heic' } }, component.events[0]);
    fixture.detectChanges();

    expect(component.events[0].selectedFile).toBeUndefined();
    expect(cmsService.uploadImage).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.admin-modal')?.textContent).toContain('Use a PNG, JPG, or WebP image');
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

  it('renders the simplified submissions table with Google Sheet style dates and details buttons', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 's1',
        submissionTitle: 'Motor Show Event Order',
        submittedAt: '2026-06-05T10:07:00-07:00',
        name: 'Pat Halcrow',
        email: 'pat@example.com',
        phone: '555-1212',
        paymentStatus: 'paid',
        paymentProvider: 'stripe',
        status: 'New',
        assignedTo: 'Patrick',
        notes: 'Internal note',
        rawData: { message: 'Available morning' },
      }]
    }));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();

    const headerText = Array.from(nativeElement.querySelectorAll('.submissions-table th'))
      .map(header => header.textContent?.trim());
    const tableText = nativeElement.querySelector('.submissions-table')?.textContent || '';

    expect(headerText).toEqual(['Submission', 'Date', 'Name', 'Email', 'Phone', 'Details']);
    expect(tableText).toContain('2026-06-05 10:07');
    expect(tableText).not.toContain('paid');
    expect(tableText).not.toContain('Assigned To');
    expect(tableText).not.toContain('Internal note');

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="submission-details-s1"]')!.click();
    fixture.detectChanges();

    expect(component.selectedSubmission?.submissionId).toBe('s1');
    expect(nativeElement.querySelector('.submission-detail-panel')?.textContent).toContain('Motor Show Event Order');
  });

  it('displays imported motor show order titles as readable labels in the table details and search', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 'motor-import-1',
        submissionTitle: 'motorShowOrder Order',
        submittedAt: '2026-06-05T10:07:00-07:00',
        name: 'Pat Halcrow',
        email: 'pat@example.com',
        phone: '555-1212',
        paymentStatus: 'unknown',
        paymentProvider: 'unknown',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: { values: ['motorShowOrder Order'] },
      }]
    }));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();

    let tableText = nativeElement.querySelector('.submissions-table')?.textContent || '';
    expect(tableText).toContain('Motor Show Event Order');
    expect(tableText).not.toContain('motorShowOrder Order');

    nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-motor-import-1"]')!.click();
    fixture.detectChanges();

    const detailText = nativeElement.querySelector('.submission-detail-panel')?.textContent || '';
    expect(detailText).toContain('Motor Show Event Order');
    expect(detailText).not.toContain('motorShowOrder Order');

    component.clearSelectedSubmission();
    component.submissionSearch = 'Motor Show Event Order';
    fixture.detectChanges();

    tableText = nativeElement.querySelector('.submissions-table')?.textContent || '';
    expect(tableText).toContain('Pat Halcrow');
  });

  it('filters submissions by selectable group tabs with All selected by default', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [
        {
          submissionId: 'vendor-1',
          submissionTitle: 'New Vendor Application Submission',
          submittedAt: '2026-06-05T10:00:00-07:00',
          name: 'Vendor Person',
          email: 'vendor@example.com',
          phone: '555-1000',
          paymentStatus: 'none',
          paymentProvider: 'none',
          source: 'vendorApplication',
          status: 'New',
          assignedTo: '',
          notes: '',
          rawData: { formType: 'vendorApplicationForm' },
        },
        {
          submissionId: 'motor-1',
          submissionTitle: 'Motor Show Event Order',
          submittedAt: '2026-06-05T10:00:00-07:00',
          name: 'Motor Person',
          email: 'motor@example.com',
          phone: '555-2000',
          paymentStatus: 'paid',
          paymentProvider: 'stripe',
          source: 'motorShowOrder',
          status: 'New',
          assignedTo: '',
          notes: '',
          rawData: { formType: 'motorShowOrder' },
        },
        {
          submissionId: 'artist-1',
          submissionTitle: 'New Artist Sign-Up',
          submittedAt: '2026-06-05T10:00:00-07:00',
          name: 'Artist Person',
          email: 'artist@example.com',
          phone: '555-2500',
          paymentStatus: 'none',
          paymentProvider: 'none',
          source: 'artistSignUpForm',
          status: 'New',
          assignedTo: '',
          notes: '',
          rawData: { formType: 'artistSignUpForm' },
        },
        {
          submissionId: 'sponsor-1',
          submissionTitle: 'Sponsorship Submission',
          submittedAt: '2026-06-05T10:00:00-07:00',
          name: 'Sponsor Person',
          email: 'sponsor@example.com',
          phone: '555-2600',
          paymentStatus: 'none',
          paymentProvider: 'none',
          source: 'sponsorshipForm',
          status: 'New',
          assignedTo: '',
          notes: '',
          rawData: { formType: 'sponsorshipForm' },
        },
        {
          submissionId: 'parade-1',
          submissionTitle: 'New Parade Entry Request - Parade',
          submittedAt: '2026-06-05T10:00:00-07:00',
          name: 'Parade Person',
          email: 'parade@example.com',
          phone: '555-3000',
          paymentStatus: 'none',
          paymentProvider: 'none',
          source: 'paradeEntryForm',
          status: 'New',
          assignedTo: '',
          notes: '',
          rawData: { formType: 'paradeEntryForm' },
        },
        {
          submissionId: 'volunteer-1',
          submissionTitle: 'New Volunteer Request',
          submittedAt: '2026-06-05T10:00:00-07:00',
          name: 'Volunteer Person',
          email: 'volunteer@example.com',
          phone: '555-4000',
          paymentStatus: 'none',
          paymentProvider: 'none',
          source: 'volunteerForm',
          status: 'New',
          assignedTo: '',
          notes: '',
          rawData: { formType: 'volunteerForm' },
        },
        {
          submissionId: 'special-1',
          submissionTitle: 'Community Picnic Signup',
          submittedAt: '2026-06-05T10:00:00-07:00',
          name: 'Special Person',
          email: 'special@example.com',
          phone: '555-5000',
          paymentStatus: 'none',
          paymentProvider: 'none',
          source: 'communityPicnic',
          status: 'New',
          assignedTo: '',
          notes: '',
          rawData: { eventTitle: 'Community Picnic', pricing: { pricePerPlayer: 0 } },
        },
      ]
    }));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();

    let tableText = nativeElement.querySelector('.submissions-table')?.textContent || '';
    expect(component.selectedSubmissionGroup).toBe('all');
    expect(nativeElement.querySelectorAll('.submission-group-tab.active').length).toBe(1);
    expect(nativeElement.querySelector('[data-testid="submission-group-all"]')?.classList).toContain('active');
    expect(tableText).toContain('New Vendor Application Submission');
    expect(tableText).toContain('Motor Show Event Order');
    expect(tableText).toContain('New Artist Sign-Up');
    expect(tableText).toContain('Sponsorship Submission');
    expect(tableText).toContain('New Parade Entry Request - Parade');
    expect(tableText).toContain('New Volunteer Request');
    expect(tableText).toContain('Community Picnic Signup');

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="submission-group-vendor"]')!.click();
    fixture.detectChanges();

    tableText = nativeElement.querySelector('.submissions-table')?.textContent || '';
    expect(component.selectedSubmissionGroup).toBe('vendor');
    expect(nativeElement.querySelector('[data-testid="submission-group-vendor"]')?.classList).toContain('active');
    expect(tableText).toContain('New Vendor Application Submission');
    expect(tableText).not.toContain('Motor Show Event Order');
    expect(tableText).not.toContain('New Artist Sign-Up');
    expect(tableText).not.toContain('Sponsorship Submission');
    expect(tableText).not.toContain('Community Picnic Signup');

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="submission-group-all"]')!.click();
    fixture.detectChanges();

    tableText = nativeElement.querySelector('.submissions-table')?.textContent || '';
    expect(component.selectedSubmissionGroup).toBe('all');
    expect(nativeElement.querySelector('[data-testid="submission-group-all"]')?.classList).toContain('active');
    expect(tableText).toContain('Motor Show Event Order');
    expect(tableText).toContain('Community Picnic Signup');

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="submission-group-specialEvents"]')!.click();
    fixture.detectChanges();

    tableText = nativeElement.querySelector('.submissions-table')?.textContent || '';
    expect(component.selectedSubmissionGroup).toBe('specialEvents');
    expect(tableText).toContain('Community Picnic Signup');
    expect(tableText).not.toContain('New Vendor Application Submission');
    expect(tableText).not.toContain('New Artist Sign-Up');
    expect(tableText).not.toContain('Sponsorship Submission');
    expect(tableText).not.toContain('Motor Show Event Order');
    expect(tableText).not.toContain('New Parade Entry Request - Parade');
    expect(tableText).not.toContain('New Volunteer Request');
  });

  it('opens a submission detail panel and saves notes without status or assigned fields', () => {
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

    component.selectedSubmission!.notes = 'Verified';
    component.saveSelectedSubmission();

    expect(cmsService.updateSubmissionAdminFields).toHaveBeenCalledWith('s1', {
      notes: 'Verified',
    });

    const detailPanel = nativeElement.querySelector('.submission-detail-panel')!;
    const detailText = detailPanel.textContent || '';
    const detailsIndex = detailText.indexOf('Submission Details');
    const notesIndex = detailText.indexOf('Notes');

    expect(detailPanel.querySelector('.admin-select')).toBeFalsy();
    expect(detailText).not.toContain('Assigned To');
    expect(notesIndex).toBeGreaterThan(detailsIndex);
  });

  it('shows normalized motor show details for structured card purchases', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 's1',
        submissionTitle: 'Motor Show Event Order',
        submittedAt: '2026-06-05T10:00:00-07:00',
        name: 'Pat Halcrow',
        email: 'pat@example.com',
        phone: '555-1212',
        paymentStatus: 'paid',
        paymentProvider: 'stripe',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: {
          firstName: 'Pat',
          lastName: 'Halcrow',
          email: 'pat@example.com',
          phone: '555-1212',
          streetAddress: '123 Main St',
          city: 'Pittsburgh',
          state: 'PA',
          zipcode: '15201',
          year: '1969',
          make: 'Chevrolet',
          model: 'Camaro',
          color: 'Blue',
          clubAffiliation: 'Fourth Club',
          comboSize: 'Large',
          grandTotal: 89,
          total: 89,
          additionalPlaques: 2,
          additionalSmall: 1,
          additionalMedium: 0,
          additionalLarge: 0,
          additionalXLarge: 0,
          additionalXXLarge: 0,
          additionalXXXLarge: 0,
          stripe_session_id: 'cs_test_123',
        },
      }]
    }));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();
    nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-s1"]')!.click();
    fixture.detectChanges();

    const detailPanel = nativeElement.querySelector('.submission-detail-panel')!;
    const detailText = detailPanel.textContent || '';

    expect(detailPanel.querySelector('.submission-raw')).toBeFalsy();
    expect(detailText).toContain('Address');
    expect(detailText).toContain('123 Main St, Pittsburgh, PA 15201');
    expect(detailText).toContain('Vehicle');
    expect(detailText).toContain('1969 Chevrolet Camaro (Blue)');
    expect(detailText).toContain('Club Affiliation');
    expect(detailText).toContain('Fourth Club');
    expect(detailText).toContain('T-Shirt & Plaque Bundle');
    expect(detailText).toContain('Large');
    expect(detailText).toContain('Total');
    expect(detailText).toContain('$89.00');
    expect(detailText).toContain('Additional Plaque');
    expect(detailText).toContain('2');
    expect(detailText).not.toContain('Street Address');
    expect(detailText).not.toContain('Vehicle Year');
    expect(detailText).not.toContain('Make');
    expect(detailText).not.toContain('Model');
    expect(detailText).not.toContain('Color');
    expect(detailText).not.toContain('"firstName"');
    expect(detailText).not.toContain('cs_test_123');
  });

  it('does not render raw vendor email html in submission details', () => {
    const largeEmailHtml = '<div><b>Vendor Status: </b></div><p>New Vendor</p>'.repeat(500);
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 'vendor-1',
        submissionTitle: 'New Vendor Application Submission',
        submittedAt: '2026-06-15T13:43:00-07:00',
        name: 'Pat Vendor',
        email: 'vendor@example.com',
        phone: '555-1212',
        paymentStatus: 'paid',
        paymentProvider: 'stripe',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: {
          vendorStatus: 'New Vendor',
          vendorType: 'Non-Food Sales',
          companyName: 'Gearbox Websites',
          website: 'gearboxwebsites.com',
          description: 'Vendor description',
          body: largeEmailHtml,
          fileDropRef: 'C:\\fakepath\\download.jpeg',
          attachments: '5409e288-19ab-4d1d-a068-4cc019ddf1c8',
        },
      }]
    }));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();
    nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-vendor-1"]')!.click();
    fixture.detectChanges();

    const detailPanel = nativeElement.querySelector('.submission-detail-panel')!;
    const detailText = detailPanel.textContent || '';

    expect(detailText).toContain('Vendor Status');
    expect(detailText).toContain('New Vendor');
    expect(detailText).toContain('Company Name');
    expect(detailText).toContain('Gearbox Websites');
    expect(detailText).not.toContain('<div><b>Vendor Status');
    expect(detailText).not.toContain('C:\\fakepath');
    expect(detailText).not.toContain('5409e288');
  });

  it('shows readable form type values in submission details', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 'volunteer-1',
        submissionTitle: 'New Volunteer Request',
        submittedAt: '2026-06-15T17:30:00-07:00',
        name: 'Pat Volunteer',
        email: 'volunteer@example.com',
        phone: '555-1212',
        paymentStatus: 'none',
        paymentProvider: 'none',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: {
          formType: 'volunteerForm',
          organizationName: 'Spirit Testers',
          availability: 'Morning setup',
          message: 'Happy to help',
        },
      }]
    }));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();
    nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-volunteer-1"]')!.click();
    fixture.detectChanges();

    const detailText = nativeElement.querySelector('.submission-detail-panel')?.textContent || '';

    expect(detailText).toContain('Form Type');
    expect(detailText).toContain('Volunteer Request');
    expect(detailText).not.toContain('volunteerForm');
  });

  it('shows details from mailer-only motor show check payment submissions', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 'motor-check-1',
        submissionTitle: 'New Motor Show Entry — Check Payment',
        submittedAt: '2026-06-15T06:36:45-07:00',
        name: 'Bill Adams',
        email: 'thekoolguy@aol.com',
        phone: '619-219-9630',
        paymentStatus: 'none',
        paymentProvider: 'none',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: {
          subject: 'New Motor Show Entry — Check Payment',
          body: [
            'New Motor Show Entry — Pay by Check',
            '',
            'Name: Bill Adams',
            'Email: thekoolguy@aol.com',
            'Phone: 619-219-9630',
            'Address: 13502 Appaloosa Dr, Lakeside, CA 92040',
            '',
            'Vehicle: 1932 Ford Coupe (Orange)',
            'Club Affiliation: East County Cruisers',
            'T-Shirt & Plaque Bundle: No',
            'Total: $25.00',
            '',
            'Customer will mail check to: The Spirit of the Fourth, P.O. Box 270736, San Diego, CA 92198 by June 15.',
          ].join('\n'),
        },
      }]
    }));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();
    nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-motor-check-1"]')!.click();
    fixture.detectChanges();

    const detailPanel = nativeElement.querySelector('.submission-detail-panel')!;
    const detailText = detailPanel.textContent || '';

    expect(detailText).toContain('Address');
    expect(detailText).toContain('13502 Appaloosa Dr, Lakeside, CA 92040');
    expect(detailText).toContain('Vehicle');
    expect(detailText).toContain('1932 Ford Coupe (Orange)');
    expect(detailText).toContain('Club Affiliation');
    expect(detailText).toContain('East County Cruisers');
    expect(detailText).toContain('T-Shirt & Plaque Bundle');
    expect(detailText).toContain('No');
    expect(detailText).toContain('Total');
    expect(detailText).toContain('$25.00');
    expect(detailText).not.toContain('No additional submitted details.');
    expect(detailText).not.toContain('Customer will mail check');
  });

  it('marks unpaid check orders red and clears the detail panel after payment received is saved', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 'motor-check-1',
        submissionTitle: 'New Motor Show Entry — Check Payment',
        submittedAt: '2026-06-15T06:36:45-07:00',
        name: 'Bill Adams',
        email: 'thekoolguy@aol.com',
        phone: '619-219-9630',
        paymentStatus: 'none',
        paymentProvider: 'none',
        paymentReceived: false,
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: {
          subject: 'New Motor Show Entry — Check Payment',
          body: 'Total: $25.00',
        },
      }]
    }));
    cmsService.updateSubmissionAdminFields.and.returnValue(of({
      submissionId: 'motor-check-1',
      submissionTitle: 'New Motor Show Entry — Check Payment',
      status: 'New',
      assignedTo: '',
      notes: 'Check logged',
      paymentReceived: true,
    } as any));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();

    const row = nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-motor-check-1"]')!;
    expect(row.classList).toContain('check-payment-unreceived');

    row.click();
    fixture.detectChanges();

    const checkbox = nativeElement.querySelector<HTMLInputElement>('[data-testid="payment-received-checkbox"]')!;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBeFalse();

    checkbox.click();
    component.selectedSubmission!.notes = 'Check logged';
    component.saveSelectedSubmission();
    fixture.detectChanges();

    expect(cmsService.updateSubmissionAdminFields).toHaveBeenCalledWith('motor-check-1', {
      notes: 'Check logged',
      paymentReceived: true,
    });
    expect(component.submissions[0].paymentReceived).toBeTrue();
    expect(component.selectedSubmission).toBeUndefined();
    expect(nativeElement.querySelector('.submission-detail-panel')).toBeFalsy();
  });

  it('does not show payment received controls for card-paid submissions', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 'motor-card-1',
        submissionTitle: 'Motor Show Event Order',
        submittedAt: '2026-06-15T06:36:45-07:00',
        name: 'Pat Halcrow',
        email: 'pat@example.com',
        phone: '555-1212',
        paymentStatus: 'paid',
        paymentProvider: 'stripe',
        paymentReceived: false,
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: { stripe_session_id: 'cs_test_123' },
      }]
    }));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();

    const row = nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-motor-card-1"]')!;
    expect(row.classList).not.toContain('check-payment-unreceived');

    row.click();
    fixture.detectChanges();

    expect(nativeElement.querySelector('[data-testid="payment-received-checkbox"]')).toBeFalsy();
  });

  it('uses a modal confirmation before deleting a submission row', () => {
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
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();
    nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-s1"]')!.click();
    fixture.detectChanges();

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="delete-submission-button"]')!.click();
    fixture.detectChanges();

    expect(cmsService.deleteSubmission).not.toHaveBeenCalled();
    expect(component.submissions.length).toBe(1);
    expect(fixture.nativeElement.querySelector('.admin-modal')?.textContent).toContain('Delete submission');

    component.confirmModal();
    fixture.detectChanges();

    expect(cmsService.deleteSubmission).toHaveBeenCalledWith('s1');
    expect(component.submissions.length).toBe(0);
    expect(component.selectedSubmission).toBeUndefined();
  });
});
