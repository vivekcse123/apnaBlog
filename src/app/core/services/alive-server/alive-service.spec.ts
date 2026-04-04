import { TestBed } from '@angular/core/testing';

import { AliveService } from './alive-service';

describe('AliveService', () => {
  let service: AliveService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AliveService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
