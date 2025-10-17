import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Post {
  title: string;
  content: string;
  imageUrl?: string;
  date: Date;
  likes: number;
  comments: number;
}

interface User {
  name: string;
  handle: string;
  profileImage?: string;
  about?: string;
  followersCount: number;
  followingCount: number;
  posts: Post[];
}

interface Friend {
  name: string;
  handle: string;
  imageUrl?: string;
}

interface TrendingTopic {
  tag: string;
  count: number;
}

@Component({
    selector: 'app-profile',
    imports: [CommonModule, RouterLink],
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  currentUser: User;
  suggestedFriends: Friend[] = [];
  trendingTopics: TrendingTopic[] = [];

  constructor() {
    // Current user data
    this.currentUser = {
      name: 'John Doe',
      handle: 'johndoe',
      profileImage: 'https://via.placeholder.com/120',
      about: 'Frontend Developer, Angular enthusiast, loves coding and blogging.',
      followersCount: 1250,
      followingCount: 300,
      posts: [
        {
          title: 'My First Blog',
          content: 'This is the content of my first blog post about Angular...',
          imageUrl: 'https://via.placeholder.com/600x300',
          date: new Date('2025-10-01'),
          likes: 25,
          comments: 5
        },
        {
          title: 'Village Trip',
          content: 'Visited my native village and it was an amazing experience...',
          imageUrl: 'https://via.placeholder.com/600x300',
          date: new Date('2025-10-10'),
          likes: 40,
          comments: 8
        }
      ]
    };

    // Suggested friends
    this.suggestedFriends = [
      { name: 'Alice', handle: 'alice123', imageUrl: 'https://via.placeholder.com/40' },
      { name: 'Bob', handle: 'bob_dev', imageUrl: 'https://via.placeholder.com/40' },
      { name: 'Charlie', handle: 'charlie_dev', imageUrl: 'https://via.placeholder.com/40' }
    ];

    // Trending topics
    this.trendingTopics = [
      { tag: 'Angular', count: 120 },
      { tag: 'JavaScript', count: 85 },
      { tag: 'WebDevelopment', count: 60 }
    ];
  }

  ngOnInit(): void {}

// Edit name
editName() {
  const newName = prompt('Enter new name:', this.currentUser.name);
  if (newName !== null && newName.trim() !== '') {
    this.currentUser.name = newName.trim();
  }
}

// Upload new profile photo
changeProfilePhoto() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.onchange = (event: any) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.currentUser.profileImage = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };
  fileInput.click();
}

// Edit about
editAbout() {
  const newAbout = prompt('Update your bio:', this.currentUser.about);
  if (newAbout !== null && newAbout.trim() !== '') {
    this.currentUser.about = newAbout.trim();
  }
}


}
