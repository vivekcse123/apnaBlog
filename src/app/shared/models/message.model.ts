export interface Message {
  _id:        string;
  sender:     string;
  recipient:  string;
  content:    string;
  isRead:     boolean;
  createdAt:  string;
  updatedAt:  string;
}

export interface ConversationUser {
  _id:    string;
  name:   string;
  avatar: string | null;
}

export interface Conversation {
  otherUser:         ConversationUser;
  lastMessage:       string;
  lastMessageAt:     string;
  lastMessageIsMine: boolean;
  unreadCount:       number;
}

export interface ThreadResponse {
  status:  number;
  message: string;
  data:    Message[];
  pagination: {
    total: number;
    page:  number;
    limit: number;
    pages: number;
  };
}
