import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterModule } from '@angular/router';
import { User } from '../modals/user.model';
import { FormsModule } from '@angular/forms';
import { FilterBlogPipe } from "../filter-blog-pipe";
import { Post } from '../modals/post.model';

@Component({
  selector: 'app-blog-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, FilterBlogPipe, RouterModule],
  templateUrl: './blog-list.component.html',
  styleUrls: ['./blog-list.component.css']
})
export class BlogListComponent implements OnInit {

  currentUser: User = {
    name: 'John Doe',
    handle: 'johndoe',
    joinedDate: new Date('2020-01-15'),
    profileImage: 'https://via.placeholder.com/120',
    followersCount: 1250,
    followingCount: 300,
    posts: [
      {
        id: 1,
        title: 'Village Festival Celebration',
        content: 'A brief summary about our annual village festival...',
        imageUrl: 'assets/images/festival.jpg',
        likes: 12,
        commentsCount: 4,
        comments: [
          { user: { name: 'Alice', id: 2 }, text: 'Great post!', date: new Date('2022-12-13') },
          { user: { name: 'Bob', id: 3 }, text: 'Loved it!', date: new Date('2022-12-14') },
          { user: { name: 'Charlie', id: 4 }, text: 'Amazing festival!', date: new Date('2022-12-15') },
          { user: { name: 'David', id: 5 }, text: 'Thanks for sharing.', date: new Date('2022-12-16') }
        ],
        date: new Date('2022-12-12'),
        author: { name: 'John Doe', id: 1 }
      },
      {
        id: 2,
        title: 'Local Farmers Market',
        content: 'Highlights from our weekly farmers market...',
        imageUrl: 'assets/images/market.jpg',
        likes: 8,
        commentsCount: 2,
        comments: [
          { user: { name: 'Alice', id: 2 }, text: 'Nice!', date: new Date('2022-12-13') },
          { user: { name: 'Bob', id: 3 }, text: 'Very helpful info.', date: new Date('2022-12-14') }
        ],
        date: new Date('2022-12-12'),
        author: { name: 'John Doe', id: 1 }
      },
      {
        id: 3,
        title: 'Community Clean-up Drive',
        content: 'How our community came together to clean the village...',
        imageUrl: 'assets/images/cleanup.jpg',
        likes: 15,
        commentsCount: 6,
        comments: [
          { user: { name: 'Eve', id: 6 }, text: 'Awesome initiative!', date: new Date('2022-12-13') },
          { user: { name: 'Frank', id: 7 }, text: 'Proud to be part of it.', date: new Date('2022-12-14') },
          { user: { name: 'Grace', id: 8 }, text: 'Well done!', date: new Date('2022-12-15') },
          { user: { name: 'Hannah', id: 9 }, text: 'Great teamwork.', date: new Date('2022-12-16') },
          { user: { name: 'Ivy', id: 10 }, text: 'Keep it up!', date: new Date('2022-12-17') },
          { user: { name: 'Jack', id: 11 }, text: 'Amazing effort!', date: new Date('2022-12-18') }
        ],
        date: new Date('2022-12-12'),
        author: { name: 'John Doe', id: 1 }
      },
      {
        id: 4,
        title: 'Village Storytelling Night',
        content: 'Stories shared by elders at the community center...',
        imageUrl: 'assets/images/storytelling.jpg',
        likes: 5,
        commentsCount: 1,
        comments: [
          { user: { name: 'Kate', id: 12 }, text: 'Lovely stories!', date: new Date('2022-12-13') }
        ],
        date: new Date('2022-12-12'),
        author: { name: 'John Doe', id: 1 }
      },
      {
        id: 5,
        title: 'Local Handicrafts Exhibition',
        content: 'Showcasing local artisans and their crafts...',
        imageUrl: 'assets/images/handicrafts.jpg',
        likes: 7,
        commentsCount: 3,
        comments: [
          { user: { name: 'Leo', id: 13 }, text: 'Beautiful crafts!', date: new Date('2022-12-13') },
          { user: { name: 'Mia', id: 14 }, text: 'Loved the display.', date: new Date('2022-12-14') },
          { user: { name: 'Nina', id: 15 }, text: 'Great event!', date: new Date('2022-12-15') }
        ],
        date: new Date('2022-12-12'),
        author: { name: 'John Doe', id: 1 }
      }
    ]
  };

  constructor(private router: Router) {}

  ngOnInit(): void {}

  viewBlog(id: number) {
    this.router.navigate(['/user-dashboard/blog-details', id]);
  }

  searchText: string = "";
  filterOption: string = "";

  getHighestLikes(): number {
    if (!this.currentUser.posts || this.currentUser.posts.length === 0) return 0;
    return Math.max(...this.currentUser.posts.map(post => post.likes || 0));
  }

  getTotalLikes(): number {
    return this.currentUser.posts.reduce((sum, post) => sum + (post.likes || 0), 0);
  }

  getTotalComments(): number {
    return this.currentUser.posts.reduce((sum, post) => sum + (post.commentsCount || 0), 0);
  }

}
