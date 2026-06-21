import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CmsService } from 'src/app/services/cms.service';

@Component({
  selector: 'app-admin-password-reset',
  templateUrl: './admin-password-reset.component.html',
  styleUrls: ['./admin-password-reset.component.css']
})
export class AdminPasswordResetComponent {
  email = '';
  code = '';
  password = '';
  confirmPassword = '';
  errorMessage = '';
  infoMessage = '';
  isLoading = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cmsService: CmsService
  ) {
    this.route.queryParamMap.subscribe(params => {
      this.email = params.get('email') || '';
      this.code = params.get('code') || '';
    });
  }

  submit(): void {
    this.errorMessage = '';
    this.infoMessage = '';
    if (!this.passwordMeetsPolicy(this.password)) {
      this.errorMessage = 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords must match.';
      return;
    }
    this.isLoading = true;
    this.cmsService.confirmPasswordReset(this.email, this.code, this.password).subscribe({
      next: () => {
        this.isLoading = false;
        this.infoMessage = 'Password updated.';
        this.router.navigate(['/sign-in']);
      },
      error: error => {
        this.isLoading = false;
        this.errorMessage = error?.error?.error || 'Password reset failed.';
      }
    });
  }

  private passwordMeetsPolicy(password: string): boolean {
    return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  }
}
