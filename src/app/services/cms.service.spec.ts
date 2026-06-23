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

  it('lists admin submissions with pagination query params', () => {
    sessionStorage.setItem('adminToken', 'cms-admin-token');

    service.getSubmissions({ limit: 50, cursor: 'next-page', summaryOnly: false, group: 'vendor', search: 'alpha' }).subscribe(res => {
      expect(res.items[0].submissionId).toBe('s1');
      expect(res.nextCursor).toBe('cursor-2');
      expect(res.totalCount).toBe(125);
      expect(res.totalPages).toBe(3);
    });

    const req = httpMock.expectOne(request =>
      request.url === `${environment.cms.baseUrl}${environment.cms.routes.submissions}` &&
      request.params.get('limit') === '50' &&
      request.params.get('cursor') === 'next-page' &&
      request.params.get('summary') === 'false' &&
      request.params.get('group') === 'vendor' &&
      request.params.get('search') === 'alpha'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer cms-admin-token');
    req.flush({ items: [{ submissionId: 's1', submissionTitle: 'Volunteer', status: 'New' }], nextCursor: 'cursor-2', totalCount: 125, totalPages: 3 });
  });

  it('gets one admin submission detail row', () => {
    sessionStorage.setItem('adminToken', 'cms-admin-token');

    service.getSubmissionDetail('s1').subscribe(res => {
      expect(res.rawData.message).toBe('Available morning');
    });

    const req = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.submissions}/s1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer cms-admin-token');
    req.flush({ submissionId: 's1', submissionTitle: 'Volunteer', status: 'New', rawData: { message: 'Available morning' } });
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

  it('logs in with email and password', () => {
    service.login('admin@example.com', 'secret7').subscribe(res => {
      expect(res.role).toBe('superAdmin');
      expect(res.email).toBe('admin@example.com');
    });

    const req = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.login}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'admin@example.com', password: 'secret7' });
    req.flush({ success: true, token: 'jwt-token', role: 'superAdmin', email: 'admin@example.com' });
  });

  it('requests and confirms admin password reset', () => {
    service.requestPasswordReset('admin@example.com').subscribe(res => {
      expect(res.success).toBeTrue();
    });
    const request = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.passwordReset}`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'admin@example.com' });
    request.flush({ success: true });

    service.confirmPasswordReset('admin@example.com', '123456', 'secret7').subscribe(res => {
      expect(res.success).toBeTrue();
    });
    const confirm = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.passwordResetConfirm}`);
    expect(confirm.request.method).toBe('POST');
    expect(confirm.request.body).toEqual({ email: 'admin@example.com', code: '123456', password: 'secret7' });
    confirm.flush({ success: true });
  });

  it('manages admin users with bearer auth', () => {
    sessionStorage.setItem('adminToken', 'jwt-token');

    service.getAdminUsers().subscribe(res => {
      expect(res.items[0].role).toBe('viewer');
    });
    const list = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.adminUsers}`);
    expect(list.request.method).toBe('GET');
    expect(list.request.headers.get('Authorization')).toBe('Bearer jwt-token');
    list.flush({ items: [{ email: 'viewer@example.com', role: 'viewer', enabled: true, status: 'CONFIRMED' }] });

    service.createAdminUser('viewer2@example.com', 'viewer').subscribe(res => {
      expect(res.email).toBe('viewer2@example.com');
    });
    const create = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.adminUsers}`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ email: 'viewer2@example.com', role: 'viewer' });
    expect(create.request.headers.get('Authorization')).toBe('Bearer jwt-token');
    create.flush({ email: 'viewer2@example.com', role: 'viewer' });

    service.updateAdminUser('viewer2@example.com', { role: 'admin', enabled: false }).subscribe(res => {
      expect(res.email).toBe('viewer2@example.com');
      expect(res.role).toBe('admin');
      expect(res.enabled).toBeFalse();
    });
    const update = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.adminUsers}/viewer2%40example.com`);
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual({ role: 'admin', enabled: false });
    expect(update.request.headers.get('Authorization')).toBe('Bearer jwt-token');
    update.flush({ email: 'viewer2@example.com', role: 'admin', enabled: false });

    service.deleteAdminUser('viewer2@example.com').subscribe(res => {
      expect(res.success).toBeTrue();
    });
    const remove = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.adminUsers}/viewer2%40example.com`);
    expect(remove.request.method).toBe('DELETE');
    expect(remove.request.headers.get('Authorization')).toBe('Bearer jwt-token');
    remove.flush({ success: true, email: 'viewer2@example.com' });
  });
});
