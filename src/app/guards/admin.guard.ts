import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(): boolean {
    const token = sessionStorage.getItem('adminToken');
    const allowedRoles = new Set(['developer', 'superAdmin', 'admin', 'viewer']);
    if (!environment.production) {
      const hasLegacyLocalAccess = token === 'cms-admin-token' || token === 'cms-developer-token';
      const repairedLocalSession = this.repairLocalBackendSession(token);
      const role = sessionStorage.getItem('adminRole');
      const hasLocalBackendAccess = Boolean(repairedLocalSession && allowedRoles.has(role || ''));
      if (!hasLegacyLocalAccess && !hasLocalBackendAccess) {
        this.setDefaultLocalBackendSession();
      }
      return true;
    }

    const role = sessionStorage.getItem('adminRole');
    if (token && (token === 'cms-admin-token' || token === 'cms-developer-token' || allowedRoles.has(role || ''))) {
      return true;
    }
    this.router.navigate(['/sign-in']);
    return false;
  }

  private repairLocalBackendSession(token: string | null): boolean {
    const localTokenPrefix = 'local-admin-token:';
    if (!token?.startsWith(localTokenPrefix)) return false;

    const email = token.slice(localTokenPrefix.length).trim().toLowerCase();
    const allowedRoles = new Set(['developer', 'superAdmin', 'admin', 'viewer']);
    const seededLocalRoles: Record<string, string> = {
      'developer@example.com': 'developer',
      'superadmin@example.com': 'superAdmin',
      'admin@example.com': 'admin',
      'viewer@example.com': 'viewer',
    };
    const role = seededLocalRoles[email];

    sessionStorage.setItem('adminEmail', email);
    if (email === 'developer@example.com') {
      sessionStorage.setItem('adminRole', 'developer');
      return true;
    }

    const currentRole = sessionStorage.getItem('adminRole');
    if (!role) {
      return allowedRoles.has(currentRole || '');
    }

    sessionStorage.setItem('adminRole', allowedRoles.has(currentRole || '') ? currentRole! : role);
    return true;
  }

  private setDefaultLocalBackendSession(): void {
    sessionStorage.setItem('adminToken', 'local-admin-token:developer@example.com');
    sessionStorage.setItem('adminRole', 'developer');
    sessionStorage.setItem('adminEmail', 'developer@example.com');
  }
}
