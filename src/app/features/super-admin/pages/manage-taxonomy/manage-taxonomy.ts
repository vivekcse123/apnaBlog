import {
  Component, OnInit, inject, signal, computed, DestroyRef, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { TaxonomyService, TaxonomyItem } from '../../../../core/services/taxonomy.service';
import { AllPostsCache } from '../../../../core/services/all-posts-cache';

type Tab = 'category' | 'tag';

interface EditState {
  id:    string;
  name:  string;
  emoji: string;
  order: number;
}

@Component({
  selector: 'app-manage-taxonomy',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-taxonomy.html',
  styleUrl: './manage-taxonomy.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTaxonomy implements OnInit {
  private taxonomyService = inject(TaxonomyService);
  private allPostsCache   = inject(AllPostsCache);
  private destroyRef      = inject(DestroyRef);

  activeTab = signal<Tab>('category');
  allItems  = signal<TaxonomyItem[]>([]);
  isLoading = signal(true);
  saving    = signal(false);
  error     = signal('');
  success   = signal('');

  // Add form
  newName  = signal('');
  newEmoji = signal('');
  newOrder = signal(0);

  // Edit state
  editState = signal<EditState | null>(null);

  // Delete confirmation modal
  deleteTarget = signal<TaxonomyItem | null>(null);

  items = computed(() => {
    const tab = this.activeTab();
    return this.allItems()
      .filter(i => i.type === tab)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  });

  categoryCount = computed(() => this.allItems().filter(i => i.type === 'category').length);
  tagCount      = computed(() => this.allItems().filter(i => i.type === 'tag').length);

  postCounts = computed<Record<string, number>>(() => {
    const posts = this.allPostsCache.get();
    if (!posts?.length) return {};
    const counts: Record<string, number> = {};
    for (const p of posts) {
      if (p.status !== 'published') continue;
      for (const c of (p.categories ?? [])) counts[c] = (counts[c] ?? 0) + 1;
      for (const t of (p.tags       ?? [])) counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  });

  ngOnInit(): void { this.fetchAll(); }

  private fetchAll(): void {
    this.isLoading.set(true);
    this.taxonomyService.loadAll()
      .pipe(
        catchError(() => of({ status: 200, data: [] as TaxonomyItem[] })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res: any) => {
        this.allItems.set(res.data ?? []);
        this.isLoading.set(false);
      });
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
    this.editState.set(null);
    this.deleteTarget.set(null);
    this.clearMessages();
  }

  add(): void {
    const name = this.newName().trim();
    if (!name) { this.error.set('Name is required'); return; }

    this.saving.set(true);
    this.clearMessages();

    this.taxonomyService.add({
      type:  this.activeTab(),
      name,
      emoji: this.newEmoji().trim(),
      order: this.newOrder(),
    }).pipe(
      catchError(err => {
        this.error.set(err.error?.message ?? 'Failed to add');
        this.saving.set(false);
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(res => {
      if (!res) return;
      this.success.set(`"${name}" added successfully`);
      this.newName.set('');
      this.newEmoji.set('');
      this.newOrder.set(0);
      this.saving.set(false);
      this.taxonomyService.invalidateCache();
      this.fetchAll();
    });
  }

  startEdit(item: TaxonomyItem): void {
    this.editState.set({ id: item._id, name: item.name, emoji: item.emoji, order: item.order });
    this.clearMessages();
  }

  cancelEdit(): void { this.editState.set(null); }

  saveEdit(): void {
    const state = this.editState();
    if (!state) return;
    const name = state.name.trim();
    if (!name) { this.error.set('Name is required'); return; }

    this.saving.set(true);
    this.clearMessages();

    this.taxonomyService.update(state.id, { name, emoji: state.emoji.trim(), order: state.order })
      .pipe(
        catchError(err => {
          this.error.set(err.error?.message ?? 'Failed to update');
          this.saving.set(false);
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(res => {
        if (!res) return;
        this.success.set(`"${name}" updated`);
        this.editState.set(null);
        this.saving.set(false);
        this.taxonomyService.invalidateCache();
        this.fetchAll();
      });
  }

  toggleActive(item: TaxonomyItem): void {
    this.taxonomyService.update(item._id, { isActive: !item.isActive })
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe(res => {
        if (!res) return;
        this.taxonomyService.invalidateCache();
        this.fetchAll();
      });
  }

  // ── Delete flow - modal instead of browser confirm() ─────────────────────
  confirmDelete(item: TaxonomyItem): void {
    this.deleteTarget.set(item);
    this.clearMessages();
  }

  cancelDelete(): void { this.deleteTarget.set(null); }

  executeDelete(): void {
    const item = this.deleteTarget();
    if (!item) return;

    this.saving.set(true);
    this.deleteTarget.set(null);
    this.clearMessages();

    this.taxonomyService.remove(item._id)
      .pipe(
        catchError(err => {
          this.error.set(err.error?.message ?? 'Failed to delete');
          this.saving.set(false);
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(res => {
        if (!res) return;
        this.success.set(`"${item.name}" deleted`);
        this.saving.set(false);
        this.taxonomyService.invalidateCache();
        this.fetchAll();
      });
  }

  updateEditName(val: string):  void { this.editState.update(s => s ? { ...s, name: val }  : s); }
  updateEditEmoji(val: string): void { this.editState.update(s => s ? { ...s, emoji: val } : s); }
  updateEditOrder(val: string): void { this.editState.update(s => s ? { ...s, order: +val } : s); }

  private clearMessages(): void { this.error.set(''); this.success.set(''); }
}
