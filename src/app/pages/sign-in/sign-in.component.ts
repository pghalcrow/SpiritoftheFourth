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
  authMode: 'login' | 'reset' | 'newPassword' = 'login';
  newPassword: string = '';
  confirmNewPassword: string = '';
  newPasswordSession: string = '';
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
          if (res.challenge === 'NEW_PASSWORD_REQUIRED' && res.session) {
            this.authMode = 'newPassword';
            this.newPasswordSession = res.session;
            this.email = res.email || this.email;
            this.password = '';
            this.infoMessage = 'Set a new password to finish activating this admin account.';
            return;
          }
          if (res.success) {
            this.finishLogin(res);
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

  completeNewPassword() {
    this.errorMessage = '';
    this.infoMessage = '';
    if (!this.passwordMeetsPolicy(this.newPassword)) {
      this.errorMessage = 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.';
      return;
    }
    if (this.newPassword !== this.confirmNewPassword) {
      this.errorMessage = 'Passwords must match.';
      return;
    }
    this.isLoading = true;
    this.cmsService.completeNewPasswordChallenge(this.email, this.newPassword, this.newPasswordSession).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.finishLogin(res);
      },
      error: error => {
        this.isLoading = false;
        this.errorMessage = error?.error?.error || 'Password setup failed.';
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
    this.newPassword = '';
    this.confirmNewPassword = '';
    this.newPasswordSession = '';
    this.showPassword = false;
  }

  revealPassword() {
    this.showPassword = true;
  }

  concealPassword() {
    this.showPassword = false;
  }

  private finishLogin(res: { token?: string; role?: any; email?: string }) {
    sessionStorage.setItem('adminToken', res.token!);
    sessionStorage.setItem('adminRole', res.role || 'admin');
    if (res.email) sessionStorage.setItem('adminEmail', res.email);
    this.router.navigate(['/admin']);
  }

  private passwordMeetsPolicy(password: string): boolean {
    return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  }
}
