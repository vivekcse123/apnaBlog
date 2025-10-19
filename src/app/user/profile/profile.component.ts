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
          comments: 5
        },
        {
          id: 2,
          title: 'Village Trip',
          content: 'Visited my native village and it was an amazing experience...',
          imageUrl: 'https://via.placeholder.com/600x300',
          date: new Date('2025-10-10'),
          likes: 40,
          comments: 8
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
