export interface User {
    _id: string,
    name: string,
    email: string,
    dob: Date,
    role: string,
    password: string,
    totalBlogs: number,
    totalViews: number,
    createdAt: Date,
    lastLoggedInAt: Date
    status: string,
    location: 'India'
}