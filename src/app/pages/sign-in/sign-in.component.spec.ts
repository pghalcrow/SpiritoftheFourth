import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { SignInComponent } from './sign-in.component';
import { CmsService } from 'src/app/services/cms.service';

describe('SignInComponent', () => {
  let fixture: ComponentFixture<SignInComponent>;
  let router: jasmine.SpyObj<Router>;
  let cmsService: jasmine.SpyObj<CmsService>;

  beforeEach(async () => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    cmsService = jasmine.createSpyObj<CmsService>('CmsService', ['login', 'requestPasswordReset']);
    cmsService.login.and.returnValue(of({ success: true, token: 'cms-admin-token', role: 'admin', email: 'admin@example.com' }));
    cmsService.requestPasswordReset.and.returnValue(of({ success: true }));

    await TestBed.configureTestingModule({
      declarations: [SignInComponent],
      imports: [FormsModule],
      providers: [
        { provide: CmsService, useValue: cmsService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SignInComponent);
    fixture.detectChanges();
  });

  it('renders a modern password login form without changing the admin editor', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(nativeElement.querySelector('.admin-login-shell')).toBeTruthy();
    expect(nativeElement.querySelector('.admin-login-card')).toBeTruthy();
    expect(nativeElement.querySelector('input[name="adminEmail"]')).toBeTruthy();
    expect(nativeElement.querySelector('.password-field')).toBeTruthy();
    expect(nativeElement.querySelector('.login-button')).toBeTruthy();
  });

  it('stores the returned admin role after login', () => {
    cmsService.login.and.returnValue(of({ success: true, token: 'cms-developer-token', role: 'developer', email: 'dev@example.com' }));
    const component = fixture.componentInstance;

    component.email = 'dev@example.com';
    component.password = 'C0ffeeCup0215';
    component.login();

    expect(cmsService.login).toHaveBeenCalledWith('dev@example.com', 'C0ffeeCup0215');
    expect(sessionStorage.getItem('adminToken')).toBe('cms-developer-token');
    expect(sessionStorage.getItem('adminRole')).toBe('developer');
    expect(sessionStorage.getItem('adminEmail')).toBe('dev@example.com');
    expect(router.navigate).toHaveBeenCalledWith(['/admin']);
  });

  it('temporarily reveals the password while the eye control is pressed', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;
    const passwordInput = nativeElement.querySelector<HTMLInputElement>('input[name="adminPassword"]')!;
    const revealButton = nativeElement.querySelector<HTMLButtonElement>('[data-testid="password-reveal-button"]')!;

    expect(passwordInput.type).toBe('password');

    revealButton.dispatchEvent(new Event('pointerdown'));
    fixture.detectChanges();
    expect(passwordInput.type).toBe('text');

    revealButton.dispatchEvent(new Event('pointerup'));
    fixture.detectChanges();
    expect(passwordInput.type).toBe('password');
  });

  it('shows account disabled when the login response reports a disabled account', () => {
    cmsService.login.and.returnValue(of({ success: false, reason: 'disabled' }));
    const component = fixture.componentInstance;

    component.email = 'viewer@example.com';
    component.password = 'Bubbles123!@#';
    component.login();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(component.errorMessage).toBe('Account Disabled');
    expect(nativeElement.querySelector('.login-error')?.textContent).toContain('Account Disabled');
  });

  it('requests a reset email from reset mode', () => {
    const component = fixture.componentInstance;

    component.email = 'viewer@example.com';
    component.authMode = 'reset';
    component.requestReset();

    expect(cmsService.requestPasswordReset).toHaveBeenCalledWith('viewer@example.com');
    expect(component.infoMessage).toContain('reset link');
  });

  it('shows the local reset link when the local backend returns one', () => {
    cmsService.requestPasswordReset.and.returnValue(of({
      success: true,
      resetUrl: 'http://localhost:4200/admin/reset-password?email=viewer%40example.com&code=local-reset',
      resetCode: 'local-reset',
    }));
    const component = fixture.componentInstance;

    component.email = 'viewer@example.com';
    component.authMode = 'reset';
    component.requestReset();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const resetLink = nativeElement.querySelector<HTMLAnchorElement>('.local-reset-link');
    expect(component.infoMessage).toContain('Local reset link generated');
    expect(resetLink?.href).toContain('/admin/reset-password');
    expect(resetLink?.textContent).toContain('Open reset page');
  });
});
