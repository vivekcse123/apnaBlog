import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { PostService } from './post-service';
import { environment } from '../../../../environments/environment';

describe('PostService', () => {
  let service: PostService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PostService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('dedupes concurrent getAllPublished() callers into a single HTTP round trip', () => {
    const endPoint = environment.apiPostEndpoint.replace(/\/+$/, '');
    let callerAResult: any; let callerBResult: any;

    // Simulates SiteHeader and the page component both calling this on the
    // same cold load, before AllPostsCache is warm - this is the exact race
    // that used to fire two identical backend requests.
    service.getAllPublished().subscribe(res => callerAResult = res);
    service.getAllPublished().subscribe(res => callerBResult = res);

    const reqs = httpMock.match(`${endPoint}?page=1&limit=150`);
    expect(reqs.length).toBe(1);
    reqs[0].flush({ data: [{ _id: '1' }], totalPages: 1 });

    expect(callerAResult).toEqual([{ _id: '1' }]);
    expect(callerBResult).toEqual([{ _id: '1' }]);
  });

  it('issues a fresh request on the next call once the prior one has completed', () => {
    const endPoint = environment.apiPostEndpoint.replace(/\/+$/, '');

    service.getAllPublished().subscribe();
    httpMock.expectOne(`${endPoint}?page=1&limit=150`).flush({ data: [], totalPages: 1 });

    service.getAllPublished().subscribe();
    httpMock.expectOne(`${endPoint}?page=1&limit=150`).flush({ data: [], totalPages: 1 });
  });
});
