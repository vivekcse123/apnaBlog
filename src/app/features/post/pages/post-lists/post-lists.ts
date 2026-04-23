import { Component, inject, signal, computed, OnInit, OnDestroy, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Post } from '../../../../core/models/post.model';
import { CreatePost } from '../create-post/create-post';
import { PostService } from '../../services/post-service';
import { ViewPost } from '../../../../shared/view-post/view-post';
import { Auth } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';
import { NotificationNavigationService, POST_NOTIFICATION_TYPES } from '../../../../core/services/open-notification/notification-navigation';

@Component({
  selector: 'app-post-lists',
  standalone: true,
  imports: [CommonModule, FormsModule, CreatePost, ViewPost],
  templateUrl: './post-lists.html',
  styleUrl: './post-lists.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostLists implements OnInit, OnDestroy {

  private route        = inject(ActivatedRoute);
  private postService  = inject(PostService);
  private destroyRef   = inject(DestroyRef);
  private authService  = inject(Auth);
  private toastService = inject(ToastService);
  private navSvc       = inject(NotificationNavigationService);

  allBlogs       = signal<Post[]>([]);
  isLoading      = signal(true);
  userId         = signal<string | null>(null);
  role           = signal<string>('');
  showCreateBlog = signal(false);

  readonly skeletonRows = Array(6).fill(null);

  searchTitle      = '';
  debounceValue    = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus   = signal<string>('');
  showTodayOnly    = signal<boolean>(false);

  private debounceTimer: any;

  currentPage  = signal<number>(1);
  itemsPerPage = signal<number>(6);

  pendingCount  = computed(() => this.allBlogs().filter(p => p.status === 'pending').length);
  publishedCount = computed(() => this.allBlogs().filter(p => p.status === 'published').length);

  filteredBlogs = computed(() => {
    let data = this.allBlogs();

    if (this.showTodayOnly()) {
      const today = new Date();
      data = data.filter(post => {
        const d = new Date(post.createdAt);
        return d.getFullYear() === today.getFullYear() &&
               d.getMonth()    === today.getMonth()    &&
               d.getDate()     === today.getDate();
      });
    }
    if (this.debounceValue()) {
      const s = this.debounceValue().toLowerCase();
      data = data.filter(p => p.title.toLowerCase().includes(s));
    }
    if (this.selectedCategory()) {
      data = data.filter(p => p.categories?.includes(this.selectedCategory()));
    }
    if (this.selectedStatus()) {
      data = data.filter(p => p.status === this.selectedStatus());
    }
    return data;
  });

  paginatedBlogs = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return this.filteredBlogs().slice(start, start + this.itemsPerPage());
  });

  totalPages = computed(() => Math.ceil(this.filteredBlogs().length / this.itemsPerPage()));
  pages      = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

 ngOnInit(): void {
  this.route?.parent?.params
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(params => {
      const id = params['id'];
      if (!id) return;
      this.userId.set(id);
      this.loadPosts(id);
    });

  // ✅ Replaces consumePendingEvent — works whether component is new or already mounted
  this.navSvc.openModal$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(event => {
      if (POST_NOTIFICATION_TYPES.includes(event.type) && event.resourceId) {
        this.viewPost(event.resourceId);
      }
    });
}

loadPosts(userId?: string): void {
  const id = userId ?? this.userId();
  if (!id) return;

  const currentUser = this.authService.getCurrentUser();
  const role = currentUser?.role?.toLowerCase() ?? '';
  this.role.set(role);

  const posts$ = (role === 'admin' || role === 'super_admin')
    ? this.postService.getAllPostAdmin(1, 1000)
    : this.postService.getPostByUserId(id, 1, 1000);

  this.isLoading.set(true);

  posts$
    .pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isLoading.set(false))
    )
    .subscribe({
      next: res => this.allBlogs.set(res.data || []),
      error: () => {},
    });
}

  toggleTodayFilter(): void { this.showTodayOnly.update(v => !v); this.currentPage.set(1); }
  onCategoryChange(v: string): void { this.selectedCategory.set(v); this.currentPage.set(1); }
  onStatusChange(v: string):   void { this.selectedStatus.set(v);   this.currentPage.set(1); }

  debounceSearch(value: string): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceValue.set(value);
      this.currentPage.set(1);
    }, 400);
  }

  previousPage(): void { if (this.currentPage() > 1) this.currentPage.set(this.currentPage() - 1); }
  nextPage():     void { if (this.currentPage() < this.totalPages()) this.currentPage.set(this.currentPage() + 1); }
  goToPage(p: number): void { if (p >= 1 && p <= this.totalPages()) this.currentPage.set(p); }

  onPostCreated(): void { this.loadPosts(); this.currentPage.set(1); }

  showConfirm        = signal(false);
  pendingDeleteId    = signal<string>('');
  pendingDeleteTitle = signal<string>('');

  confirmDelete(id: string, title: string): void {
    this.pendingDeleteId.set(id);
    this.pendingDeleteTitle.set(title);
    this.showConfirm.set(true);
  }

  cancelDelete(): void {
    this.showConfirm.set(false);
    this.pendingDeleteId.set('');
    this.pendingDeleteTitle.set('');
  }

  proceedDelete(): void {
    const id = this.pendingDeleteId();
    if (!id) return;

    this.showConfirm.set(false);

    this.postService.deletePost(id).subscribe({
      next: () => {
        this.toastService.show('Post deleted successfully.', 'success');
        this.loadPosts();
      },
      error: err => {
        this.toastService.show(err?.error?.message ?? 'Failed to delete post.', 'error');
      },
    });
  }

  isPostViewed   = signal(false);
  selectedPostId = signal<string>('');

  viewPost(id: string): void {
    this.selectedPostId.set(id);
    this.isPostViewed.set(true);
  }

  closeModal(): void {
    this.isPostViewed.set(false);
    this.selectedPostId.set('');
  }

  ngOnDestroy(): void {
    clearTimeout(this.debounceTimer);
  }

  onPostUpdated(updatedPost: Post): void {
    this.allBlogs.update(blogs => blogs.map(b => b._id === updatedPost._id ? updatedPost : b));
    this.closeModal();
  }
}