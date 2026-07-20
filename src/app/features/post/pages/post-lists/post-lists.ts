import { Component, inject, signal, computed, OnInit, OnDestroy, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Post } from '../../../../core/models/post.model';

// Same thresholds enforced at creation time in create-post.ts - kept here so
// the admin list can flag posts published before that gate existed.
const MIN_WORDS         = 500;
const MIN_MCQ_QUESTIONS = 5;

function wordCount(html: string): number {
  const text = (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  return text.trim().split(/\s+/).filter(Boolean).length;
}
import { CreatePost } from '../create-post/create-post';
import { PostService } from '../../services/post-service';
import { ViewPost } from '../../../../shared/view-post/view-post';
import { Auth } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';
import { DashboardCache } from '../../../../core/services/dashboard-cache';
import { NotificationNavigationService, POST_NOTIFICATION_TYPES } from '../../../../core/services/open-notification/notification-navigation';
import { AdminService } from '../../../admin/services/admin-service';
import { User } from '../../../user/models/user.mode';
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
  private adminService   = inject(AdminService);
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
  showSponsoredOnly       = signal<boolean>(false);
  showThinOnly            = signal<boolean>(false);

  private debounceTimer: ReturnType<typeof setTimeout> | undefined = undefined;

  currentPage  = signal<number>(1);
  itemsPerPage = signal<number>(6);

  pendingCount         = computed(() => this.allBlogs().filter(p => p.status === 'pending').length);
  publishedCount       = computed(() => this.allBlogs().filter(p => p.status === 'published').length);
  deletionRequestCount = computed(() => this.allBlogs().filter(p => p.deleteRequested).length);
  thinPostCount        = computed(() => this.allBlogs().filter(p => this.isThinPost(p)).length);

  /** Content depth for the "Words" column - MCQ posts are measured by question count instead of body text. */
  contentDepth(post: Post): { label: string; thin: boolean } {
    if (post.postType === 'mcq') {
      const n = post.mcqQuestions?.length ?? 0;
      return { label: `${n} Q${n === 1 ? '' : 's'}`, thin: n < MIN_MCQ_QUESTIONS };
    }
    const words = post.wordCount ?? wordCount(post.content);
    return { label: `${words}w`, thin: words < MIN_WORDS };
  }

  isThinPost(post: Post): boolean {
    return this.contentDepth(post).thin;
  }

  filteredBlogs = computed(() => {
    let data = this.allBlogs();

    if (this.showSponsoredOnly()) {
      data = data.filter(p => p.isSponsored);
    }
    if (this.showDeletionRequestOnly()) {
      data = data.filter(p => p.deleteRequested);
    }
    if (this.showThinOnly()) {
      data = data.filter(p => this.isThinPost(p));
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
      data = data.filter(p =>
        p.title.toLowerCase().includes(s) ||
        ((p.user as any)?.name ?? '').toLowerCase().includes(s)
      );
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

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredBlogs().length / this.itemsPerPage())));
  pages      = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));
  pageStart  = computed(() => Math.min((this.currentPage() - 1) * this.itemsPerPage() + 1, this.filteredBlogs().length));
  pageEnd    = computed(() => Math.min(this.currentPage() * this.itemsPerPage(), this.filteredBlogs().length));

  /* -1 is the ellipsis sentinel ("…") - keeps the button count capped at
     7 slots (1, …, cur-1..cur+1, …, total) regardless of totalPages, so the
     nav row fits in one line on mobile instead of needing to scroll. */
  static readonly PAGE_ELLIPSIS = -1;

  visiblePages = computed(() => {
    const total = this.totalPages();
    const cur   = this.currentPage();
    if (total <= 7) return this.pages();

    const ELLIPSIS = PostLists.PAGE_ELLIPSIS;
    let start = Math.max(2, cur - 1);
    let end   = Math.min(total - 1, cur + 1);
    // Collapsing a single hidden page into "…" saves no space and just
    // looks like a gap (e.g. "1 3 4 5" with page 2 silently missing) -
    // show it directly instead of eliding it.
    if (start === 3) start = 2;
    if (end === total - 2) end = total - 1;

    const pages: number[] = [1];
    if (start > 2) pages.push(ELLIPSIS);
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push(ELLIPSIS);
    pages.push(total);
    return pages;
  });

  draftCount   = computed(() => this.allBlogs().filter(p => p.status === 'draft').length);
  sponsorCount = computed(() => this.allBlogs().filter(p => p.isSponsored).length);

  timeAgo(date: any): string {
    if (!date) return '-';
    const diff = Date.now() - new Date(date).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)   return 'just now';
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30)  return `${d}d ago`;
    const mo = Math.floor(d / 30);
    return `${mo}mo ago`;
  }

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
    if (this.showTodayOnly()) { this.showDeletionRequestOnly.set(false); this.showSponsoredOnly.set(false); this.showThinOnly.set(false); }
    this.currentPage.set(1);
  }

  toggleDeletionFilter(): void {
    this.showDeletionRequestOnly.update(v => !v);
    if (this.showDeletionRequestOnly()) { this.showTodayOnly.set(false); this.showSponsoredOnly.set(false); this.showThinOnly.set(false); }
    this.currentPage.set(1);
  }

  toggleSponsoredFilter(): void {
    this.showSponsoredOnly.update(v => !v);
    if (this.showSponsoredOnly()) { this.showTodayOnly.set(false); this.showDeletionRequestOnly.set(false); this.showThinOnly.set(false); }
    this.currentPage.set(1);
  }

  toggleThinFilter(): void {
    this.showThinOnly.update(v => !v);
    if (this.showThinOnly()) { this.showTodayOnly.set(false); this.showDeletionRequestOnly.set(false); this.showSponsoredOnly.set(false); }
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
        // Patch cache in-place - no full refetch needed
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

  // ── Reassign Author (orphan posts) ───────────────────────────────────────
  showReassignModal   = signal(false);
  reassignPostId      = signal('');
  reassignPostTitle   = signal('');
  allUsers            = signal<User[]>([]);
  selectedUserId      = signal('');
  reassignSubmitting  = signal(false);

  openReassignModal(blog: Post): void {
    this.reassignPostId.set(blog._id);
    this.reassignPostTitle.set(blog.title || 'Untitled');
    this.selectedUserId.set('');
    this.showReassignModal.set(true);

    if (this.allUsers().length) return;
    this.adminService.getAllUsersRaw(1, 200)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: res => this.allUsers.set(res.data ?? []), error: () => {} });
  }

  closeReassignModal(): void {
    this.showReassignModal.set(false);
    this.reassignPostId.set('');
    this.reassignPostTitle.set('');
    this.selectedUserId.set('');
  }

  submitReassign(): void {
    const postId = this.reassignPostId();
    const userId = this.selectedUserId();
    if (!postId || !userId || this.reassignSubmitting()) return;
    this.reassignSubmitting.set(true);

    this.postService.reassignAuthor(postId, userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.reassignSubmitting.set(false);
          this.toastService.show('Author reassigned successfully.', 'success');
          if (res.data) {
            this.allBlogs.update(blogs => blogs.map(b => b._id === postId ? { ...b, user: res.data!.user } : b));
          }
          this.dashboardCache.invalidateAdminPosts();
          this.closeReassignModal();
        },
        error: err => {
          this.reassignSubmitting.set(false);
          this.toastService.show(err?.error?.message ?? 'Failed to reassign author.', 'error');
        },
      });
  }

  ngOnDestroy(): void {
    clearTimeout(this.debounceTimer);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  onPostUpdated(updatedPost: Post): void {
    this.allBlogs.update(blogs => blogs.map(b => b._id === updatedPost._id ? updatedPost : b));
    this.closeModal();
  }

  // ── Sponsor Blog ──────────────────────────────────────────────────────────

  showSponsorModal    = signal(false);
  sponsorTargetId     = signal('');
  sponsorTargetTitle  = signal('');
  sponsorHasExpiry    = signal(false);
  sponsorDays         = signal(30);
  sponsorExpiryAction = signal<'delete' | 'keep'>('keep');
  sponsorPriority     = signal(1);
  sponsorCtaText      = signal('');
  sponsorCtaUrl       = signal('');
  isSponsorSaving     = signal(false);

  openSponsorModal(blog: Post): void {
    this.sponsorTargetId.set(blog._id);
    this.sponsorTargetTitle.set(blog.title);
    this.sponsorHasExpiry.set(false);
    this.sponsorDays.set(30);
    this.sponsorExpiryAction.set('keep');
    this.sponsorPriority.set(blog.sponsorPriority ?? 1);
    this.sponsorCtaText.set(blog.sponsorCtaText ?? '');
    this.sponsorCtaUrl.set(blog.sponsorCtaUrl ?? '');
    this.showSponsorModal.set(true);
  }

  closeSponsorModal(): void {
    this.showSponsorModal.set(false);
    this.sponsorTargetId.set('');
    this.sponsorTargetTitle.set('');
  }

  submitSponsor(): void {
    const id = this.sponsorTargetId();
    if (!id || this.isSponsorSaving()) return;
    this.isSponsorSaving.set(true);
    const days         = this.sponsorHasExpiry() ? this.sponsorDays() : undefined;
    const expiryAction = this.sponsorHasExpiry() ? this.sponsorExpiryAction() : undefined;
    const priority     = this.sponsorPriority();
    const ctaText      = this.sponsorCtaText().trim() || undefined;
    const ctaUrl       = this.sponsorCtaUrl().trim()  || undefined;
    this.postService.sponsorPost(id, days, expiryAction, priority, ctaText, ctaUrl).subscribe({
      next: res => {
        this.allBlogs.update(blogs => blogs.map(b => b._id === id ? { ...b, ...res.data } : b));
        this.dashboardCache.invalidateAdminPosts();
        this.isSponsorSaving.set(false);
        this.closeSponsorModal();
        this.toastService.show('Blog marked as sponsored.', 'success');
      },
      error: err => {
        this.isSponsorSaving.set(false);
        this.toastService.show(err?.error?.message ?? 'Failed to sponsor blog.', 'error');
      },
    });
  }

  unsponsorBlog(blog: Post): void {
    this.postService.unsponsorPost(blog._id).subscribe({
      next: res => {
        this.allBlogs.update(blogs => blogs.map(b => b._id === blog._id ? { ...b, ...res.data } : b));
        this.dashboardCache.invalidateAdminPosts();
        this.toastService.show('Sponsorship removed.', 'success');
      },
      error: err => {
        this.toastService.show(err?.error?.message ?? 'Failed to remove sponsorship.', 'error');
      },
    });
  }
}