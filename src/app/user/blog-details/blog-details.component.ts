import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BlogService } from '../../services/blog.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Post } from '../modals/post.model';


@Component({
    selector: 'app-blog-details',
    imports: [CommonModule, FormsModule],
    templateUrl: './blog-details.component.html',
    styleUrls: ['./blog-details.component.css']
})
export class BlogDetailsComponent implements OnInit {
  post!: Post;
  newComment: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private blogService: BlogService
  ) {}

  ngOnInit(): void {
    const blogId = +this.route.snapshot.paramMap.get('id')!;
    this.loadBlog(blogId);
  }

  loadBlog(id: number) {
    this.blogService.getBlogById(id).subscribe(
      (data: any) => {
        this.post = data;
      },
      error => {
        console.error('Error fetching blog:', error);
      }
    );
  }

  editBlog(id: number) {
    this.router.navigate(['/user-dashboard/edit-blog', id]);
  }

  deleteBlog(id: number) {
    if (confirm('Are you sure you want to delete this blog?')) {
      this.blogService.deleteBlog(id).subscribe(
        () => {
          alert('Blog deleted successfully!');
          this.router.navigate(['/user-dashboard/my-blogs']);
        },
        error => console.error('Error deleting blog:', error)
      );
    }
  }

  goBack() {
    this.router.navigate(['/user-dashboard/my-blogs/1']);
  }

  addComment(blogId: number) {
    if (!this.newComment.trim()) return;

    const comment = {
      user: { name: 'Current User', id: 1 },
      text: this.newComment,
      date: new Date()
    };

    this.post.comments.push(comment);
    this.newComment = '';

    this.blogService.addComment(blogId, comment).subscribe(
      () => console.log('Comment added successfully'),
      error => console.error('Error adding comment:', error)
    );
  }
}
