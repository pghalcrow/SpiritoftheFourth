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
    cmsService = jasmine.createSpyObj<CmsService>('CmsService', ['login']);
    cmsService.login.and.returnValue(of({ success: true, token: 'cms-admin-token', role: 'admin' }));

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
    expect(nativeElement.querySelector('.password-field')).toBeTruthy();
    expect(nativeElement.querySelector('.login-button')).toBeTruthy();
  });

  it('stores the returned admin role after login', () => {
    cmsService.login.and.returnValue(of({ success: true, token: 'cms-developer-token', role: 'developer' }));
    const component = fixture.componentInstance;

    component.password = 'C0ffeeCup0215';
    component.login();

    expect(sessionStorage.getItem('adminToken')).toBe('cms-developer-token');
    expect(sessionStorage.getItem('adminRole')).toBe('developer');
    expect(router.navigate).toHaveBeenCalledWith(['/admin']);
  });
});
