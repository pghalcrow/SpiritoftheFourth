import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { CmsService } from './cms.service';
import { environment } from 'src/environments/environment';

describe('CmsService', () => {
  let service: CmsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });

    service = TestBed.inject(CmsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('resolves uploaded cms asset paths against the configured asset base url', () => {
    expect(service.resolveAssetUrl('assets/new-flyer.png')).toBe(
      `${environment.cms.assetBaseUrl}/assets/new-flyer.png`
    );
  });

  it('leaves absolute urls unchanged', () => {
    const url = 'https://example.com/assets/new-flyer.png';

    expect(service.resolveAssetUrl(url)).toBe(url);
  });

  it('fetches events with cache busting so admin changes show on public pages', () => {
    spyOn(Date, 'now').and.returnValue(1234567890);

    service.getEvents().subscribe(res => {
      expect(res.events[0].title).toBe('Updated Event');
    });

    const req = httpMock.expectOne(
      `${environment.cms.baseUrl}${environment.cms.routes.events}?_=${Date.now()}`
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Cache-Control')).toBe('no-cache');
    expect(req.request.headers.get('Pragma')).toBe('no-cache');
    req.flush({ events: [{ title: 'Updated Event' }] });
  });

  it('lists admin submissions', () => {
    sessionStorage.setItem('adminToken', 'cms-admin-token');

    service.getSubmissions().subscribe(res => {
      expect(res.items[0].submissionId).toBe('s1');
    });

    const req = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.submissions}`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer cms-admin-token');
    req.flush({ items: [{ submissionId: 's1', submissionTitle: 'Volunteer', status: 'New' }] });
  });

  it('updates admin submission fields', () => {
    sessionStorage.setItem('adminToken', 'cms-admin-token');

    service.updateSubmissionAdminFields('s1', {
      notes: 'Verified',
    }).subscribe(res => {
      expect(res.status).toBe('Complete');
    });

    const req = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.submissions}/s1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ notes: 'Verified' });
    req.flush({ submissionId: 's1', status: 'Complete', assignedTo: 'Patrick', notes: 'Verified' });
  });

  it('updates check payment received status for admin submissions', () => {
    sessionStorage.setItem('adminToken', 'cms-admin-token');

    service.updateSubmissionAdminFields('s1', {
      notes: 'Check received',
      paymentReceived: true,
    }).subscribe(res => {
      expect(res.paymentReceived).toBeTrue();
    });

    const req = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.submissions}/s1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ notes: 'Check received', paymentReceived: true });
    req.flush({ submissionId: 's1', status: 'New', assignedTo: '', notes: 'Check received', paymentReceived: true });
  });

  it('deletes an admin submission', () => {
    sessionStorage.setItem('adminToken', 'cms-admin-token');

    service.deleteSubmission('s1').subscribe(res => {
      expect(res.success).toBeTrue();
      expect(res.submissionId).toBe('s1');
    });

    const req = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.submissions}/s1`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Authorization')).toBe('Bearer cms-admin-token');
    req.flush({ success: true, submissionId: 's1' });
  });

  it('reads test mode status', () => {
    sessionStorage.setItem('adminToken', 'cms-developer-token');

    service.getTestMode().subscribe(res => {
      expect(res.testMode).toBeTrue();
    });

    const req = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.testMode}`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer cms-developer-token');
    req.flush({ testMode: true });
  });

  it('updates test mode status', () => {
    sessionStorage.setItem('adminToken', 'cms-developer-token');

    service.updateTestMode(false).subscribe(res => {
      expect(res.testMode).toBeFalse();
    });

    const req = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.testMode}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ enabled: false });
    expect(req.request.headers.get('Authorization')).toBe('Bearer cms-developer-token');
    req.flush({ testMode: false });
  });
});
