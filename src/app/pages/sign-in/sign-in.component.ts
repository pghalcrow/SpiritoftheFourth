import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CmsService } from 'src/app/services/cms.service';

@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css']
})
export class SignInComponent {
  email: string = '';
  password: string = '';
  authMode: 'login' | 'reset' = 'login';
  errorMessage: string = '';
  infoMessage: string = '';
  localResetUrl: string = '';
  isLoading = false;
  showPassword = false;

  constructor(private router: Router, private cmsService: CmsService) {}

  login() {
    this.errorMessage = '';
    this.infoMessage = '';
    this.localResetUrl = '';
    this.isLoading = true;
    this.cmsService.login(this.email, this.password).subscribe({
        next: (res) => {
          this.isLoading = false;
          if (res.success) {
            sessionStorage.setItem('adminToken', res.token!);
            sessionStorage.setItem('adminRole', res.role || 'admin');
            if (res.email) sessionStorage.setItem('adminEmail', res.email);
            this.router.navigate(['/admin']);
          } else {
            this.errorMessage = res.reason === 'disabled' ? 'Account Disabled' : 'Incorrect email or password.';
          }
        },
        error: () => {
          this.isLoading = false;
          this.errorMessage = 'Login failed.';
        }
      });
  }

  requestReset() {
    this.errorMessage = '';
    this.infoMessage = '';
    this.localResetUrl = '';
    this.isLoading = true;
    this.cmsService.requestPasswordReset(this.email).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.resetUrl) {
          this.localResetUrl = res.resetUrl;
          this.infoMessage = 'Local reset link generated. Use the link below to finish resetting this password.';
          return;
        }
        this.infoMessage = 'If this email has an admin account, a reset link has been sent.';
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'Password reset request failed.';
      }
    });
  }

  setMode(mode: 'login' | 'reset') {
    this.authMode = mode;
    this.errorMessage = '';
    this.infoMessage = '';
    this.localResetUrl = '';
    this.showPassword = false;
  }

  revealPassword() {
    this.showPassword = true;
  }

  concealPassword() {
    this.showPassword = false;
  }
}
