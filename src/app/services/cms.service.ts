import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { FormGroup } from '@angular/forms';

export interface EventPricing {
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
}

export interface Event {
  title: string;
  type: string;
  flyerUrl: string;
  description: string;
  eventMeta: EventMeta;
  pricing: EventPricing;
  formFields: any[];
  sections: any[];

  formGroup?: FormGroup;
}

export interface CmsEvent extends Event {
  selectedFile?: File;
}

export interface AdminLoginResponse {
  success: boolean;
  token?: string;
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
    return this.http.get<{ events: Event[] }>(`${this.baseUrl}${this.routes.events}`);
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

  /** Login as admin */
  login(password: string): Observable<AdminLoginResponse> {
    return this.http.post<AdminLoginResponse>(`${this.baseUrl}${this.routes.login}`, { password });
  }
}