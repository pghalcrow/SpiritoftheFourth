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
    if (!environment.production) {
      if (token !== 'cms-admin-token' && token !== 'cms-developer-token') {
        sessionStorage.setItem('adminToken', 'cms-admin-token');
        sessionStorage.setItem('adminRole', 'admin');
      }
      return true;
    }

    if (token === 'cms-admin-token' || token === 'cms-developer-token') {
      return true;
    }
    this.router.navigate(['/sign-in']);
    return false;
  }
}
