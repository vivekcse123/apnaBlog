import { TestBed } from '@angular/core/testing';

import { PostCache } from './post-cache';

describe('PostCache', () => {
  let service: PostCache;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PostCache);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
