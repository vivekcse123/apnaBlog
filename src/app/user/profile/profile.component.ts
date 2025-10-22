import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { User } from '../modals/user.model';
import { Friend } from '../modals/friend.model';
import { TrendingTopic } from '../modals/trending-topic.model';
import { Post } from '../modals/post.model'

@Component({
  selector: 'app-profile',
  imports: [CommonModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent {
  currentUser: User;
  suggestedFriends: Friend[] = [];
  trendingTopics: TrendingTopic[] = [];

  constructor(private router: Router) {
    this.currentUser = {
      name: 'John Doe',
      handle: 'johndoe',
      profileImage: 'https://via.placeholder.com/120',
      about: 'Frontend Developer, Angular enthusiast, loves coding and blogging.',
      followersCount: 1250,
      followingCount: 300,
      posts: [
  {
    id: 1,
    title: 'My First Blog',
    content: 'This is the content of my first blog post about Angular...',
    imageUrl: 'https://via.placeholder.com/600x300',
    date: new Date('2025-10-01'),
    likes: 25,
    author: { name: 'John Doe', id: 1 },
    commentsCount: 5,
    comments: [
      { user: { name: 'Alice', id: 2 }, text: 'Great post!', date: new Date('2025-10-02') },
      { user: { name: 'Bob', id: 3 }, text: 'Very informative.', date: new Date('2025-10-03') },
      { user: { name: 'Charlie', id: 4 }, text: 'Thanks for sharing.', date: new Date('2025-10-04') },
      { user: { name: 'David', id: 5 }, text: 'Nice read!', date: new Date('2025-10-05') },
      { user: { name: 'Eva', id: 6 }, text: 'Loved it!', date: new Date('2025-10-06') }
    ]
  },
  {
    id: 2,
    title: 'Village Trip',
    content: 'Visited my native village and it was an amazing experience...',
    imageUrl: 'https://via.placeholder.com/600x300',
    date: new Date('2025-10-10'),
    likes: 40,
    author: { name: 'Jane Smith', id: 2 },
    commentsCount: 8,
    comments: [
      { user: { name: 'Alice', id: 2 }, text: 'Looks fun!', date: new Date('2025-10-11') },
      { user: { name: 'Bob', id: 3 }, text: 'Beautiful pictures.', date: new Date('2025-10-12') },
      { user: { name: 'Charlie', id: 4 }, text: 'Nice experience.', date: new Date('2025-10-13') },
      { user: { name: 'David', id: 5 }, text: 'I want to visit too.', date: new Date('2025-10-14') },
      { user: { name: 'Eva', id: 6 }, text: 'Amazing!', date: new Date('2025-10-15') },
      { user: { name: 'Frank', id: 7 }, text: 'Great story.', date: new Date('2025-10-16') },
      { user: { name: 'Grace', id: 8 }, text: 'Loved reading this.', date: new Date('2025-10-17') },
      { user: { name: 'Hannah', id: 9 }, text: 'Thanks for sharing!', date: new Date('2025-10-18') }
    ]
  }
]

    };

    this.suggestedFriends = [
      { name: 'Alice', handle: 'alice123', imageUrl: 'https://via.placeholder.com/40' },
      { name: 'Bob', handle: 'bob_dev', imageUrl: 'https://via.placeholder.com/40' },
      { name: 'Charlie', handle: 'charlie_dev', imageUrl: 'https://via.placeholder.com/40' }
    ];

    this.trendingTopics = [
      { tag: 'Village Fest', count: 120 },
      { tag: 'Holi', count: 85 },
      { tag: 'Dewali', count: 60 }
    ];
  }
  editProfile() {
    this.router.navigate(['/user-dashboard/edit-profile', 1]);
  }

}
