import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        AdminGuard,
        { provide: Router, useValue: router },
      ],
    });

    guard = TestBed.inject(AdminGuard);
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('allows direct admin access in local development', () => {
    expect(guard.canActivate()).toBeTrue();
    expect(sessionStorage.getItem('adminToken')).toBe('cms-admin-token');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
