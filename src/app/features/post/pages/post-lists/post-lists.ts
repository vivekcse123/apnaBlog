import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BlogFilterPipe } from '../../../../shared/pipes/blog-filter-pipe';
import { Post } from '../../../../core/models/post.model';
import { CreatePost } from '../create-post/create-post';
import { PostService } from '../../services/post-service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ViewPost } from '../../../../shared/view-post/view-post';
import { MessageModal } from '../../../../shared/message-modal/message-modal';

@Component({
  selector: 'app-post-lists',
  standalone: true,
  imports: [CommonModule, FormsModule, BlogFilterPipe, CreatePost, ViewPost, MessageModal],
  templateUrl: './post-lists.html',
  styleUrl: './post-lists.css',
})
export class PostLists implements OnInit {
  private router      = inject(Router);
  private route       = inject(ActivatedRoute);
  private postService = inject(PostService);
  private destroyRef  = inject(DestroyRef);

  allBlogs       = signal<Post[]>([]);
  userId         = signal<string>('');
  showCreateBlog = signal(false);
  totalBlogs = signal<number>(0);

  searchTitle      : string = '';
  debounceValue    = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus   = signal<string>('');
  private debounceTimer: any;

  debounceSearch(value: string): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceValue.set(value);
      this.currentPage.set(1);
      this.loadPosts(1);        
    }, 400);
  }

  currentPage  = signal<number>(1);
  itemsPerPage = signal<number>(5);
  totalPages   = signal<number>(1); 
  pages = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  previousPage(): void {
    if (this.currentPage() > 1) this.loadPosts(this.currentPage() - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.loadPosts(this.currentPage() + 1);
  }

  goToPage(page: number): void {
    this.loadPosts(page);
  }

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((res) => {
        this.userId.set(res['id']);
        this.loadPosts();
      });
  }

  loadPosts(page: number = this.currentPage()): void {
    this.postService
      .getAllPost(page, this.itemsPerPage())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.allBlogs.set(res.data);
          this.totalBlogs.set(res?.total);
          this.currentPage.set(Number(res.page));
          this.totalPages.set(Number(res.totalPages)); 
        },
        error: (err) => console.error(err?.error?.message),
      });
  }

  onPostCreated(): void {
    this.loadPosts(1); 
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

    this.postService.deletePost(id).subscribe({
      next: () => {
        this.pendingDeleteId.set('');
        this.pendingDeleteTitle.set('');
        this.modalType.set('success');
        this.modalTitle.set('Post Deleted');
        this.modalMessage.set('The post has been deleted successfully.');
        this.showMessage.set(true);
        this.loadPosts(this.currentPage()); 
      },
      error: (err) => {
        this.pendingDeleteId.set('');
        this.pendingDeleteTitle.set('');
        this.modalType.set('error');
        this.modalTitle.set('Delete Failed');
        this.modalMessage.set(err?.error?.message ?? 'Failed to delete post. Please try again.');
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
    this.allBlogs.update((blogs) =>
      blogs.map((b) => (b._id === updatedPost._id ? updatedPost : b))
    );
    this.closeModal();
  }
}