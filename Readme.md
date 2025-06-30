# 💬 QuickChat

**QuickChat** is a full-stack real-time chat application that allows users to register, authenticate, update their profiles, and engage in instant messaging — including text and image sharing. It features live communication via WebSockets, user presence indicators, unseen message tracking, and a sleek, responsive UI.

---

## 🚀 Tech Stack

### 🖥️ Frontend
- **React** (with Vite)
- **Tailwind CSS**
- **Axios**
- **Socket.io-client**

### 🔧 Backend
- **Node.js**
- **Express**
- **Socket.io**
- **JWT** for authentication
- **Bcrypt.js** for password hashing
- **Cloudinary** for image storage
- **Mongoose** (MongoDB ORM)

### 🗄️ Database
- **MongoDB**

---

## ✨ Features

- 🔐 **User Authentication** (JWT-based login/signup)
- 👤 **Profile Management** (edit name, bio, and avatar)
- 💬 **Real-time Messaging** (text and image support)
- 🟢 **Online/Offline User Presence**
- 🔔 **Unseen Message Count Indicator**
- 📱 **Responsive Design** (mobile-friendly UI)

## 🧪 API Endpoints

### 🔑 Auth/User Routes (`/api/auth`)
| Method | Endpoint          | Description                    |
|--------|-------------------|--------------------------------|
| POST   | `/signup`         | Register a new user            |
| POST   | `/login`          | Log in with email and password |
| PUT    | `/update-profile` | Update user profile            |
| GET    | `/check`          | Check authentication status    |

### 💬 Message Routes (`/api/messages`)
| Method | Endpoint         | Description                               |
|--------|------------------|-------------------------------------------|
| GET    | `/users`         | Get all users except current user         |
| GET    | `/:id`           | Get all messages with selected user       |
| PUT    | `/mark/:id`      | Mark a message as seen by message ID      |
| POST   | `/send/:id`      | Send a message (text/image) to user by ID |

## 👨‍💻 My Contributions

- Built a Real Time Messaging app with clean REST API  
- Implemented secure authentication and connect with WebSocket
- Designed responsive UI with React + Tailwind CSS  