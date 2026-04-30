import { Component, inject, signal, computed, OnInit, OnDestroy, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
import { DashboardCache } from '../../../../core/services/dashboard-cache';
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

  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private postService    = inject(PostService);
  private destroyRef     = inject(DestroyRef);
  private authService    = inject(Auth);
  private toastService   = inject(ToastService);
  private dashboardCache = inject(DashboardCache);
  private navSvc         = inject(NotificationNavigationService);

  allBlogs       = signal<Post[]>([]);
  isLoading      = signal(true);
  userId         = signal<string | null>(null);
  role           = signal<string>('');
  showCreateBlog = signal(false);

  readonly skeletonRows = Array(6).fill(null);

  searchTitle      = '';
  debounceValue    = signal<string>('');
  selectedCategory        = signal<string>('');
  selectedStatus          = signal<string>('');
  showTodayOnly           = signal<boolean>(false);
  showDeletionRequestOnly = signal<boolean>(false);

  private debounceTimer: any;

  currentPage  = signal<number>(1);
  itemsPerPage = signal<number>(6);

  pendingCount         = computed(() => this.allBlogs().filter(p => p.status === 'pending').length);
  publishedCount       = computed(() => this.allBlogs().filter(p => p.status === 'published').length);
  deletionRequestCount = computed(() => this.allBlogs().filter(p => p.deleteRequested).length);

  filteredBlogs = computed(() => {
    let data = this.allBlogs();

    if (this.showDeletionRequestOnly()) {
      data = data.filter(p => p.deleteRequested);
    }
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

    // Pre-apply status filter when arriving via a deep-link (e.g. "Review Now" → ?status=pending)
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const status = params['status'];
        if (status) {
          this.selectedStatus.set(status);
          // Clear the query param from the URL without triggering navigation
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {},
            replaceUrl: true,
          });
        }
      });

    this.navSvc.openModal$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (POST_NOTIFICATION_TYPES.includes(event.type) && event.resourceId) {
          this.viewPost(event.resourceId);
        }
      });

    // Re-fetch when the browser tab regains focus and data is stale
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  // Arrow function so `this` is stable when used as an event listener
  private readonly _onVisibilityChange = (): void => {
    if (document.hidden) return;
    const id = this.userId();
    if (!id) return;
    const role = this.authService.getCurrentUser()?.role?.toLowerCase() ?? '';
    const isAdmin = role === 'admin' || role === 'super_admin';
    const stale = isAdmin
      ? this.dashboardCache.isAdminPostsStale()
      : this.dashboardCache.isUserDataStale(id);
    if (stale) this.loadPosts();
  };

  loadPosts(userId?: string): void {
    const id = userId ?? this.userId();
    if (!id) return;

    const currentUser = this.authService.getCurrentUser();
    const role = currentUser?.role?.toLowerCase() ?? '';
    this.role.set(role);

    const isAdmin = role === 'admin' || role === 'super_admin';

    // ── Fast path: serve from independent cache slot ──────────────────────────
    if (isAdmin) {
      const cached = this.dashboardCache.getAdminPosts();
      if (cached) {
        this.allBlogs.set(cached as Post[]);
        this.isLoading.set(false);
        if (this.dashboardCache.isAdminPostsStale()) this._fetchAdminPosts();
        return;
      }
    } else {
      const cached = this.dashboardCache.getUserPosts(id);
      if (cached) {
        this.allBlogs.set(cached as Post[]);
        this.isLoading.set(false);
        if (this.dashboardCache.isUserDataStale(id)) this._fetchUserPosts(id);
        return;
      }
    }

    // ── Cold path ─────────────────────────────────────────────────────────────
    this.isLoading.set(true);
    if (isAdmin) this._fetchAdminPosts(true);
    else this._fetchUserPosts(id, true);
  }

  private _fetchAdminPosts(showLoader = false): void {
    if (showLoader) this.isLoading.set(true);
    this.postService.getAllPostAdmin(1, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: res => {
          const posts = res.data ?? [];
          this.allBlogs.set(posts as Post[]);
          this.dashboardCache.setAdminPosts(posts);   // ← only writes its own slot
        },
        error: () => {},
      });
  }

private _fetchUserPosts(uid: string, showLoader = false): void {
  if (showLoader) this.isLoading.set(true);
  this.postService.getPostByUserId(uid, 1, 1000)
    .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.isLoading.set(false)))
    .subscribe({
      next: res => {
        const posts = res.data ?? [];
        this.allBlogs.set(posts as Post[]);
        this.dashboardCache.setUserPosts(uid, posts);
      },
      error: () => {},
    });
}

  toggleTodayFilter(): void {
    this.showTodayOnly.update(v => !v);
    if (this.showTodayOnly()) this.showDeletionRequestOnly.set(false);
    this.currentPage.set(1);
  }

  toggleDeletionFilter(): void {
    this.showDeletionRequestOnly.update(v => !v);
    if (this.showDeletionRequestOnly()) this.showTodayOnly.set(false);
    this.currentPage.set(1);
  }

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

  onPostCreated(): void {
    this.dashboardCache.invalidateAdminPosts();
    const uid = this.userId();
    if (uid) this.dashboardCache.invalidateUser(uid);
    this.loadPosts();
    this.currentPage.set(1);
  }

  // ── Admin: direct delete confirm ──────────────────────────────────────────
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
        this.dashboardCache.invalidateAdminPosts();
        this.loadPosts();
      },
      error: err => {
        this.toastService.show(err?.error?.message ?? 'Failed to delete post.', 'error');
      },
    });
  }

  // ── Admin: approve deletion request ──────────────────────────────────────
  showApproveConfirm   = signal(false);
  pendingApproveId     = signal<string>('');
  pendingApproveTitle  = signal<string>('');
  pendingApproveReason = signal<string>('');

  openApproveDelete(id: string, title: string, reason: string): void {
    this.pendingApproveId.set(id);
    this.pendingApproveTitle.set(title);
    this.pendingApproveReason.set(reason || '');
    this.showApproveConfirm.set(true);
  }

  cancelApproveDelete(): void {
    this.showApproveConfirm.set(false);
    this.pendingApproveId.set('');
    this.pendingApproveTitle.set('');
    this.pendingApproveReason.set('');
  }

  proceedApproveDelete(): void {
    const id = this.pendingApproveId();
    if (!id) return;
    this.showApproveConfirm.set(false);

    this.postService.approveDeleteRequest(id).subscribe({
      next: () => {
        this.toastService.show('Deletion approved. Post has been deleted.', 'success');
        this.dashboardCache.invalidateAdminPosts();
        this.loadPosts();
      },
      error: err => {
        this.toastService.show(err?.error?.message ?? 'Failed to approve deletion.', 'error');
      },
    });
  }

  // ── Admin: reject deletion request ───────────────────────────────────────
  showRejectConfirm  = signal(false);
  pendingRejectId    = signal<string>('');
  pendingRejectTitle = signal<string>('');

  openRejectDelete(id: string, title: string): void {
    this.pendingRejectId.set(id);
    this.pendingRejectTitle.set(title);
    this.showRejectConfirm.set(true);
  }

  cancelRejectDelete(): void {
    this.showRejectConfirm.set(false);
    this.pendingRejectId.set('');
    this.pendingRejectTitle.set('');
  }

  proceedRejectDelete(): void {
    const id = this.pendingRejectId();
    if (!id) return;
    this.showRejectConfirm.set(false);

    this.postService.rejectDeleteRequest(id).subscribe({
      next: () => {
        this.toastService.show('Deletion request rejected. Post kept.', 'success');
        this.allBlogs.update(blogs =>
          blogs.map(b => b._id === id ? { ...b, deleteRequested: false, deleteRequestReason: null } : b)
        );
        // Patch cache in-place — no full refetch needed
        const cached = this.dashboardCache.getAdminPosts();
        if (cached) {
          this.dashboardCache.setAdminPosts(
            cached.map((p: any) =>
              p._id === id ? { ...p, deleteRequested: false, deleteRequestReason: null } : p
            )
          );
        }
      },
      error: err => {
        this.toastService.show(err?.error?.message ?? 'Failed to reject deletion.', 'error');
      },
    });
  }

  // ── User: soft delete request ──────────────────────────────────────────────
  showDeleteRequestModal  = signal(false);
  deleteRequestId         = signal<string>('');
  deleteRequestTitle      = signal<string>('');
  deleteRequestReason     = signal<string>('');
  deleteRequestSubmitting = signal(false);

  openDeleteRequest(id: string, title: string): void {
    this.deleteRequestId.set(id);
    this.deleteRequestTitle.set(title);
    this.deleteRequestReason.set('');
    this.showDeleteRequestModal.set(true);
  }

  cancelDeleteRequest(): void {
    this.showDeleteRequestModal.set(false);
    this.deleteRequestId.set('');
    this.deleteRequestTitle.set('');
    this.deleteRequestReason.set('');
  }

  submitDeleteRequest(): void {
    const id     = this.deleteRequestId();
    const reason = this.deleteRequestReason().trim();
    if (!id || !reason) return;

    this.deleteRequestSubmitting.set(true);
    this.postService.requestPostDelete(id, reason).subscribe({
      next: () => {
        this.deleteRequestSubmitting.set(false);
        this.toastService.show('Deletion request sent. Admin will review it shortly.', 'success');
        this.cancelDeleteRequest();
        const uid = this.userId();
        if (uid) this.dashboardCache.invalidateUser(uid);
        else this.dashboardCache.invalidateAdminPosts();
        this.loadPosts();
      },
      error: err => {
        this.deleteRequestSubmitting.set(false);
        this.toastService.show(err?.error?.message ?? 'Failed to submit deletion request.', 'error');
      },
    });
  }

  isPostViewed   = signal(false);
  selectedPostId = signal<string>('');
  selectedPost   = signal<Post | null>(null);

  viewPost(id: string): void {
    // Pass the full object from the list so the modal renders instantly
    const fromList = this.allBlogs().find(b => b._id === id) ?? null;
    this.selectedPost.set(fromList);
    this.selectedPostId.set(id);
    this.isPostViewed.set(true);
  }

  closeModal(): void {
    this.isPostViewed.set(false);
    this.selectedPostId.set('');
    this.selectedPost.set(null);
  }

  ngOnDestroy(): void {
    clearTimeout(this.debounceTimer);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  onPostUpdated(updatedPost: Post): void {
    this.allBlogs.update(blogs => blogs.map(b => b._id === updatedPost._id ? updatedPost : b));
    this.closeModal();
  }
}