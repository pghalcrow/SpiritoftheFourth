import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { of, Subject, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AdminComponent } from './admin.component';
import { CmsService } from 'src/app/services/cms.service';
import { environment } from 'src/environments/environment';

describe('AdminComponent', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let component: AdminComponent;
  let cmsService: jasmine.SpyObj<CmsService>;

  beforeEach(async () => {
    sessionStorage.clear();
    sessionStorage.setItem('adminRole', 'superAdmin');
    sessionStorage.setItem('adminEmail', 'super@example.com');
    cmsService = jasmine.createSpyObj<CmsService>('CmsService', [
      'getEvents',
      'updateEvents',
      'uploadImage',
      'resolveAssetUrl',
      'getSubmissions',
      'getSubmissionDetail',
      'updateSubmissionAdminFields',
      'deleteSubmission',
      'getTestMode',
      'updateTestMode',
      'getAdminUsers',
      'createAdminUser',
      'deleteAdminUser',
      'updateAdminUser',
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
    cmsService.getSubmissionDetail.and.returnValue(of({} as any));
    cmsService.updateSubmissionAdminFields.and.returnValue(of({} as any));
    cmsService.deleteSubmission.and.returnValue(of({ success: true, submissionId: 's1' }));
    cmsService.getTestMode.and.returnValue(of({ testMode: false }));
    cmsService.updateTestMode.and.returnValue(of({ testMode: true, updatedBy: 'developer' }));
    cmsService.getAdminUsers.and.returnValue(of({ items: [] }));
    cmsService.createAdminUser.and.returnValue(of({ email: 'viewer@example.com', role: 'viewer' }));
    cmsService.deleteAdminUser.and.returnValue(of({ success: true, email: 'viewer@example.com' }));
    cmsService.updateAdminUser.and.returnValue(of({ email: 'viewer@example.com', role: 'viewer', enabled: true }));

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
    sessionStorage.setItem('adminRole', 'superAdmin');
    fixture.detectChanges();
    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(component.adminSection).toBe('submissions');
    expect(cmsService.getSubmissions).toHaveBeenCalled();
    expect(nativeElement.querySelector('.admin-toolbar h1')?.textContent).toContain('Submissions');

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-events"]')!.click();
    fixture.detectChanges();

    expect(component.adminSection).toBe('events');
    expect(nativeElement.querySelector('.admin-toolbar h1')?.textContent).toContain('Upcoming Events');
  });

  it('hides the events section from admins and blocks direct events navigation', () => {
    sessionStorage.setItem('adminRole', 'admin');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.querySelector('[data-testid="admin-section-events"]')).toBeFalsy();

    component.selectAdminSection('events');
    fixture.detectChanges();

    expect(component.adminSection).toBe('submissions');
    expect(nativeElement.querySelector('.event-card')).toBeFalsy();
  });

  it('syncs a stale signed-in role from the backend user list on load', () => {
    fixture.destroy();
    sessionStorage.clear();
    sessionStorage.setItem('adminToken', 'local-admin-token:admin@example.com');
    sessionStorage.setItem('adminRole', 'admin');
    sessionStorage.setItem('adminEmail', 'admin@example.com');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'admin@example.com', role: 'superAdmin', enabled: true, status: 'CONFIRMED' },
      ]
    }));

    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(sessionStorage.getItem('adminRole')).toBe('superAdmin');
    expect(nativeElement.querySelector('[data-testid="admin-section-events"]')).toBeTruthy();
  });

  it('shows an events loading state instead of the empty state while events are loading', () => {
    const loadingResponse = new Subject<any>();
    cmsService.getEvents.and.returnValue(loadingResponse.asObservable());
    component.events = [];
    component.selectAdminSection('events');
    component.loadEvents();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(component.eventsLoading).toBeTrue();
    expect(nativeElement.querySelector('[data-testid="events-loading-state"]')?.textContent).toContain('Loading events...');
    expect(nativeElement.querySelector('.empty-events')).toBeFalsy();

    loadingResponse.next({ events: [] });
    loadingResponse.complete();
    fixture.detectChanges();

    expect(component.eventsLoading).toBeFalse();
    expect(nativeElement.querySelector('[data-testid="events-loading-state"]')).toBeFalsy();
    expect(nativeElement.querySelector('.empty-events')).toBeTruthy();
  });

  it('shows submissions events and users in the admin section selector for user managers', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const sectionButtons = Array.from(nativeElement.querySelectorAll<HTMLButtonElement>('.section-switcher .section-button'));

    expect(sectionButtons.map(button => button.textContent?.trim())).toEqual(['Submissions', 'Events', 'Users']);
  });

  it('hides the admin section selector when the current role only has one page view', () => {
    sessionStorage.setItem('adminRole', 'viewer');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(component.availableAdminSections).toEqual(['submissions']);
    expect(nativeElement.querySelector('.section-switcher')).toBeFalsy();
    expect(nativeElement.querySelector('[data-testid="admin-section-submissions"]')).toBeFalsy();
    expect(nativeElement.querySelector('.admin-toolbar h1')?.textContent).toContain('Submissions');
  });

  it('hides backend mutation actions for viewer role', () => {
    sessionStorage.setItem('adminRole', 'viewer');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(nativeElement.querySelector('[data-testid="admin-section-users"]')).toBeFalsy();
    expect(nativeElement.querySelector('.event-toolbar-actions .action-button')).toBeFalsy();
    expect(nativeElement.querySelector('[data-testid="delete-submission-button"]')).toBeFalsy();
  });

  it('does not show an artist submission group tab', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;
    const tabLabels = Array.from(nativeElement.querySelectorAll<HTMLButtonElement>('.submission-group-tab'))
      .map(button => button.textContent?.trim());

    expect(tabLabels).not.toContain('Artists');
    expect(nativeElement.querySelector('[data-testid="submission-group-artist"]')).toBeFalsy();
  });

  it('lets admins create only viewer accounts from user management', () => {
    sessionStorage.setItem('adminRole', 'admin');
    cmsService.getAdminUsers.and.returnValue(of({ items: [] }));
    cmsService.createAdminUser.and.returnValue(of({ email: 'viewer@example.com', role: 'viewer' }));
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-users"]')!.click();
    fixture.detectChanges();

    const roleOptions = Array.from(nativeElement.querySelectorAll<HTMLOptionElement>('[data-testid="new-user-role"] option'));
    expect(roleOptions.map(option => option.value)).toEqual(['viewer']);
    expect(roleOptions.map(option => option.textContent?.trim())).toEqual(['Viewer']);

    component.newUserEmail = 'viewer@example.com';
    component.newUserRole = 'viewer';
    component.createAdminUser();

    expect(cmsService.createAdminUser).toHaveBeenCalledWith('viewer@example.com', 'viewer');
  });

  it('validates the create user email before creating an account', () => {
    sessionStorage.setItem('adminRole', 'admin');
    cmsService.getAdminUsers.and.returnValue(of({ items: [] }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    component.newUserEmail = 'not-an-email';
    component.newUserRole = 'viewer';
    component.createAdminUser();
    fixture.detectChanges();

    expect(cmsService.createAdminUser).not.toHaveBeenCalled();
    expect(component.newUserEmailError).toBe('Enter a valid email address.');
    expect(fixture.nativeElement.querySelector('[data-testid="new-user-email-error"]')?.textContent).toContain('Enter a valid email address.');
  });

  it('prevents creating a user with an email that already exists', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'viewer@example.com', role: 'viewer', enabled: true, status: 'CONFIRMED' },
      ]
    }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    component.newUserEmail = 'VIEWER@example.com';
    component.newUserRole = 'viewer';
    component.createAdminUser();
    fixture.detectChanges();

    expect(cmsService.createAdminUser).not.toHaveBeenCalled();
    expect(component.newUserEmailError).toBe('An account using that email already exists.');
    expect(fixture.nativeElement.querySelector('[data-testid="new-user-email-error"]')?.textContent).toContain('An account using that email already exists.');
  });

  it('shows the backend error message when creating an admin user fails', () => {
    spyOn(console, 'error');
    sessionStorage.setItem('adminRole', 'superAdmin');
    cmsService.getAdminUsers.and.returnValue(of({ items: [] }));
    cmsService.createAdminUser.and.returnValue(throwError(() => ({
      error: { error: 'Password did not conform with password policy: Password must have symbol characters' }
    })));
    fixture.detectChanges();

    component.selectAdminSection('users');
    component.newUserEmail = 'newuser@example.com';
    component.newUserRole = 'viewer';
    component.createAdminUser();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.admin-modal')?.textContent).toContain('Password did not conform with password policy');
  });

  it('shows friendly role labels in the user role selector', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    cmsService.getAdminUsers.and.returnValue(of({ items: [] }));
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-users"]')!.click();
    fixture.detectChanges();

    const roleOptions = Array.from(nativeElement.querySelectorAll<HTMLOptionElement>('[data-testid="new-user-role"] option'));

    expect(roleOptions.map(option => option.value)).toEqual(['superAdmin', 'admin', 'viewer']);
    expect(roleOptions.map(option => option.textContent?.trim())).toEqual(['Super Admin', 'Admin', 'Viewer']);
  });

  it('opens a user roles help modal from the users panel', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    cmsService.getAdminUsers.and.returnValue(of({ items: [] }));
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-users"]')!.click();
    fixture.detectChanges();

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="user-role-help"]')!.click();
    fixture.detectChanges();

    const modal = nativeElement.querySelector('[data-testid="role-help-modal"]') as HTMLElement;
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('User Roles & Permissions');
    expect(modal.textContent).not.toContain('Has full access to developer controls');
    expect(modal.textContent).toContain('Super Admin');
    expect(modal.textContent).toContain('Admin');
    expect(modal.textContent).toContain('Viewer');
    expect(modal.textContent).toContain('Admins can create, remove, enable, and disable Viewer accounts only');
    expect(modal.textContent).toContain('cannot edit backend content, delete submissions, create users, remove users, change roles, or enable and disable accounts');
    expect(modal.textContent).toContain('Users cannot remove, disable, or change the role for their own account');
    expect(modal.textContent).not.toContain('Developers can create and remove all roles');
    expect(modal.textContent).not.toContain('The role selector shows friendly names');
  });

  it('shows the current signed in user and role on the users panel', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    sessionStorage.setItem('adminEmail', 'super@example.com');
    cmsService.getAdminUsers.and.returnValue(of({ items: [] }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const currentUserSummary = nativeElement.querySelector('[data-testid="current-admin-user"]');
    expect(currentUserSummary?.textContent).toContain('super@example.com');
    expect(currentUserSummary?.textContent).toContain('Super Admin');
  });

  it('shows friendly account statuses with explanatory help on the users panel', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'active@example.com', role: 'admin', enabled: true, status: 'CONFIRMED' },
        { email: 'setup@example.com', role: 'viewer', enabled: true, status: 'RESET_REQUIRED' },
        { email: 'change@example.com', role: 'viewer', enabled: true, status: 'FORCE_CHANGE_PASSWORD' },
        { email: 'pending@example.com', role: 'viewer', enabled: true, status: 'UNCONFIRMED' },
      ]
    }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const accountStatusHeader = nativeElement.querySelector('[data-testid="account-status-header"]');
    const accountStatusHelp = nativeElement.querySelector('[data-testid="account-status-help"]');
    const accountStatusTooltip = nativeElement.querySelector('[data-testid="account-status-tooltip"]');

    expect(accountStatusHeader?.textContent).toContain('Account Status');
    expect(accountStatusHelp?.getAttribute('aria-label')).toContain('Account status help');
    expect(accountStatusHelp?.getAttribute('aria-describedby')).toBe('account-status-tooltip');
    expect(accountStatusTooltip?.textContent).toContain('Active users can sign in');
    expect(accountStatusTooltip?.textContent).toContain('Password setup needed');
    expect(accountStatusTooltip?.textContent).toContain('Not confirmed');
    expect(nativeElement.textContent).toContain('Active');
    expect(nativeElement.textContent).toContain('Password setup needed');
    expect(nativeElement.textContent).toContain('Password change required');
    expect(nativeElement.textContent).toContain('Not confirmed');
  });

  it('sorts admin users by role and then email address', () => {
    sessionStorage.setItem('adminRole', 'developer');
    sessionStorage.setItem('adminEmail', 'developer@example.com');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'z-viewer@example.com', role: 'viewer', enabled: true, status: 'CONFIRMED' },
        { email: 'b-admin@example.com', role: 'admin', enabled: true, status: 'CONFIRMED' },
        { email: 'developer@example.com', role: 'developer', enabled: true, status: 'CONFIRMED' },
        { email: 'a-admin@example.com', role: 'admin', enabled: true, status: 'CONFIRMED' },
        { email: 'b-super@example.com', role: 'superAdmin', enabled: true, status: 'CONFIRMED' },
        { email: 'a-super@example.com', role: 'superAdmin', enabled: true, status: 'CONFIRMED' },
        { email: 'a-viewer@example.com', role: 'viewer', enabled: true, status: 'CONFIRMED' },
      ]
    }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    expect(component.adminUsers.map(user => user.email)).toEqual([
      'developer@example.com',
      'a-super@example.com',
      'b-super@example.com',
      'a-admin@example.com',
      'b-admin@example.com',
      'a-viewer@example.com',
      'z-viewer@example.com',
    ]);
  });

  it('does not allow a user manager to remove their own account', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    sessionStorage.setItem('adminEmail', 'super@example.com');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'super@example.com', role: 'superAdmin', enabled: true, status: 'CONFIRMED' },
        { email: 'admin@example.com', role: 'admin', enabled: true, status: 'CONFIRMED' },
      ]
    }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const removeButtons = Array.from(nativeElement.querySelectorAll<HTMLButtonElement>('[data-testid="remove-admin-user"]'));
    expect(removeButtons.length).toBe(1);
    expect(removeButtons[0].closest('tr')?.textContent).toContain('admin@example.com');

    component.deleteAdminUser({ email: 'super@example.com', role: 'superAdmin' });
    expect(cmsService.deleteAdminUser).not.toHaveBeenCalledWith('super@example.com');
  });

  it('shows remove actions only for users within the current role scope', () => {
    sessionStorage.setItem('adminRole', 'admin');
    sessionStorage.setItem('adminEmail', 'admin@example.com');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'admin@example.com', role: 'admin', enabled: true, status: 'CONFIRMED' },
        { email: 'super@example.com', role: 'superAdmin', enabled: true, status: 'CONFIRMED' },
        { email: 'viewer@example.com', role: 'viewer', enabled: true, status: 'CONFIRMED' },
      ]
    }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const removeButtons = Array.from(nativeElement.querySelectorAll<HTMLButtonElement>('[data-testid="remove-admin-user"]'));
    expect(removeButtons.length).toBe(1);
    expect(removeButtons[0].closest('tr')?.textContent).toContain('viewer@example.com');
  });

  it('uses a modal confirmation before deleting an admin user', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    sessionStorage.setItem('adminEmail', 'super@example.com');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'super@example.com', role: 'superAdmin', enabled: true, status: 'CONFIRMED' },
        { email: 'viewer@example.com', role: 'viewer', enabled: true, status: 'CONFIRMED' },
      ]
    }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    let nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="remove-admin-user"]')!.click();
    fixture.detectChanges();

    expect(cmsService.deleteAdminUser).not.toHaveBeenCalled();
    expect(component.adminUsers.length).toBe(2);
    expect(nativeElement.querySelector('.admin-modal')?.textContent).toContain('Remove user');
    expect(nativeElement.querySelector('.admin-modal')?.textContent).toContain('viewer@example.com');

    component.confirmModal();
    fixture.detectChanges();
    nativeElement = fixture.nativeElement as HTMLElement;

    expect(cmsService.deleteAdminUser).toHaveBeenCalledWith('viewer@example.com');
    expect(component.adminUsers.length).toBe(1);
    expect(component.adminUsers[0].email).toBe('super@example.com');
    expect(nativeElement.querySelector('.admin-modal')).toBeFalsy();
  });

  it('lets super admins change scoped user roles from the role column', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    sessionStorage.setItem('adminEmail', 'super@example.com');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'super@example.com', role: 'superAdmin', enabled: true, status: 'CONFIRMED' },
        { email: 'admin@example.com', role: 'admin', enabled: true, status: 'CONFIRMED' },
      ]
    }));
    cmsService.updateAdminUser.and.returnValue(of({ email: 'admin@example.com', role: 'viewer', enabled: true, status: 'CONFIRMED' }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const roleSelect = nativeElement.querySelector<HTMLSelectElement>('[data-testid="user-role-select-admin@example.com"]')!;
    const roleOptions = Array.from(roleSelect.options);

    expect(roleOptions.map(option => option.value)).toEqual(['superAdmin', 'admin', 'viewer']);
    expect(roleOptions.map(option => option.textContent?.trim())).toEqual(['Super Admin', 'Admin', 'Viewer']);
    expect(roleSelect.value).toBe('admin');

    roleSelect.value = 'viewer';
    roleSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(cmsService.updateAdminUser).toHaveBeenCalledWith('admin@example.com', { role: 'viewer' });
    expect(component.adminUsers.find(user => user.email === 'admin@example.com')?.role).toBe('viewer');
    expect(nativeElement.textContent).toContain('User role changed');
    expect(nativeElement.textContent).toContain('admin@example.com is now Viewer');
  });

  it('selects each user role from the current user data', () => {
    sessionStorage.setItem('adminRole', 'developer');
    sessionStorage.setItem('adminEmail', 'developer@example.com');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'superadmin@example.com', role: 'superAdmin', enabled: true, status: 'CONFIRMED' },
        { email: 'admin@example.com', role: 'admin', enabled: true, status: 'CONFIRMED' },
        { email: 'viewer@example.com', role: 'viewer', enabled: true, status: 'CONFIRMED' },
      ]
    }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.querySelector<HTMLSelectElement>('[data-testid="user-role-select-superadmin@example.com"]')?.value).toBe('superAdmin');
    expect(nativeElement.querySelector<HTMLSelectElement>('[data-testid="user-role-select-admin@example.com"]')?.value).toBe('admin');
    expect(nativeElement.querySelector<HTMLSelectElement>('[data-testid="user-role-select-viewer@example.com"]')?.value).toBe('viewer');
  });

  it('does not show role or enabled controls for self or users outside the current role scope', () => {
    sessionStorage.setItem('adminRole', 'admin');
    sessionStorage.setItem('adminEmail', 'admin@example.com');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'admin@example.com', role: 'admin', enabled: true, status: 'CONFIRMED' },
        { email: 'super@example.com', role: 'superAdmin', enabled: true, status: 'CONFIRMED' },
        { email: 'viewer@example.com', role: 'viewer', enabled: true, status: 'CONFIRMED' },
      ]
    }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.querySelector('[data-testid="user-role-select-admin@example.com"]')).toBeFalsy();
    expect(nativeElement.querySelector('[data-testid="user-enabled-toggle-admin@example.com"]')).toBeFalsy();
    expect(nativeElement.querySelector('[data-testid="user-enabled-readonly-admin@example.com"]')).toBeTruthy();
    expect(nativeElement.querySelector('[data-testid="user-enabled-readonly-admin@example.com"]')?.classList).toContain('enabled-status-control');
    expect(nativeElement.querySelector('[data-testid="user-enabled-readonly-admin@example.com"]')?.classList).toContain('enabled-status-control-readonly');
    expect(nativeElement.querySelector('[data-testid="user-enabled-readonly-spacer-admin@example.com"]')).toBeFalsy();
    expect(nativeElement.querySelector('[data-testid="user-role-select-super@example.com"]')).toBeFalsy();
    expect(nativeElement.querySelector('[data-testid="user-enabled-toggle-super@example.com"]')).toBeFalsy();
    expect(nativeElement.querySelector('[data-testid="user-role-select-viewer@example.com"]')).toBeFalsy();
    expect(nativeElement.querySelector('[data-testid="user-enabled-toggle-viewer@example.com"]')).toBeTruthy();
  });

  it('automatically saves enabled changes for scoped users', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    sessionStorage.setItem('adminEmail', 'super@example.com');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'viewer@example.com', role: 'viewer', enabled: true, status: 'CONFIRMED' },
      ]
    }));
    cmsService.updateAdminUser.and.returnValue(of({ email: 'viewer@example.com', role: 'viewer', enabled: false, status: 'CONFIRMED' }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const enabledToggle = nativeElement.querySelector<HTMLInputElement>('[data-testid="user-enabled-toggle-viewer@example.com"]')!;
    enabledToggle.checked = false;
    enabledToggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(cmsService.updateAdminUser).toHaveBeenCalledWith('viewer@example.com', { enabled: false });
    expect(component.adminUsers[0].enabled).toBeFalse();
  });

  it('shows enabled as a checkbox with status text below it', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    sessionStorage.setItem('adminEmail', 'super@example.com');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'viewer@example.com', role: 'viewer', enabled: false, status: 'CONFIRMED' },
      ]
    }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const enabledControl = nativeElement.querySelector<HTMLElement>('[data-testid="user-enabled-control-viewer@example.com"]')!;
    const enabledToggle = nativeElement.querySelector<HTMLInputElement>('[data-testid="user-enabled-toggle-viewer@example.com"]')!;
    const enabledStatus = nativeElement.querySelector<HTMLElement>('[data-testid="user-enabled-status-viewer@example.com"]')!;

    expect(enabledControl).toBeTruthy();
    expect(enabledControl.classList).toContain('enabled-status-control');
    expect(enabledToggle.checked).toBeFalse();
    expect(enabledStatus.textContent?.trim()).toBe('Disabled');
    expect(enabledStatus.classList).toContain('enabled-status-text');
  });

  it('hides developer accounts from non-developer user managers', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    sessionStorage.setItem('adminEmail', 'super@example.com');
    cmsService.getAdminUsers.and.returnValue(of({
      items: [
        { email: 'developer@example.com', role: 'developer', enabled: true, status: 'CONFIRMED' },
        { email: 'admin@example.com', role: 'admin', enabled: true, status: 'CONFIRMED' },
      ]
    }));
    fixture.detectChanges();

    component.selectAdminSection('users');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.textContent).not.toContain('developer@example.com');
    expect(nativeElement.textContent).not.toContain('Developer');
    expect(nativeElement.textContent).toContain('admin@example.com');
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

  it('clears the admin session and redirects when the test mode token is expired', () => {
    spyOn(console, 'error');
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    sessionStorage.setItem('adminToken', 'expired-token');
    sessionStorage.setItem('adminRole', 'developer');
    sessionStorage.setItem('adminEmail', 'pghalcrow@gmail.com');
    cmsService.getTestMode.and.returnValue(throwError(() => ({ status: 401 })));

    component.ngOnInit();
    fixture.detectChanges();

    expect(sessionStorage.getItem('adminToken')).toBeNull();
    expect(sessionStorage.getItem('adminRole')).toBeNull();
    expect(sessionStorage.getItem('adminEmail')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/sign-in']);
    expect(fixture.nativeElement.querySelector('.admin-modal')?.textContent).not.toContain('Test mode unavailable');
  });

  it('clears the admin session and redirects when the submissions token is expired', () => {
    spyOn(console, 'error');
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    sessionStorage.setItem('adminToken', 'expired-token');
    sessionStorage.setItem('adminRole', 'developer');
    sessionStorage.setItem('adminEmail', 'pghalcrow@gmail.com');
    cmsService.getSubmissions.and.returnValue(throwError(() => ({ status: 401 })));

    component.loadSubmissions();
    fixture.detectChanges();

    expect(sessionStorage.getItem('adminToken')).toBeNull();
    expect(sessionStorage.getItem('adminRole')).toBeNull();
    expect(sessionStorage.getItem('adminEmail')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/sign-in']);
    expect(fixture.nativeElement.querySelector('.admin-modal')?.textContent).not.toContain('Submissions unavailable');
  });

  it('allows developer test mode controls on localhost', () => {
    const originalProduction = environment.production;
    environment.production = false;
    sessionStorage.setItem('adminRole', 'developer');
    cmsService.getTestMode.and.returnValue(of({ testMode: true, localOnly: true }));
    cmsService.updateTestMode.and.returnValue(of({ testMode: false, localOnly: true }));
    try {
      component.ngOnInit();
      fixture.detectChanges();

      const panel = fixture.nativeElement.querySelector('[data-testid="developer-test-mode"]') as HTMLElement;
      const toggle = fixture.nativeElement.querySelector('[data-testid="toggle-test-mode"]') as HTMLInputElement;

      expect(panel.textContent).toContain('Test Mode');
      expect(toggle.disabled).toBeFalse();

      toggle.click();
      fixture.detectChanges();

      expect(cmsService.getTestMode).toHaveBeenCalled();
      expect(cmsService.updateTestMode).toHaveBeenCalledWith(false);
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

  it('loads submissions in 50 row pages and moves to the next cursor page', () => {
    cmsService.getSubmissions.calls.reset();
    cmsService.getSubmissions.and.returnValues(
      of({
        items: [{
          submissionId: 's1',
          submissionTitle: 'First Page',
          submittedAt: '2026-06-05T10:00:00-07:00',
          name: 'First Person',
          email: 'first@example.com',
          phone: '555-1111',
          status: 'New',
          assignedTo: '',
          notes: '',
          rawData: { formType: 'volunteerForm' },
        }],
        nextCursor: 'cursor-2',
        totalCount: 75,
        totalPages: 2,
      }),
      of({
        items: [{
          submissionId: 's2',
          submissionTitle: 'Second Page',
          submittedAt: '2026-06-06T10:00:00-07:00',
          name: 'Second Person',
          email: 'second@example.com',
          phone: '555-2222',
          status: 'New',
          assignedTo: '',
          notes: '',
          rawData: { formType: 'paradeEntryForm' },
        }],
        totalCount: 75,
        totalPages: 2,
      })
    );

    component.loadSubmissions();
    fixture.detectChanges();

    expect(cmsService.getSubmissions.calls.first().args[0]).toEqual({ limit: 50 });
    expect(component.submissionPageNumber).toBe(1);
    expect(component.submissionTotalPages).toBe(2);
    expect(component.hasNextSubmissionPage).toBeTrue();
    expect(component.hasPreviousSubmissionPage).toBeFalse();
    let nativeElement = fixture.nativeElement as HTMLElement;
    expect(Array.from(nativeElement.querySelectorAll('[data-testid="submission-pagination"]')).length).toBe(2);
    expect(nativeElement.textContent).toContain('Page 1 of 2');

    component.loadNextSubmissionPage();
    fixture.detectChanges();

    expect(cmsService.getSubmissions.calls.mostRecent().args[0]).toEqual({ limit: 50, cursor: 'cursor-2' });
    expect(component.submissionPageNumber).toBe(2);
    expect(component.submissions[0].submissionId).toBe('s2');
    expect(component.hasPreviousSubmissionPage).toBeTrue();
    nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.textContent).toContain('Page 2 of 2');
  });

  it('loads full submission details when a summary row is selected', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 's1',
        submissionTitle: 'Volunteer Request',
        submittedAt: '2026-06-05T10:00:00-07:00',
        name: 'Pat Halcrow',
        email: 'pat@example.com',
        phone: '555-1212',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: { formType: 'volunteerForm' },
      }]
    }));
    cmsService.getSubmissionDetail.and.returnValue(of({
      submissionId: 's1',
      submissionTitle: 'Volunteer Request',
      submittedAt: '2026-06-05T10:00:00-07:00',
      name: 'Pat Halcrow',
      email: 'pat@example.com',
      phone: '555-1212',
      status: 'New',
      assignedTo: '',
      notes: '',
      rawData: { formType: 'volunteerForm', message: 'Available morning' },
    }));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="submission-details-s1"]')!.click();
    fixture.detectChanges();

    expect(cmsService.getSubmissionDetail).toHaveBeenCalledWith('s1');
    expect(component.selectedSubmissionDetailRows.map(row => row.value)).toContain('Available morning');
  });

  it('defaults the submission export date range from July 5 of the previous year through today', () => {
    const today = new Date();
    const pad = (part: number) => String(part).padStart(2, '0');
    const expectedToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    expect(component.submissionExportFromDate).toBe(`${today.getFullYear() - 1}-07-05`);
    expect(component.submissionExportToDate).toBe(expectedToday);
    expect(component.submissionExportGroup).toBe('all');
  });

  it('renders submission export date and category controls', () => {
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const fromInput = nativeElement.querySelector<HTMLInputElement>('[data-testid="submission-export-from"]')!;
    const toInput = nativeElement.querySelector<HTMLInputElement>('[data-testid="submission-export-to"]')!;
    const groupSelect = nativeElement.querySelector<HTMLSelectElement>('[data-testid="submission-export-group"]')!;
    const exportButton = nativeElement.querySelector<HTMLButtonElement>('[data-testid="submission-export-button"]')!;

    expect(fromInput.value).toBe(component.submissionExportFromDate);
    expect(toInput.value).toBe(component.submissionExportToDate);
    expect(Array.from(groupSelect.options).map(option => option.textContent?.trim())).toContain('All categories');
    expect(exportButton.textContent).toContain('Export Excel');
  });

  it('orders submission controls with export first and search immediately before the table', () => {
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const workspace = nativeElement.querySelector('.submissions-workspace')!;
    const exportPanel = nativeElement.querySelector('.submission-export-panel')!;
    const groupTabs = nativeElement.querySelector('.submission-group-tabs')!;
    const searchTools = nativeElement.querySelector('.submissions-tools')!;
    const tableWrap = nativeElement.querySelector('.submissions-table-wrap')!;
    const children = Array.from(workspace.children);

    expect(children.indexOf(exportPanel)).toBeLessThan(children.indexOf(groupTabs));
    expect(children.indexOf(groupTabs)).toBeLessThan(children.indexOf(searchTools));
    expect(children.indexOf(searchTools)).toBeLessThan(children.indexOf(tableWrap));
    expect(exportPanel.querySelector('[data-testid="submission-export-button"]')?.classList)
      .toContain('submission-export-button');
  });

  it('exports one workbook with a worksheet for each submission category', () => {
    const writeWorkbook = spyOn<any>(component, 'writeSubmissionWorkbook').and.stub();
    component.submissionExportFromDate = '2025-07-05';
    component.submissionExportToDate = '2026-06-21';
    component.submissionExportGroup = 'all';
    component.submissions = [
      {
        submissionId: 'vendor-1',
        submissionTitle: 'Vendor Application',
        submittedAt: '2026-06-05T10:00:00-07:00',
        name: 'Vendor B',
        email: 'vendor@example.com',
        phone: '555-1000',
        paymentStatus: 'none',
        paymentProvider: 'none',
        status: 'New',
        assignedTo: '',
        notes: '',
        source: 'vendorApplication',
        rawData: {
          formType: 'vendorApplicationForm',
          companyName: 'Booth Co',
          vendorType: 'Food',
          agreeCheckbox: true,
          signatureName: 'Vendor B',
        },
      },
      {
        submissionId: 'parade-1',
        submissionTitle: 'Parade Entry',
        submittedAt: '2026-06-06T10:00:00-07:00',
        name: 'Parade Float',
        email: 'parade@example.com',
        phone: '555-2000',
        paymentStatus: 'none',
        paymentProvider: 'none',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: { formType: 'paradeEntryForm', entryName: 'Veterans Float', contactName: 'Myrna' },
      },
      {
        submissionId: 'old-volunteer',
        submissionTitle: 'Volunteer Request',
        submittedAt: '2025-07-04T10:00:00-07:00',
        name: 'Too Old',
        email: 'old@example.com',
        phone: '555-3000',
        paymentStatus: 'none',
        paymentProvider: 'none',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: { formType: 'volunteerForm', availability: 'Morning' },
      },
    ];

    component.exportSubmissionsToExcel();

    expect(writeWorkbook).toHaveBeenCalled();
    const sheets = writeWorkbook.calls.mostRecent().args[0] as { sheet: string; data: any[][] }[];
    expect(sheets.map(sheet => sheet.sheet)).toEqual(['Vendors', 'Artists', 'Sponsors', 'Motor Show', 'Parade', 'Volunteers', 'Special Events']);
    const vendorRows = sheets.find(sheet => sheet.sheet === 'Vendors')!.data;
    const paradeRows = sheets.find(sheet => sheet.sheet === 'Parade')!.data;
    const volunteerRows = sheets.find(sheet => sheet.sheet === 'Volunteers')!.data;

    expect(vendorRows[0]).toContain('Company Name');
    expect(vendorRows[1]).toContain('Booth Co');
    expect(vendorRows[0]).not.toContain('Agree Checkbox');
    expect(vendorRows[0]).not.toContain('Signature Name');
    expect(paradeRows[0]).toContain('Entry Name');
    expect(paradeRows[1]).toContain('Veterans Float');
    expect(volunteerRows.length).toBe(1);

    sheets.forEach(sheet => {
      expect(sheet.data[0]).not.toContain('Submitted At');
      expect(sheet.data[0]).not.toContain('Source');
      expect(sheet.data[0]).not.toContain('Updated At');
      expect(sheet.data[0]).not.toContain('Raw Data');
    });
  });

  it('exports a single worksheet when a submission category is selected', () => {
    const writeWorkbook = spyOn<any>(component, 'writeSubmissionWorkbook').and.stub();
    component.submissionExportFromDate = '2025-07-05';
    component.submissionExportToDate = '2026-06-21';
    component.submissionExportGroup = 'parade';
    component.submissions = [{
      submissionId: 'parade-1',
      submissionTitle: 'Parade Entry',
      submittedAt: '2026-06-06T10:00:00-07:00',
      name: 'Parade Float',
      email: 'parade@example.com',
      phone: '555-2000',
      paymentStatus: 'none',
      paymentProvider: 'none',
      status: 'New',
      assignedTo: '',
      notes: '',
      rawData: { formType: 'paradeEntryForm', entryName: 'Veterans Float', contactName: 'Myrna' },
    }];

    component.exportSubmissionsToExcel();

    const sheets = writeWorkbook.calls.mostRecent().args[0] as { sheet: string; data: any[][] }[];
    expect(sheets.map(sheet => sheet.sheet)).toEqual(['Parade']);
    const paradeRows = sheets[0].data;
    expect(paradeRows[0]).toContain('Entry Name');
    expect(paradeRows[1]).toContain('Veterans Float');
  });

  it('exports numeric submission fields as numbers while preserving contact fields as text', () => {
    const writeWorkbook = spyOn<any>(component, 'writeSubmissionWorkbook').and.stub();
    component.submissionExportFromDate = '2025-07-05';
    component.submissionExportToDate = '2026-06-21';
    component.submissionExportGroup = 'motorShow';
    component.submissions = [{
      submissionId: 'motor-1',
      submissionTitle: 'Motor Show Event',
      submittedAt: '2026-06-06T10:00:00-07:00',
      name: 'Pat Halcrow',
      email: 'pat@example.com',
      phone: '555-1212',
      amount: '125',
      paymentStatus: 'paid',
      paymentProvider: 'stripe',
      status: 'New',
      assignedTo: '',
      notes: '',
      rawData: {
        formType: 'motorShowOrder',
        phone: '555-1212',
        zipcode: '01234',
        year: '1969',
        grandTotal: '89.50',
        additionalPlaques: '2',
        additionalSmall: 1,
      },
    } as any];

    component.exportSubmissionsToExcel();

    const sheets = writeWorkbook.calls.mostRecent().args[0] as { sheet: string; data: any[][] }[];
    const motorShowRows = sheets[0].data;
    const header = motorShowRows[0];
    const row = motorShowRows[1];

    expect(row[header.indexOf('Amount')]).toBe(125);
    expect(row[header.indexOf('Grand Total')]).toBe(89.5);
    expect(row[header.indexOf('Additional Plaques')]).toBe(2);
    expect(row[header.indexOf('Additional Small')]).toBe(1);
    expect(row[header.indexOf('Phone')]).toBe('555-1212');
    expect(row[header.indexOf('Zip Code')]).toBe(1234);
    expect(row[header.indexOf('Vehicle Year')]).toBe(1969);
  });

  it('omits payment and internal admin fields from submission exports', () => {
    const writeWorkbook = spyOn<any>(component, 'writeSubmissionWorkbook').and.stub();
    component.submissionExportFromDate = '2025-07-05';
    component.submissionExportToDate = '2026-06-21';
    component.submissionExportGroup = 'all';
    component.submissions = [{
      submissionId: 'vendor-1',
      submissionTitle: 'Vendor Application',
      submittedAt: '2026-06-05T10:00:00-07:00',
      name: 'Vendor B',
      email: 'vendor@example.com',
      phone: '555-1000',
      paymentStatus: 'paid',
      paymentProvider: 'stripe',
      paymentReceived: true,
      amount: 125,
      currency: 'USD',
      status: 'In Review',
      assignedTo: 'Patrick',
      notes: 'Internal note',
      rawData: {
        formType: 'vendorApplicationForm',
        companyName: 'Booth Co',
        paymentMethod: 'card',
        nested: { paymentMethod: 'check' },
      },
    } as any];

    component.exportSubmissionsToExcel();

    const sheets = writeWorkbook.calls.mostRecent().args[0] as { sheet: string; data: any[][] }[];
    const omittedHeaders = [
      'Payment Status',
      'Payment Method',
      'Payment Provider',
      'Payment Received',
      'Currency',
      'Admin Status',
      'Assigned To',
      'Notes',
      'Submission ID',
      'Updated By',
    ];

    sheets.forEach(sheet => {
      omittedHeaders.forEach(header => expect(sheet.data[0]).not.toContain(header));
    });

    sheets.forEach(sheet => expect(sheet.data[0]).not.toContain('Raw Data'));
  });

  it('shows a submissions loading state without spinning refresh while submissions initially load', () => {
    const loadingResponse = new Subject<any>();
    cmsService.getSubmissions.and.returnValue(loadingResponse.asObservable());

    component.loadSubmissions('initial');
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const loadingState = nativeElement.querySelector('[data-testid="submissions-loading-state"]');
    const refreshButton = nativeElement.querySelector<HTMLButtonElement>('[data-testid="refresh-submissions-button"]')!;

    expect(component.submissionsLoading).toBeTrue();
    expect(component.submissionsRefreshing).toBeFalse();
    expect(loadingState?.textContent).toContain('Loading submissions...');
    expect(nativeElement.querySelector('.submissions-table')).toBeFalsy();
    expect(refreshButton.disabled).toBeTrue();
    expect(refreshButton.querySelector('.button-spinner')).toBeFalsy();
    expect(refreshButton.textContent).toContain('Refresh');

    loadingResponse.next({ items: [] });
    loadingResponse.complete();
    fixture.detectChanges();

    expect(component.submissionsLoading).toBeFalse();
    expect(nativeElement.querySelector('[data-testid="submissions-loading-state"]')).toBeFalsy();
    expect(nativeElement.querySelector('.submissions-table')).toBeTruthy();
    expect(refreshButton.disabled).toBeFalse();
    expect(refreshButton.textContent).toContain('Refresh');
  });

  it('keeps current submission rows visible and spins only refresh during manual refresh', () => {
    component.submissions = [{
      submissionId: 'existing-1',
      submissionTitle: 'Existing Submission',
      submittedAt: '2026-06-05T10:00:00-07:00',
      name: 'Existing Person',
      email: 'existing@example.com',
      phone: '555-1212',
      paymentStatus: 'none',
      paymentProvider: 'none',
      status: 'New',
      assignedTo: '',
      notes: '',
      rawData: {},
    }];
    const loadingResponse = new Subject<any>();
    cmsService.getSubmissions.and.returnValue(loadingResponse.asObservable());

    component.refreshSubmissions();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const refreshButton = nativeElement.querySelector<HTMLButtonElement>('[data-testid="refresh-submissions-button"]')!;

    expect(component.submissionsLoading).toBeFalse();
    expect(component.submissionsRefreshing).toBeTrue();
    expect(nativeElement.querySelector('[data-testid="submissions-loading-state"]')).toBeFalsy();
    expect(nativeElement.querySelector('.submissions-table')?.textContent).toContain('Existing Submission');
    expect(refreshButton.disabled).toBeTrue();
    expect(refreshButton.querySelector('.button-spinner')).toBeTruthy();
    expect(refreshButton.textContent).toContain('Refreshing...');

    loadingResponse.next({
      items: [{
        submissionId: 'new-1',
        submissionTitle: 'New Submission',
        submittedAt: '2026-06-05T11:00:00-07:00',
        name: 'New Person',
        email: 'new@example.com',
        phone: '555-3434',
        paymentStatus: 'none',
        paymentProvider: 'none',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: {},
      }]
    });
    loadingResponse.complete();
    fixture.detectChanges();

    expect(component.submissionsRefreshing).toBeFalse();
    expect(nativeElement.querySelector('.submissions-table')?.textContent).not.toContain('Existing Submission');
    expect(nativeElement.querySelector('.submissions-table')?.textContent).toContain('New Submission');
    expect(refreshButton.disabled).toBeFalse();
    expect(refreshButton.textContent).toContain('Refresh');
  });

  it('renders the simplified submissions table with Google Sheet style dates and details buttons', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 's1',
        submissionTitle: 'Motor Show Event',
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
    const detailPanel = nativeElement.querySelector('.submission-detail-panel')!;
    expect(detailPanel.textContent).toContain('Motor Show Event');
    expect(detailPanel.querySelector('.event-index')).toBeFalsy();
    expect(detailPanel.querySelector('.submission-close-button')?.textContent?.trim()).toBe('Close');
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
    expect(tableText).toContain('Motor Show Event');
    expect(tableText).not.toContain('motorShowOrder Order');

    nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-motor-import-1"]')!.click();
    fixture.detectChanges();

    const detailText = nativeElement.querySelector('.submission-detail-panel')?.textContent || '';
    expect(detailText).toContain('Motor Show Event');
    expect(detailText).not.toContain('motorShowOrder Order');

    component.clearSelectedSubmission();
    component.submissionSearch = 'Motor Show Event';
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
          submissionTitle: 'Motor Show Event',
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
    expect(tableText).toContain('Motor Show Event');
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
    expect(tableText).not.toContain('Motor Show Event');
    expect(tableText).not.toContain('New Artist Sign-Up');
    expect(tableText).not.toContain('Sponsorship Submission');
    expect(tableText).not.toContain('Community Picnic Signup');

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="submission-group-all"]')!.click();
    fixture.detectChanges();

    tableText = nativeElement.querySelector('.submissions-table')?.textContent || '';
    expect(component.selectedSubmissionGroup).toBe('all');
    expect(nativeElement.querySelector('[data-testid="submission-group-all"]')?.classList).toContain('active');
    expect(tableText).toContain('Motor Show Event');
    expect(tableText).toContain('Community Picnic Signup');

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="submission-group-specialEvents"]')!.click();
    fixture.detectChanges();

    tableText = nativeElement.querySelector('.submissions-table')?.textContent || '';
    expect(component.selectedSubmissionGroup).toBe('specialEvents');
    expect(tableText).toContain('Community Picnic Signup');
    expect(tableText).not.toContain('New Vendor Application Submission');
    expect(tableText).not.toContain('New Artist Sign-Up');
    expect(tableText).not.toContain('Sponsorship Submission');
    expect(tableText).not.toContain('Motor Show Event');
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

  it('shows saving feedback while a submission update is in progress', () => {
    const saveResponse = new Subject<any>();
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
    cmsService.updateSubmissionAdminFields.and.returnValue(saveResponse.asObservable());

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();
    nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-s1"]')!.click();
    fixture.detectChanges();

    component.selectedSubmission!.notes = 'Verified';
    component.saveSelectedSubmission();
    fixture.detectChanges();

    const saveButton = nativeElement.querySelector<HTMLButtonElement>('[data-testid="save-submission-button"]')!;
    expect(saveButton.disabled).toBeTrue();
    expect(saveButton.textContent).toContain('Saving');
    expect(saveButton.querySelector('.button-spinner')).toBeTruthy();

    saveResponse.next({
      submissionId: 's1',
      submissionTitle: 'Volunteer Request',
      status: 'New',
      assignedTo: '',
      notes: 'Verified',
    });
    saveResponse.complete();
    fixture.detectChanges();

    expect(component.selectedSubmission).toBeUndefined();
    expect(component.submissionActionLoading).toBeNull();
  });

  it('closes the submission detail panel when clicking outside it', () => {
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

    expect(component.selectedSubmission?.submissionId).toBe('s1');

    nativeElement.querySelector<HTMLElement>('[data-testid="submission-detail-backdrop"]')!.click();
    fixture.detectChanges();

    expect(component.selectedSubmission).toBeUndefined();
    expect(nativeElement.querySelector('.submission-detail-panel')).toBeFalsy();
  });

  it('shows normalized motor show details for structured card purchases', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 's1',
        submissionTitle: 'Motor Show Event',
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

  it('shows Freedom Club donation amounts as currency in submission details', () => {
    cmsService.getSubmissions.and.returnValue(of({
      items: [{
        submissionId: 'donation-1',
        submissionTitle: 'Freedom Club Donation',
        submittedAt: '2026-06-16T12:00:00-07:00',
        name: 'Pat Donor',
        email: 'donor@example.com',
        phone: '555-1212',
        paymentStatus: 'paid',
        paymentProvider: 'stripe',
        status: 'New',
        assignedTo: '',
        notes: '',
        rawData: {
          formType: 'freedomClubDonation',
          donationAmount: 150,
          grandTotal: 150,
        },
      }]
    }));

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();
    nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-donation-1"]')!.click();
    fixture.detectChanges();

    const detailText = nativeElement.querySelector('.submission-detail-panel')?.textContent || '';

    expect(detailText).toContain('Donation Amount');
    expect(detailText).toContain('$150');
    expect(detailText).not.toContain('Donation Amount150');
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
        submissionTitle: 'Motor Show Event',
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
    sessionStorage.setItem('adminRole', 'superAdmin');
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

  it('shows deleting feedback while a confirmed submission delete is in progress', () => {
    sessionStorage.setItem('adminRole', 'superAdmin');
    const deleteResponse = new Subject<any>();
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
    cmsService.deleteSubmission.and.returnValue(deleteResponse.asObservable());

    const nativeElement = fixture.nativeElement as HTMLElement;
    nativeElement.querySelector<HTMLButtonElement>('[data-testid="admin-section-submissions"]')!.click();
    fixture.detectChanges();
    nativeElement.querySelector<HTMLTableRowElement>('[data-testid="submission-row-s1"]')!.click();
    fixture.detectChanges();

    nativeElement.querySelector<HTMLButtonElement>('[data-testid="delete-submission-button"]')!.click();
    fixture.detectChanges();
    component.confirmModal();
    fixture.detectChanges();

    const deleteButton = nativeElement.querySelector<HTMLButtonElement>('[data-testid="delete-submission-button"]')!;
    expect(deleteButton.disabled).toBeTrue();
    expect(deleteButton.textContent).toContain('Deleting');
    expect(deleteButton.querySelector('.button-spinner')).toBeTruthy();

    deleteResponse.next({ success: true, submissionId: 's1' });
    deleteResponse.complete();
    fixture.detectChanges();

    expect(component.submissionActionLoading).toBeNull();
    expect(component.selectedSubmission).toBeUndefined();
  });
});
