import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from 'src/environments/environment';
import { FileServerService } from './file-server.service';

describe('FileServerService', () => {
  let service: FileServerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });

    service = TestBed.inject(FileServerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('uploads files with all fields returned by the presigned post response', () => {
    const file = new File(['vendor application'], 'vendor.pdf', { type: 'application/pdf' });
    let folderKey = '';

    service.postFiles([file]).subscribe(result => {
      folderKey = result;
    });

    const presignReq = httpMock.expectOne(environment.email.url);
    expect(presignReq.request.method).toBe('POST');
    expect(presignReq.request.body).toEqual({
      getSignedURLs: true,
      fileNames: ['vendor.pdf'],
    });
    presignReq.flush({
      folderKey: 'folder-1',
      signedURLs: {
        'vendor.pdf': {
          url: 'https://s3.example.com/',
          fields: {
            key: 'folder-1/vendor.pdf',
            AWSAccessKeyId: 'access-key',
            policy: 'policy-value',
            signature: 'signature-value',
            'x-amz-security-token': 'token-value',
          },
        },
      },
    });

    const uploadReq = httpMock.expectOne('https://s3.example.com/');
    expect(uploadReq.request.method).toBe('POST');
    const formData = uploadReq.request.body as FormData;
    expect(formData.get('key')).toBe('folder-1/vendor.pdf');
    expect(formData.get('AWSAccessKeyId')).toBe('access-key');
    expect(formData.get('policy')).toBe('policy-value');
    expect(formData.get('signature')).toBe('signature-value');
    expect(formData.get('x-amz-security-token')).toBe('token-value');
    const uploadedFile = formData.get('file') as File;
    expect(uploadedFile.name).toBe('vendor.pdf');
    expect(uploadedFile.type).toBe('application/pdf');
    uploadReq.flush(null, { status: 204, statusText: 'No Content' });

    expect(folderKey).toBe('folder-1');
  });
});
