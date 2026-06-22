import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { FormGroup } from '@angular/forms';

export interface EventPricing {
  pricingMode?: 'free' | 'fixed' | 'perParticipant';
  basePlayerField: string;
  includePrimaryPlayer: boolean;
  pricePerPlayer: number;
  addOns?: {
    field: string;
    price: number;
  }[];
}

export interface EventMeta {
  dateOfEvent: string;
  location: string;
  endBlurb: string;
  contactEmail: string;
  contactEmails?: string[];
}

export interface Event {
  title: string;
  type: string;
  flyerUrl: string;
  description: string;
  isVisible?: boolean;
  eventMeta: EventMeta;
  pricing: EventPricing;
  formFields: any[];
  sections: any[];

  formGroup?: FormGroup;
}

export interface CmsEvent extends Event {
  selectedFile?: File;
  selectedFilePreviewUrl?: string;
}

export interface AdminLoginResponse {
  success: boolean;
  token?: string;
  idToken?: string;
  role?: AdminRole;
  email?: string;
  reason?: 'disabled';
}

export type AdminRole = 'developer' | 'superAdmin' | 'admin' | 'viewer';

export interface AdminUser {
  email: string;
  username?: string;
  role: AdminRole;
  enabled?: boolean;
  status?: string;
}

export interface AdminUsersResponse {
  items: AdminUser[];
}

export interface AdminUserMutationResponse {
  success?: boolean;
  email: string;
  role?: AdminRole;
  enabled?: boolean;
  status?: string;
}

export interface AdminUserUpdate {
  role?: AdminRole;
  enabled?: boolean;
}

export interface AdminPasswordResetResponse {
  success: boolean;
  resetUrl?: string;
  resetCode?: string;
}

export interface AdminSubmission {
  submissionId: string;
  submissionTitle: string;
  submittedAt?: string;
  name?: string;
  email?: string;
  phone?: string;
  paymentStatus?: string;
  paymentProvider?: string;
  paymentReceived?: boolean;
  amount?: number;
  currency?: string;
  source?: string;
  status: string;
  assignedTo: string;
  notes: string;
  rawData?: any;
}

export interface AdminSubmissionListResponse {
  items: AdminSubmission[];
  nextCursor?: string | null;
  pageSize?: number;
}

export interface AdminSubmissionListOptions {
  limit?: number;
  cursor?: string;
  summaryOnly?: boolean;
}

export interface AdminSubmissionUpdate {
  status?: string;
  assignedTo?: string;
  notes?: string;
  paymentReceived?: boolean;
}

export interface AdminSubmissionDeleteResponse {
  success: boolean;
  submissionId: string;
}

export interface AdminTestModeResponse {
  testMode: boolean;
  updatedBy?: string;
  updatedAt?: string;
  localOnly?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CmsService {
  private baseUrl = environment.cms.baseUrl;
  private routes = environment.cms.routes;

  constructor(private http: HttpClient) {}

  /** Fetch events from CMS */
  getEvents(): Observable<{ events: Event[] }> {
    return this.http.get<{ events: Event[] }>(
      `${this.baseUrl}${this.routes.events}?_=${Date.now()}`,
      {
        headers: new HttpHeaders({
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        }),
      }
    );
  }

  updateEvents(events: Event[]): Observable<{ success: boolean }> {
    const token = sessionStorage.getItem('adminToken');
    return this.http.post<{ success: boolean }>(
      `${this.baseUrl}${this.routes.adminEvents}`, 
      { events },
      { headers: { 
        Authorization: `Bearer ${token}` 
        } 
      }
    );
  }

  getSubmissions(options: AdminSubmissionListOptions = {}): Observable<AdminSubmissionListResponse> {
    const token = sessionStorage.getItem('adminToken');
    let params = new HttpParams();
    if (options.limit) {
      params = params.set('limit', String(options.limit));
    }
    if (options.cursor) {
      params = params.set('cursor', options.cursor);
    }
    if (options.summaryOnly === false) {
      params = params.set('summary', 'false');
    }
    return this.http.get<AdminSubmissionListResponse>(
      `${this.baseUrl}${this.routes.submissions}`,
      { headers: { Authorization: `Bearer ${token}` }, params }
    );
  }

  getSubmissionDetail(submissionId: string): Observable<AdminSubmission> {
    const token = sessionStorage.getItem('adminToken');
    return this.http.get<AdminSubmission>(
      `${this.baseUrl}${this.routes.submissions}/${encodeURIComponent(submissionId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  updateSubmissionAdminFields(submissionId: string, update: AdminSubmissionUpdate): Observable<AdminSubmission> {
    const token = sessionStorage.getItem('adminToken');
    return this.http.patch<AdminSubmission>(
      `${this.baseUrl}${this.routes.submissions}/${submissionId}`,
      update,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  deleteSubmission(submissionId: string): Observable<AdminSubmissionDeleteResponse> {
    const token = sessionStorage.getItem('adminToken');
    return this.http.delete<AdminSubmissionDeleteResponse>(
      `${this.baseUrl}${this.routes.submissions}/${submissionId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  getTestMode(): Observable<AdminTestModeResponse> {
    const token = sessionStorage.getItem('adminToken');
    return this.http.get<AdminTestModeResponse>(
      `${this.baseUrl}${this.routes.testMode}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  updateTestMode(enabled: boolean): Observable<AdminTestModeResponse> {
    const token = sessionStorage.getItem('adminToken');
    return this.http.patch<AdminTestModeResponse>(
      `${this.baseUrl}${this.routes.testMode}`,
      { enabled },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  uploadImage(file: File): Observable<{ success: boolean; url: string }> {
    const token = sessionStorage.getItem('adminToken');
    const reader = new FileReader();
    return new Observable((observer) => {
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        this.http.post<{ success: boolean; url: string }>(
          `${this.baseUrl}${this.routes.upload}`,
          { fileName: file.name, base64, contentType: file.type },
          { headers: { 
            Authorization: `Bearer ${token}` 
            } 
          }
        ).subscribe({
          next: res => { observer.next(res); observer.complete(); },
          error: err => observer.error(err)
        });
      };
      reader.readAsDataURL(file);
    });
  }

  resolveAssetUrl(url: string): string {
    if (!url || /^(https?:|data:|blob:|\/)/.test(url)) {
      return url;
    }

    const assetBaseUrl = (environment.cms as any).assetBaseUrl;
    if (assetBaseUrl && url.startsWith('assets/')) {
      return `${assetBaseUrl.replace(/\/$/, '')}/${url}`;
    }

    return url;
  }

  getAdminUsers(): Observable<AdminUsersResponse> {
    const token = sessionStorage.getItem('adminToken');
    return this.http.get<AdminUsersResponse>(
      `${this.baseUrl}${this.routes.adminUsers}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  createAdminUser(email: string, role: AdminRole): Observable<AdminUserMutationResponse> {
    const token = sessionStorage.getItem('adminToken');
    return this.http.post<AdminUserMutationResponse>(
      `${this.baseUrl}${this.routes.adminUsers}`,
      { email, role },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  deleteAdminUser(email: string): Observable<AdminUserMutationResponse> {
    const token = sessionStorage.getItem('adminToken');
    return this.http.delete<AdminUserMutationResponse>(
      `${this.baseUrl}${this.routes.adminUsers}/${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  updateAdminUser(email: string, update: AdminUserUpdate): Observable<AdminUserMutationResponse> {
    const token = sessionStorage.getItem('adminToken');
    return this.http.patch<AdminUserMutationResponse>(
      `${this.baseUrl}${this.routes.adminUsers}/${encodeURIComponent(email)}`,
      update,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  requestPasswordReset(email: string): Observable<AdminPasswordResetResponse> {
    return this.http.post<AdminPasswordResetResponse>(
      `${this.baseUrl}${this.routes.passwordReset}`,
      { email }
    );
  }

  confirmPasswordReset(email: string, code: string, password: string): Observable<AdminPasswordResetResponse> {
    return this.http.post<AdminPasswordResetResponse>(
      `${this.baseUrl}${this.routes.passwordResetConfirm}`,
      { email, code, password }
    );
  }

  /** Login as admin */
  login(email: string, password?: string): Observable<AdminLoginResponse> {
    if (password === undefined) {
      return this.http.post<AdminLoginResponse>(`${this.baseUrl}${this.routes.login}`, { password: email });
    }
    return this.http.post<AdminLoginResponse>(`${this.baseUrl}${this.routes.login}`, { email, password });
  }
}
