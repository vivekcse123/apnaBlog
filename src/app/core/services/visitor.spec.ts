import { TestBed } from '@angular/core/testing';

import { Visitor } from './visitor';

describe('Visitor', () => {
  let service: Visitor;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Visitor);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
