import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(): boolean {
    const token = sessionStorage.getItem('adminToken');
    if (token === 'cms-admin-token') {
      return true;
    }
    this.router.navigate(['/sign-in']);
    return false;
  }
}
