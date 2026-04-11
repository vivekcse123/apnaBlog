import { TestBed } from '@angular/core/testing';

import { NotificationNavigation } from './notification-navigation';

describe('NotificationNavigation', () => {
  let service: NotificationNavigation;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationNavigation);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
