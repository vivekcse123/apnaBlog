import { Component, inject, input, OnDestroy, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil, tap } from 'rxjs';
import { PostService } from '../../features/post/services/post-service';
import { Post } from '../../core/models/post.model';

@Component({
  selector: 'app-view-post',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule ],
  templateUrl: './view-post.html',
  styleUrl: './view-post.css'
})
export class ViewPost implements OnInit, OnDestroy {
  private fb          = inject(FormBuilder);
  private postService = inject(PostService);
  private destroy$    = new Subject<void>();

  postId      = input<string>('');
  message     = input<string>('');
  close       = output<void>();
  postUpdated = output<Post>();

  post           = signal<Post | null>(null);
  isEditing      = signal(false);
  successMessage = signal('');
  errorMessage   = signal('');
  editForm!: FormGroup;

  categoryOptions = [
    'Technology', 'Lifestyle', 'Education',
    'Health', 'Business', 'Entertainment', 'Social', 'Village'
  ];

  tagOptions = [
    'Trending', 'Motivation', 'Tips',
    'News', 'Opinion', 'Guide', 'Update'
  ];

  ngOnInit(): void {
    this.loadPost();
  }

  loadPost(): void {
    this.postService.getPostById(this.postId())
      .pipe(
        takeUntil(this.destroy$),
        tap(res => console.log(res.data.user))
      )
      .subscribe({
        next: (res) => this.post.set(res.data),
        error: (err) => console.error(err)
      });
  }

  startEdit(): void {
    const p = this.post();
    this.successMessage.set('');
    this.errorMessage.set('');

    this.editForm = this.fb.group({
      title:         [p?.title         || '', [Validators.required, Validators.minLength(5), Validators.maxLength(100)]],
      description:   [p?.description   || '', [Validators.required, Validators.minLength(10)]],
      content:       [p?.content       || '', [Validators.required, Validators.minLength(20)]],
      categories:    [p?.categories    || []],
      tags:          [p?.tags          || []],
      featuredImage: [p?.featuredImage || ''],
      status:        [p?.status        || 'draft', Validators.required],
    });

    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.successMessage.set('');
    this.errorMessage.set('');
    this.editForm.reset();
  }

  savePost(): void {
    if (this.editForm.invalid) return;

    this.successMessage.set('');
    this.errorMessage.set('');

    this.postService.updatePost(this.post()?._id ?? '', this.editForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const updated = res.data ?? { ...this.post(), ...this.editForm.value };
          this.post.set(updated);
          this.isEditing.set(false);
          this.successMessage.set('Post updated successfully!');

          setTimeout(() => {
            this.successMessage.set('');
            this.postUpdated.emit(updated);
            this.closeModal();
          }, 1500);
        },
        error: (err) => {
          this.errorMessage.set(err?.error?.message ?? 'Something went wrong. Please try again.');
        }
      });
  }

  toggleCategory(category: string): void {
    const current: string[] = this.editForm.get('categories')?.value ?? [];
    const updated = current.includes(category)
      ? current.filter(c => c !== category)
      : [...current, category];
    this.editForm.patchValue({ categories: updated });
  }

  toggleTag(tag: string): void {
    const current: string[] = this.editForm.get('tags')?.value ?? [];
    const updated = current.includes(tag)
      ? current.filter(t => t !== tag)
      : [...current, tag];
    this.editForm.patchValue({ tags: updated });
  }

  isCategorySelected(category: string): boolean {
    return (this.editForm.get('categories')?.value ?? []).includes(category);
  }

  isTagSelected(tag: string): boolean {
    return (this.editForm.get('tags')?.value ?? []).includes(tag);
  }

  formatDate(date: string | undefined): string {
    if (!date) return '';
    return new Date(date).toISOString().split('T')[0];
  }

  closeModal(): void {
    this.close.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}