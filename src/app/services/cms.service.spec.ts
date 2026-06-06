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
      status: 'Complete',
      assignedTo: 'Patrick',
      notes: 'Verified',
    }).subscribe(res => {
      expect(res.status).toBe('Complete');
    });

    const req = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.submissions}/s1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.status).toBe('Complete');
    req.flush({ submissionId: 's1', status: 'Complete', assignedTo: 'Patrick', notes: 'Verified' });
  });
});
