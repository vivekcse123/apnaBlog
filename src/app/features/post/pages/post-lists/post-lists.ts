import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Post } from '../../../../core/models/post.model';
import { CreatePost } from '../create-post/create-post';
import { PostService } from '../../services/post-service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ViewPost } from '../../../../shared/view-post/view-post';
import { MessageModal } from '../../../../shared/message-modal/message-modal';
import { BlogFilterPipe } from '../../../../shared/pipes/blog-filter-pipe';
import { Auth } from '../../../../core/services/auth';
import { LoaderService } from '../../../../core/services/loader-service';

@Component({
  selector: 'app-post-lists',
  standalone: true,
  imports: [CommonModule, FormsModule, CreatePost, ViewPost, MessageModal, BlogFilterPipe],
  templateUrl: './post-lists.html',
  styleUrl: './post-lists.css',
})
export class PostLists implements OnInit {

  private route        = inject(ActivatedRoute);
  private postService  = inject(PostService);
  private destroyRef   = inject(DestroyRef);
  private authService  = inject(Auth);
  private loader       = inject(LoaderService);

  allBlogs       = signal<Post[]>([]);
  userId         = signal<string | null>(null);
  role           = signal<string>('');
  showCreateBlog = signal(false);

  searchTitle      = '';
  debounceValue    = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus   = signal<string>('');

  // ── Today filter ──
  showTodayOnly = signal<boolean>(false);

  private debounceTimer: any;

  currentPage  = signal<number>(1);
  itemsPerPage = signal<number>(6);

  filteredBlogs = computed(() => {
    let data = this.allBlogs();

    // Today filter: match blogs whose createdAt is today's date
    if (this.showTodayOnly()) {
      const today = new Date();
      data = data.filter(post => {
        const postDate = new Date(post.createdAt);
        return (
          postDate.getFullYear() === today.getFullYear() &&
          postDate.getMonth()    === today.getMonth()    &&
          postDate.getDate()     === today.getDate()
        );
      });
    }

    if (this.debounceValue()) {
      const search = this.debounceValue().toLowerCase();
      data = data.filter(post => post.title.toLowerCase().includes(search));
    }

    if (this.selectedCategory()) {
      data = data.filter(post => post.categories?.includes(this.selectedCategory()));
    }

    if (this.selectedStatus()) {
      data = data.filter(post => post.status === this.selectedStatus());
    }

    return data;
  });

  paginatedBlogs = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return this.filteredBlogs().slice(start, start + this.itemsPerPage());
  });

  totalPages = computed(() =>
    Math.ceil(this.filteredBlogs().length / this.itemsPerPage())
  );

  pages = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  ngOnInit(): void {
    this.route?.parent?.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const id = params['id'];
        if (!id) return;
        this.userId.set(id);
        this.loadPosts(id);
      });
  }

  loadPosts(userId?: string): void {
    const id = userId ?? this.userId();
    if (!id) return;

    const currentUser = this.authService.getCurrentUser();
    const role = currentUser?.role?.toLowerCase() ?? '';
    this.role.set(role);

    const posts$ = role === 'admin'
      ? this.postService.getAllPost(1, 100)
      : this.postService.getPostByUserId(id, 1, 10);

    this.loader.show('skeleton', 'md', this.itemsPerPage());

    posts$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.allBlogs.set(res.data || []);
          this.loader.hide();
        },
        error: (err) => {
          console.error(err?.error?.message);
          this.loader.hide();
        },
      });
  }

  // ── Toggle today filter & reset to page 1 ──
  toggleTodayFilter(): void {
    this.showTodayOnly.update(val => !val);
    this.currentPage.set(1);
  }

  debounceSearch(value: string): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceValue.set(value);
      this.currentPage.set(1);
    }, 400);
  }

  previousPage(): void {
    if (this.currentPage() > 1) this.currentPage.set(this.currentPage() - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.set(this.currentPage() + 1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) this.currentPage.set(page);
  }

  onPostCreated(): void {
    this.loadPosts();
    this.currentPage.set(1);
  }

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
      error: (err) => {
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
    this.allBlogs.update(blogs =>
      blogs.map(b => b._id === updatedPost._id ? updatedPost : b)
    );
    this.closeModal();
  }
}