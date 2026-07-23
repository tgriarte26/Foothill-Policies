require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Paths
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// --- Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 4 // 4 hours
  }
}));

// --- User store ---
function loadUsers() {
  const usersPath = path.join(__dirname, 'data', 'users.json');
  const raw = fs.readFileSync(usersPath, 'utf-8');
  return JSON.parse(raw);
}

// --- Auth helper ---
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

// ============================
// PUBLIC ROUTES (no auth needed)
// ============================

// Landing page (serves landing.html as the login page)
app.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(FRONTEND_DIR, 'landing.html'));
});

// Public static assets for the landing page
app.use('/landing-styles.css', express.static(path.join(FRONTEND_DIR, 'landing-styles.css')));
app.use('/chatbot.js', express.static(path.join(FRONTEND_DIR, 'chatbot.js')));
app.use('/assets', express.static(path.join(FRONTEND_DIR, 'assets')));

// --- Login handler ---
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Please enter both username and password.' });
  }

  try {
    const users = loadUsers();
    const user = users.find(
      u => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    req.session.user = {
      username: user.username,
      displayName: user.displayName
    };

    return res.json({ success: true });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'A server error occurred. Please try again.' });
  }
});

// --- Logout ---
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ============================
// PROTECTED ROUTES (auth required)
// ============================

// Current user API
app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.session.user);
});

// Everything below requires authentication
app.use(requireAuth);

// Serve the dashboard and its static assets (app.js, styles.css, policies-data.js)
app.use(express.static(FRONTEND_DIR, { index: 'index.html' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`FHDA Policy Tracker running on http://localhost:${PORT}`);
  console.log('Landing page: http://localhost:' + PORT + '/login');
});
