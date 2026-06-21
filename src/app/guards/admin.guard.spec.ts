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
    expect(sessionStorage.getItem('adminToken')).toBe('local-admin-token:developer@example.com');
    expect(sessionStorage.getItem('adminRole')).toBe('developer');
    expect(sessionStorage.getItem('adminEmail')).toBe('developer@example.com');
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

  it('preserves local backend developer access in local development after email login', () => {
    sessionStorage.setItem('adminToken', 'local-admin-token:developer@example.com');
    sessionStorage.setItem('adminRole', 'developer');

    expect(guard.canActivate()).toBeTrue();
    expect(sessionStorage.getItem('adminToken')).toBe('local-admin-token:developer@example.com');
    expect(sessionStorage.getItem('adminRole')).toBe('developer');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('preserves local backend super admin access in local development after email login', () => {
    sessionStorage.setItem('adminToken', 'local-admin-token:superadmin@example.com');
    sessionStorage.setItem('adminRole', 'superAdmin');

    expect(guard.canActivate()).toBeTrue();
    expect(sessionStorage.getItem('adminToken')).toBe('local-admin-token:superadmin@example.com');
    expect(sessionStorage.getItem('adminRole')).toBe('superAdmin');
    expect(sessionStorage.getItem('adminEmail')).toBe('superadmin@example.com');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('preserves an upgraded local admin role returned by login', () => {
    sessionStorage.setItem('adminToken', 'local-admin-token:admin@example.com');
    sessionStorage.setItem('adminRole', 'superAdmin');
    sessionStorage.setItem('adminEmail', 'admin@example.com');

    expect(guard.canActivate()).toBeTrue();
    expect(sessionStorage.getItem('adminToken')).toBe('local-admin-token:admin@example.com');
    expect(sessionStorage.getItem('adminRole')).toBe('superAdmin');
    expect(sessionStorage.getItem('adminEmail')).toBe('admin@example.com');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('preserves non-seeded local backend users with a valid login role', () => {
    sessionStorage.setItem('adminToken', 'local-admin-token:unconfirmed@example.com');
    sessionStorage.setItem('adminRole', 'viewer');
    sessionStorage.setItem('adminEmail', 'unconfirmed@example.com');

    expect(guard.canActivate()).toBeTrue();
    expect(sessionStorage.getItem('adminToken')).toBe('local-admin-token:unconfirmed@example.com');
    expect(sessionStorage.getItem('adminRole')).toBe('viewer');
    expect(sessionStorage.getItem('adminEmail')).toBe('unconfirmed@example.com');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('repairs stale local backend developer sessions that were downgraded to admin', () => {
    sessionStorage.setItem('adminToken', 'local-admin-token:developer@example.com');
    sessionStorage.setItem('adminRole', 'admin');
    sessionStorage.setItem('adminEmail', 'developer@example.com');

    expect(guard.canActivate()).toBeTrue();
    expect(sessionStorage.getItem('adminToken')).toBe('local-admin-token:developer@example.com');
    expect(sessionStorage.getItem('adminRole')).toBe('developer');
    expect(sessionStorage.getItem('adminEmail')).toBe('developer@example.com');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('repairs local backend sessions that are missing a valid login role before opening admin', () => {
    sessionStorage.setItem('adminToken', 'local-admin-token:deleted@example.com');
    sessionStorage.setItem('adminRole', 'unknown-role');
    sessionStorage.setItem('adminEmail', 'deleted@example.com');

    expect(guard.canActivate()).toBeTrue();
    expect(sessionStorage.getItem('adminToken')).toBe('local-admin-token:developer@example.com');
    expect(sessionStorage.getItem('adminRole')).toBe('developer');
    expect(sessionStorage.getItem('adminEmail')).toBe('developer@example.com');
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

  it('allows Cognito admin role access in production', () => {
    const originalProduction = environment.production;
    try {
      environment.production = true;
      sessionStorage.setItem('adminToken', 'jwt-access-token');
      sessionStorage.setItem('adminRole', 'superAdmin');

      expect(guard.canActivate()).toBeTrue();
      expect(router.navigate).not.toHaveBeenCalled();
    } finally {
      environment.production = originalProduction;
    }
  });
});
