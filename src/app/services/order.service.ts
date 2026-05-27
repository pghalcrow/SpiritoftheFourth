import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';


@Injectable({
  providedIn: 'root'
})
export class OrderService {

  constructor(private httpClient: HttpClient) { }

  submitOrder(payload: any): Observable<any> {
    const httpOptions = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    };

    return this.httpClient.post<any>(
      environment.order.url,
      payload,
      httpOptions
    );
  }

  captureOrder(orderId: string): Observable<any> {
    let payload: any = {
      "action": "captureOrder",
      "orderId": orderId

    }

    let httpOptions = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    };
    let results = this.httpClient.post<any>(environment.order.url, payload, httpOptions);
    return results;
  }

  createStripeOrder(payload: any): Observable<any> {
    return this.httpClient.post<any>(
      environment.order.url,
      { ...payload, action: 'createStripeSession' },
      { headers: new HttpHeaders({ 'Content-Type': 'application/json' }) }
    );
  }

  createEventPayPalOrder(payload: any): Observable<any> {
    return this.httpClient.post<any>(
      environment.order.url,
      payload,
      {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' })
      }
    );
  }
}