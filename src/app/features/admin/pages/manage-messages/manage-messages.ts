import { Component, ChangeDetectionStrategy, OnInit, PLATFORM_ID, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminMessagesService, ContactMessage, AdminConversation } from '../../services/admin-messages.service';
import { Message } from '../../../../shared/models/message.model';
import { ManageCallbackRequests } from '../manage-callback-requests/manage-callback-requests';

type MessagesTab = 'contact' | 'messages' | 'callback';

@Component({
  selector: 'app-manage-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, ManageCallbackRequests],
  templateUrl: './manage-messages.html',
  styleUrl: './manage-messages.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageMessages implements OnInit {
  private adminMessages = inject(AdminMessagesService);
  private platformId = inject(PLATFORM_ID);

  activeTab = signal<MessagesTab>('contact');
  private loadedTabs = new Set<MessagesTab>();

  /** Exposed for the tab-bar unread badges. */
  unreadContactCount = this.adminMessages.unreadContactCount;
  unreadMessageCount = this.adminMessages.unreadMessageCount;

  // ── Contact Submissions ──
  contacts = signal<ContactMessage[]>([]);
  contactTotal = signal(0);
  contactPage = signal(1);
  readonly contactLimit = 20;
  contactLoading = signal(true);
  contactError = signal('');
  contactUpdating = signal<Set<string>>(new Set());
  expandedContactId = signal<string | null>(null);
  contactReadFilter = signal<'' | 'true' | 'false'>('');
  contactSearch = signal('');

  // ── Direct Messages ──
  conversations = signal<AdminConversation[]>([]);
  conversationTotal = signal(0);
  conversationPage = signal(1);
  readonly conversationLimit = 20;
  conversationLoading = signal(true);
  conversationError = signal('');
  conversationSearch = signal('');
  expandedConversation = signal<AdminConversation | null>(null);
  thread = signal<Message[]>([]);
  threadLoading = signal(false);

  constructor() {
    // Live refresh: react to new contact/message events without a manual
    // reload, but only for whichever tab is actually visible/loaded.
    effect(() => {
      this.adminMessages.liveTick();
      if (untracked(this.activeTab) === 'contact' && !untracked(this.contactLoading)) this.loadContacts();
      if (untracked(this.activeTab) === 'messages' && !untracked(this.conversationLoading)) this.loadConversations();
    });
  }

  ngOnInit(): void {
    this.adminMessages.ensureLive();
    this.loadContacts();
  }

  setTab(tab: MessagesTab): void {
    this.activeTab.set(tab);
    if (this.loadedTabs.has(tab)) return;
    if (tab === 'messages') this.loadConversations();
  }

  // ── Contact tab ──
  applyContactFilters(): void {
    this.contactPage.set(1);
    this.loadContacts();
  }
  resetContactFilters(): void {
    this.contactReadFilter.set('');
    this.contactSearch.set('');
    this.applyContactFilters();
  }
  loadContacts(): void {
    this.contactLoading.set(true);
    this.contactError.set('');
    this.adminMessages.listContacts({
      read: this.contactReadFilter() || undefined,
      search: this.contactSearch() || undefined,
      page: this.contactPage(),
      limit: this.contactLimit,
    }).subscribe({
      next: (res) => {
        this.contacts.set(res.data ?? []);
        this.contactTotal.set(res.total ?? 0);
        this.contactLoading.set(false);
        this.loadedTabs.add('contact');
      },
      error: (err) => {
        this.contactError.set(err?.error?.message ?? 'Failed to load contact messages.');
        this.contactLoading.set(false);
      },
    });
  }
  toggleContactExpand(id: string): void {
    this.expandedContactId.set(this.expandedContactId() === id ? null : id);
  }
  markContactRead(c: ContactMessage): void {
    if (c.read) return;
    const set = new Set(this.contactUpdating());
    set.add(c._id);
    this.contactUpdating.set(set);
    this.adminMessages.markContactRead(c._id).subscribe({
      next: (res) => {
        this.contacts.update(list => list.map(x => x._id === c._id ? res.data : x));
        const s = new Set(this.contactUpdating()); s.delete(c._id); this.contactUpdating.set(s);
      },
      error: () => {
        const s = new Set(this.contactUpdating()); s.delete(c._id); this.contactUpdating.set(s);
      },
    });
  }
  contactTotalPages(): number { return Math.max(1, Math.ceil(this.contactTotal() / this.contactLimit)); }
  goToContactPage(p: number): void {
    if (p < 1 || p > this.contactTotalPages()) return;
    this.contactPage.set(p);
    this.loadContacts();
  }
  exportContactsCsv(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const cols = ['Name', 'Email', 'Subject', 'Message', 'Read', 'Received On'];
    const rows = this.contacts().map(c => [c.name, c.email, c.subject, c.message, c.read ? 'Yes' : 'No', c.createdAt]);
    this.downloadCsv('contact-messages', cols, rows);
  }

  // ── Direct Messages tab ──
  applyConversationFilters(): void {
    this.conversationPage.set(1);
    this.loadConversations();
  }
  resetConversationFilters(): void {
    this.conversationSearch.set('');
    this.applyConversationFilters();
  }
  loadConversations(): void {
    this.conversationLoading.set(true);
    this.conversationError.set('');
    this.adminMessages.listConversations({
      search: this.conversationSearch() || undefined,
      page: this.conversationPage(),
      limit: this.conversationLimit,
    }).subscribe({
      next: (res) => {
        this.conversations.set(res.data ?? []);
        this.conversationTotal.set(res.total ?? 0);
        this.conversationLoading.set(false);
        this.loadedTabs.add('messages');
      },
      error: (err) => {
        this.conversationError.set(err?.error?.message ?? 'Failed to load conversations.');
        this.conversationLoading.set(false);
      },
    });
  }
  conversationTotalPages(): number { return Math.max(1, Math.ceil(this.conversationTotal() / this.conversationLimit)); }
  goToConversationPage(p: number): void {
    if (p < 1 || p > this.conversationTotalPages()) return;
    this.conversationPage.set(p);
    this.loadConversations();
  }
  toggleConversationExpand(conv: AdminConversation): void {
    const current = this.expandedConversation();
    if (current && current.userA._id === conv.userA._id && current.userB._id === conv.userB._id) {
      this.expandedConversation.set(null);
      this.thread.set([]);
      return;
    }
    this.expandedConversation.set(conv);
    this.thread.set([]);
    this.threadLoading.set(true);
    this.adminMessages.getAdminThread(conv.userA._id, conv.userB._id).subscribe({
      next: (res) => {
        this.thread.set(res.data ?? []);
        this.threadLoading.set(false);
      },
      error: () => this.threadLoading.set(false),
    });
  }
  isMine(msg: Message, conv: AdminConversation): boolean {
    return msg.sender === conv.userA._id;
  }

  // ── Shared ──
  private downloadCsv(fileNamePrefix: string, cols: string[], rows: (string | number)[][]): void {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [cols, ...rows].map(row => row.map(v => escape(String(v))).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileNamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  trackByContactId(_i: number, c: ContactMessage): string { return c._id; }
  trackByConversation(_i: number, c: AdminConversation): string { return c.userA._id + ':' + c.userB._id; }
  trackByMessageId(_i: number, m: Message): string { return m._id; }
}
