import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Post } from '../../../../core/models/post.model';
import { CreatePost } from '../create-post/create-post';
import { PostService } from '../../services/post-service';
import { ViewPost } from '../../../../shared/view-post/view-post';
import { MessageModal } from '../../../../shared/message-modal/message-modal';
import { Auth } from '../../../../core/services/auth';
import { LoaderService } from '../../../../core/services/loader-service';
import { NotificationNavigationService, POST_NOTIFICATION_TYPES } from '../../../../core/services/open-notification/notification-navigation';

@Component({
  selector: 'app-post-lists',
  standalone: true,
  imports: [CommonModule, FormsModule, CreatePost, ViewPost, MessageModal],
  templateUrl: './post-lists.html',
  styleUrl: './post-lists.css',
})
export class PostLists implements OnInit {

  private route        = inject(ActivatedRoute);
  private postService  = inject(PostService);
  private destroyRef   = inject(DestroyRef);
  private authService  = inject(Auth);
  private loader       = inject(LoaderService);
  private navSvc       = inject(NotificationNavigationService); // ✅

  allBlogs       = signal<Post[]>([]);
  userId         = signal<string | null>(null);
  role           = signal<string>('');
  showCreateBlog = signal(false);

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

// ✅ Remove onComplete callback — no longer needed
loadPosts(userId?: string): void {
  const id = userId ?? this.userId();
  if (!id) return;

  const currentUser = this.authService.getCurrentUser();
  const role = currentUser?.role?.toLowerCase() ?? '';
  this.role.set(role);

  const posts$ = role === 'admin'
    ? this.postService.getAllPostAdmin(1, 1000)
    : this.postService.getPostByUserId(id, 1, 1000);

  this.loader.show('skeleton', 'md', this.itemsPerPage());

  posts$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: res => {
        this.allBlogs.set(res.data || []);
        this.loader.hide();
      },
      error: err => {
        console.error(err?.error?.message);
        this.loader.hide();
      },
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
    this.loader.show('overlay', 'md');

    this.postService.deletePost(id).subscribe({
      next: () => {
        this.loader.hide();
        this.modalType.set('success');
        this.modalTitle.set('Post Deleted');
        this.modalMessage.set('The post has been deleted successfully.');
        this.showMessage.set(true);
        this.loadPosts();
      },
      error: err => {
        this.loader.hide();
        this.modalType.set('error');
        this.modalTitle.set('Delete Failed');
        this.modalMessage.set(err?.error?.message ?? 'Failed to delete post.');
        this.showMessage.set(true);
      },
    });
  }

  showMessage  = signal(false);
  modalType    = signal<'success' | 'error'>('success');
  modalTitle   = signal('');
  modalMessage = signal('');

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

  onPostUpdated(updatedPost: Post): void {
    this.allBlogs.update(blogs => blogs.map(b => b._id === updatedPost._id ? updatedPost : b));
    this.closeModal();
  }
}