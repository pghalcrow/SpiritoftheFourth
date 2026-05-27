import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class EmailService {

  constructor(private httpClient: HttpClient) {

  }


  sendEmail(toContact: string, message: string, subject: string, replyTo: string, name: string, phone: string, attachments?: string, formData?: any): Observable<any> {


    let payload: any = {
      "toContact": toContact,
      "subject": subject,
      "replyTo": replyTo,
      "name": name,
      "phone": phone,
      "body": message,
      ...(formData || {})
    }
    if (attachments && attachments.length > 0) {
      payload['attachments'] = attachments
    }

    let httpOptions = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    };
    let results = this.httpClient.post<any>(environment.email.url, payload, httpOptions);
    return results;

  }

  sendVenderEmail(payload: any): Observable<any> {
    let httpOptions = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    };
    let results = this.httpClient.post<any>(environment.email.url, payload, httpOptions);
    return results;

  }
}