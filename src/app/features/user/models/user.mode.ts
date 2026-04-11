export interface User {
  _id:          string;
  name:         string;
  email:        string;
  password:     string;
  dob:          Date;
  location:     string;   
  role:         string;
  status:       string;
  totalBlogs:   number;
  totalViews:   number;
  createdAt:    Date;
  updatedAt:    Date;
  lastLoggedInAt: Date;
  deletionScheduledAt: any
  avatar: string
}