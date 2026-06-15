import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AdminGuard } from './admin.guard';
import { environment } from '../../environments/environment';

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
    expect(sessionStorage.getItem('adminRole')).toBe('admin');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('preserves developer access in local development after developer login', () => {
    sessionStorage.setItem('adminToken', 'cms-developer-token');
    sessionStorage.setItem('adminRole', 'developer');

    expect(guard.canActivate()).toBeTrue();
    expect(sessionStorage.getItem('adminToken')).toBe('cms-developer-token');
    expect(sessionStorage.getItem('adminRole')).toBe('developer');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('allows developer token access in production', () => {
    const originalProduction = environment.production;
    try {
      environment.production = true;
      sessionStorage.setItem('adminToken', 'cms-developer-token');

      expect(guard.canActivate()).toBeTrue();
      expect(router.navigate).not.toHaveBeenCalled();
    } finally {
      environment.production = originalProduction;
    }
  });
});
