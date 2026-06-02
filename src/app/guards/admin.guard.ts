import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(): boolean {
    if (!environment.production) {
      sessionStorage.setItem('adminToken', 'cms-admin-token');
      return true;
    }

    const token = sessionStorage.getItem('adminToken');
    if (token === 'cms-admin-token') {
      return true;
    }
    this.router.navigate(['/sign-in']);
    return false;
  }
}
