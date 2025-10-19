import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

// Post Interface
interface Post {
  id: number;
  author: string;
  village: string;
  time: string;
  title: string;
  imageUrl?: string;
  content_en: string;
  content_hi: string;
  likes: number;
  comments: number;
  isLiked: boolean;
}

// Trending Topic Interface
interface TrendingTopic {
  tag: string;
  count: number;
}

// Village Interface
interface Village {
  name: string;
  state: string;
}

@Component({
    selector: 'app-blog-feed',
    imports: [CommonModule],
    templateUrl: './blog-feed.component.html',
    styleUrls: ['./blog-feed.component.css']
})
export class BlogFeedComponent implements OnInit {
  
  posts: Post[] = [];
  trendingTopics: TrendingTopic[] = [];
  suggestedVillages: Village[] = [];

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.loadPosts();
    this.loadTrendingTopics();
    this.loadSuggestedVillages();
  }

  /**
   * Load posts from API or mock data
   */
  loadPosts(): void {
    this.posts = [
      {
        id: 1,
        author: 'Ramesh Kumar',
        village: 'Panchgaon, Haryana',
        time: '2 hours ago',
        title: 'Harvest Festival Celebration in Our Village',
        imageUrl: 'https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=800',
        content_en: 'We celebrated a wonderful harvest festival today with the entire village. The spirit of unity and joy was truly remarkable. Everyone came together to share food, music, and stories.',
        content_hi: 'आज हमने पूरे गांव के साथ एक अद्भुत फसल उत्सव मनाया। एकता और खुशी की भावना वास्तव में उल्लेखनीय थी। सभी लोग भोजन, संगीत और कहानियां साझा करने के लिए एक साथ आए।',
        likes: 45,
        comments: 12,
        isLiked: false
      },
      {
        id: 2,
        author: 'Priya Sharma',
        village: 'Gulmarg Village, Kashmir',
        time: '5 hours ago',
        title: 'Beautiful Morning in the Valley',
        imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        content_en: 'Woke up to the most beautiful sunrise today. The mountains covered in snow look absolutely stunning. Sharing this peaceful moment with everyone.',
        content_hi: 'आज सबसे खूबसूरत सूर्योदय के साथ जागा। बर्फ से ढके पहाड़ बिल्कुल शानदार दिख रहे हैं। इस शांतिपूर्ण क्षण को सभी के साथ साझा कर रहा हूं।',
        likes: 78,
        comments: 23,
        isLiked: false
      },
      {
        id: 3,
        author: 'Suresh Patel',
        village: 'Rajkot Village, Gujarat',
        time: '1 day ago',
        title: 'New Irrigation System Installed',
        content_en: 'Great news! Our village finally got a modern irrigation system installed. This will help us grow better crops and improve our farming efficiency. Thank you to everyone who supported this initiative.',
        content_hi: 'बड़ी खबर! हमारे गांव में आखिरकार एक आधुनिक सिंचाई प्रणाली स्थापित हो गई। इससे हमें बेहतर फसलें उगाने और हमारी खेती की दक्षता में सुधार करने में मदद मिलेगी। इस पहल का समर्थन करने वाले सभी लोगों का धन्यवाद।',
        likes: 102,
        comments: 31,
        isLiked: true
      },
      {
        id: 4,
        author: 'Anjali Devi',
        village: 'Patna Village, Bihar',
        time: '2 days ago',
        title: 'Village School Renovation Complete',
        imageUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800',
        content_en: 'Our village school has been beautifully renovated! New classrooms, library, and playground have been added. Education is the key to progress, and we are proud of this achievement.',
        content_hi: 'हमारे गांव के स्कूल का खूबसूरती से नवीनीकरण किया गया है! नए कक्षा, पुस्तकालय और खेल का मैदान जोड़ा गया है। शिक्षा प्रगति की कुंजी है, और हमें इस उपलब्धि पर गर्व है।',
        likes: 156,
        comments: 45,
        isLiked: false
      }
    ];
  }

  /**
   * Load trending topics
   */
  loadTrendingTopics(): void {
    this.trendingTopics = [
      { tag: 'HarvestSeason', count: 234 },
      { tag: 'VillageFestivals', count: 189 },
      { tag: 'FarmingTips', count: 156 },
      { tag: 'RuralDevelopment', count: 143 },
      { tag: 'LocalCuisine', count: 128 }
    ];
  }

  /**
   * Load suggested villages
   */
  loadSuggestedVillages(): void {
    this.suggestedVillages = [
      { name: 'Khimsar Village', state: 'Rajasthan' },
      { name: 'Mawlynnong', state: 'Meghalaya' },
      { name: 'Hampi Village', state: 'Karnataka' },
      { name: 'Konark Village', state: 'Odisha' }
    ];
  }

  /**
   * Handle like action for a post
   */
  likePost(post: Post): void {
    // Toggle like state
    post.isLiked = !post.isLiked;
  
    // Update like count
    post.likes = post.isLiked ? post.likes + 1 : Math.max(0, post.likes - 1);
  
    // Log for debugging (optional)
    console.log(`${post.isLiked ? 'Liked' : 'Unliked'} post: "${post.title}"`);
  
    // Example API call (uncomment when ready)
    // if (post.isLiked) {
    //   this.postService.likePost(post.id).subscribe();
    // } else {
    //   this.postService.unlikePost(post.id).subscribe();
    // }
  }
  

  /**
   * Handle comment action for a post
   */
  commentPost(post: Post): void {
    console.log(`Opening comments for: "${post.title}"`);
    // Navigate to comment section or open comment modal
    // this.router.navigate(['/post', post.id, 'comments']);
    // Or open a modal:
    // this.modalService.openCommentModal(post);
    alert(`Comment feature coming soon for: ${post.title}`);
  }

  /**
   * Handle share action for a post
   */
  sharePost(post: Post): void {
    console.log(`Sharing post: "${post.title}"`);
    
    // Option 1: Web Share API (if supported)
    if (navigator.share) {
      navigator.share({
        title: post.title,
        text: post.content_en,
        url: `${window.location.origin}/post/${post.id}`
      })
      .then(() => console.log('Shared successfully'))
      .catch((error) => console.log('Error sharing:', error));
    } else {
      // Option 2: Copy to clipboard
      const shareUrl = `${window.location.origin}/post/${post.id}`;
      navigator.clipboard.writeText(shareUrl)
        .then(() => {
          alert('Link copied to clipboard!');
          console.log('Link copied:', shareUrl);
        })
        .catch(err => {
          console.error('Failed to copy:', err);
          alert('Failed to copy link');
        });
    }
  }

  /**
   * Create new post
   */
  createPost(): void {
    console.log('Opening create post dialog');
    this.router.navigate(['/user-dashboard/create-blog/1']);
    alert('Create post feature coming soon!');
    // Navigate to create post page or open modal
    // this.router.navigate(['/create-post']);
  }

 
  loadMorePosts(): void {
    // Implement pagination/infinite scroll
    console.log('Loading more posts...');
    // this.postService.getPosts(this.currentPage++).subscribe(...)
  }
}