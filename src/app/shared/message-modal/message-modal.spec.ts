import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MessageModal } from './message-modal';

describe('MessageModal', () => {
  let component: MessageModal;
  let fixture: ComponentFixture<MessageModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MessageModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MessageModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
