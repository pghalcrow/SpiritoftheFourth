import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

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

  it('requires matching passwords with at least seven characters and a number', () => {
    component.password = 'secret';
    component.confirmPassword = 'secret';
    component.submit();

    expect(component.errorMessage).toContain('at least 7 characters');
    expect(cmsService.confirmPasswordReset).not.toHaveBeenCalled();

    component.password = 'secret7';
    component.confirmPassword = 'different7';
    component.submit();

    expect(component.errorMessage).toContain('match');
    expect(cmsService.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('submits valid reset and returns to sign in', () => {
    component.password = 'secret7';
    component.confirmPassword = 'secret7';
    component.submit();

    expect(cmsService.confirmPasswordReset).toHaveBeenCalledWith('viewer@example.com', '123456', 'secret7');
    expect(router.navigate).toHaveBeenCalledWith(['/sign-in']);
  });
});
