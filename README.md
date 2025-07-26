# 🤫 HushHub

A location-based anonymous chat PWA that connects nearby users for real-time conversations, discussions, and mini-games.

## ✨ Features

- 📍 **Location-based discovery** - Find users within 50 meters
- 💬 **Anonymous or named chat** - Toggle between modes
- 🧵 **Local discussions** - Create threads for nearby users
- 🎮 **Mini-games** - Play polls, word games, and trivia
- 📱 **PWA support** - Install as an app on mobile devices
- 🔒 **Privacy-focused** - No registration required, temporary sessions

## 🚀 Quick Start

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/hushhub.git
   cd hushhub
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   Visit `http://localhost:3000`

### Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions on Railway, Render, or Vercel.

## 📱 How to Use

1. **Enter a nickname** - Choose any name (no registration needed)
2. **Enable location** - Required to find nearby users
3. **Start chatting** - See users within 50 meters and message them
4. **Create discussions** - Start threads for group conversations
5. **Play games** - Join or create mini-games with nearby users

## 🛠️ Tech Stack

- **Frontend:** Vanilla JS, PWA, CSS3
- **Backend:** Node.js, Express, Socket.io
- **Real-time:** WebSocket connections
- **Location:** Browser Geolocation API
- **Deployment:** Railway/Render/Vercel ready

## 🎯 Perfect For

- **Classrooms** - Students can chat and collaborate anonymously
- **Events** - Attendees can connect and network
- **Study groups** - Find nearby students for group work
- **Social spaces** - Cafes, libraries, waiting areas
- **Conferences** - Real-time audience interaction

## 🔧 Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment mode (development/production)

### Proximity Settings

Default radius is 50 meters. To change:
- Edit `proximityRadius` in `public/js/geolocation.js`
- Update server-side radius in `server/app.js`

## 🐛 Troubleshooting

### Location Not Working
- Ensure HTTPS is enabled (required for geolocation)
- Check browser location permissions
- Test on mobile devices for better GPS accuracy

### Real-time Features Not Working
- Check WebSocket connection in browser dev tools
- Verify server is running and accessible
- Ensure firewall isn't blocking connections

### No Users Found
- Users must be physically within 50 meters
- Both users need location enabled
- Check that location permissions are granted

## 📄 License

MIT License - feel free to use for educational and non-commercial purposes.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## ⚠️ Important Notes

- **Privacy:** User locations are only used for proximity calculation
- **Temporary:** All data is session-based and not permanently stored
- **Mobile-first:** Best experience on mobile devices with GPS
- **HTTPS required:** Location services need secure connections

---

Built with ❤️ for creating spontaneous connections between nearby people!# hushhub
