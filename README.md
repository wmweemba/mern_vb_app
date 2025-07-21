# Village Banking App

A modern, full-stack MERN (MongoDB, Express, React, Node.js) application for managing village banking operations. The app supports member management, loans, savings, fines, reports, and more, with a beautiful, mobile-first UI and robust backend.

## Features
- **Role-based dashboard** for admins, treasurers, loan officers, and members
- **Loans & savings management** with forms, history, and role restrictions
- **Bank balance tracking** and real-time updates
- **Fines/penalties system** with payment and admin controls
- **Reports**: in-app viewing, PDF/Excel export, and downloadable reports
- **Responsive, mobile-first UI** with modern card layouts
- **Authentication** with JWT and secure password management
- **PWA support**: installable, offline-ready, with custom splash, shortcuts, and install banner

## Tech Stack
- **Frontend**: React, Vite, Tailwind CSS, React Router, Axios
- **Backend**: Node.js, Express, MongoDB (Mongoose)
- **PWA**: Vite PWA plugin, service worker, manifest

## Deployment
- **Frontend**: [Netlify](https://www.netlify.com/) (static hosting, HTTPS, CI/CD)
- **Backend**: [Render](https://render.com/) (Node.js server, HTTPS, environment variables)
- **Full Deployment**: [Netlify] (https://villagebanking.netlify.app/) (Deployed App)

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- pnpm or npm
- MongoDB Atlas or local MongoDB instance

### Environment Variables
#### Backend (`mern_vb_backend/.env`):
```
MONGODB_URI=your_mongodb_connection_string
PORT=5000
JWT_SECRET=your_jwt_secret
```
#### Frontend (`mern-vb-frontend/.env`):
```
VITE_API_URL=https://your-backend-on-render.com/api
```

### Local Development
1. **Clone the repo:**
   ```sh
   git clone https://github.com/yourusername/mern_village_banking_app.git
   cd mern_village_banking_app
   ```
2. **Install dependencies:**
   ```sh
   cd mern_vb_backend && pnpm install
   cd ../mern-vb-frontend && pnpm install
   ```
3. **Start backend:**
   ```sh
   cd ../mern_vb_backend
   pnpm run dev
   ```
4. **Start frontend:**
   ```sh
   cd ../mern-vb-frontend
   pnpm run dev
   ```
5. **Access the app:**
   - Frontend: [http://localhost:5173](http://localhost:5173)
   - Backend: [http://localhost:5000](http://localhost:5000)

### Production Build
- **Frontend:**
  ```sh
  pnpm run build
  pnpm run preview
  ```
- **Backend:**
  ```sh
  NODE_ENV=production pnpm start
  ```

## PWA Features
- Installable on mobile and desktop (Add to Homescreen)
- Offline support for static assets and cached data
- Custom splash screen and theme color
- App shortcuts for quick actions
- Install banner/snackbar for easy installation

## Deployment Notes
- **Frontend:** Deploy the `mern-vb-frontend/dist` folder to Netlify. Set `VITE_API_URL` to your Render backend URL in Netlify environment variables.
- **Backend:** Deploy the `mern_vb_backend` folder to Render. Set all secrets (MongoDB URI, JWT secret) in Render’s environment settings.
- **CORS:** Ensure backend CORS allows your Netlify domain.
- **Routing:** Add a `_redirects` file to the frontend `public/` folder for React Router support:
  ```
  /*    /index.html   200
  ```

## License
MIT

---

*This project is built for modern, secure, and scalable village banking management. Contributions and feedback are welcome!*
