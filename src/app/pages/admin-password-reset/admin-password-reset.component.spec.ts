import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AdminPasswordResetComponent } from './admin-password-reset.component';
import { CmsService } from 'src/app/services/cms.service';

describe('AdminPasswordResetComponent', () => {
  let fixture: ComponentFixture<AdminPasswordResetComponent>;
  let component: AdminPasswordResetComponent;
  let cmsService: jasmine.SpyObj<CmsService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    cmsService = jasmine.createSpyObj<CmsService>('CmsService', ['confirmPasswordReset']);
    cmsService.confirmPasswordReset.and.returnValue(of({ success: true }));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [AdminPasswordResetComponent],
      imports: [FormsModule],
      providers: [
        { provide: CmsService, useValue: cmsService },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(new Map([['email', 'viewer@example.com'], ['code', '123456']])) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPasswordResetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('prefills email and code from query params', () => {
    expect(component.email).toBe('viewer@example.com');
    expect(component.code).toBe('123456');
  });

  it('requires matching passwords that meet the Cognito password policy', () => {
    component.password = 'secret';
    component.confirmPassword = 'secret';
    component.submit();

    expect(component.errorMessage).toContain('at least 8 characters');
    expect(cmsService.confirmPasswordReset).not.toHaveBeenCalled();

    component.password = 'Bubbles123';
    component.confirmPassword = 'Bubbles123';
    component.submit();

    expect(component.errorMessage).toContain('symbol');
    expect(cmsService.confirmPasswordReset).not.toHaveBeenCalled();

    component.password = 'Bubbles123!';
    component.confirmPassword = 'different123!';
    component.submit();

    expect(component.errorMessage).toContain('match');
    expect(cmsService.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('submits valid reset and returns to sign in', () => {
    component.password = 'Bubbles123!';
    component.confirmPassword = 'Bubbles123!';
    component.submit();

    expect(cmsService.confirmPasswordReset).toHaveBeenCalledWith('viewer@example.com', '123456', 'Bubbles123!');
    expect(router.navigate).toHaveBeenCalledWith(['/sign-in']);
  });

  it('shows the backend password reset error when confirmation fails', () => {
    cmsService.confirmPasswordReset.and.returnValue(throwError(() => ({
      error: { error: 'Invalid or expired reset code. Request a new password reset code and use the newest email.' }
    })));
    component.password = 'Bubbles123!';
    component.confirmPassword = 'Bubbles123!';

    component.submit();

    expect(component.errorMessage).toContain('Invalid or expired reset code');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
