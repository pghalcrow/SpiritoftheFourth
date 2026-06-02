import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { CmsService } from './cms.service';
import { environment } from 'src/environments/environment';

describe('CmsService', () => {
  let service: CmsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });

    service = TestBed.inject(CmsService);
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
});
