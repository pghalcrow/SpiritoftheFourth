import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { SignInComponent } from './sign-in.component';
import { CmsService } from 'src/app/services/cms.service';

describe('SignInComponent', () => {
  let fixture: ComponentFixture<SignInComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SignInComponent],
      imports: [FormsModule],
      providers: [
        {
          provide: CmsService,
          useValue: {
            login: () => of({ success: true, token: 'cms-admin-token' }),
          },
        },
        {
          provide: Router,
          useValue: { navigate: jasmine.createSpy('navigate') },
        },
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
});
