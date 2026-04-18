const fs = require('fs');

const sidebarCssPath = 'src/components/Sidebar.css';
const sidebarJsxPath = 'src/components/Sidebar.jsx';

const newSidebarCss = `/* ================================================================
   ELITE SIDEBAR — Taskplus / Eirokom Masterpiece
   Pure flat matte dark, ultra minimal borders, premium typography
   ================================================================ */

:root {
  --sb-bg: #fdfdfd;
  --sb-bg-hover: #f1f5f9;
  --sb-bg-active: #e2e8f0;
  --sb-text-pri: #0f172a;
  --sb-text-sec: #475569;
  --sb-text-mute: #94a3b8;
  --sb-border: rgba(0,0,0,0.06);
  --sb-accent: #ffffff;
  --sb-accent-text: #000000;
  --sb-card-bg: #f8fafc;
  --sb-card-border: rgba(0,0,0,0.08);
}

[data-theme='dark'] {
  --sb-bg: #131313;
  --sb-bg-hover: #1c1c1e;
  --sb-bg-active: #232325;
  --sb-text-pri: #f8fafc;
  --sb-text-sec: #a1a1aa;
  --sb-text-mute: #52525b;
  --sb-border: rgba(255,255,255,0.05);
  --sb-accent: #2c2c2e;
  --sb-accent-text: #ffffff;
  --sb-card-bg: #18181b;
  --sb-card-border: rgba(255,255,255,0.08);
}

/* Base Sidebar */
.sidebar {
  position: fixed;
  top: 0; left: 0; bottom: 0;
  width: 280px;
  max-width: 85vw;
  height: 100vh;
  height: 100dvh;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  background: var(--sb-bg);
  border-right: 1px solid var(--sb-border);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease;
  transform: translateX(-100%);
  font-family: 'Inter', system-ui, sans-serif;
}

.sidebar.open {
  transform: translateX(0);
}

@media (min-width: 768px) {
  .sidebar {
    position: sticky;
    top: 0;
    transform: translateX(0);
    z-index: auto;
    border-radius: 0;
    box-shadow: none;
    height: 100vh;
  }
}

/* Header */
.sidebar-header {
  padding: 32px 24px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.sidebar-logo-container {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
}

.logo-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--sb-text-pri);
  color: var(--sb-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1rem;
}

.logo-text {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--sb-text-pri);
  letter-spacing: -0.02em;
}

.logo-chevron {
  display: none;
}

/* Actions */
.sidebar-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-toggle {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--sb-text-sec);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-toggle:hover {
  background: var(--sb-bg-hover);
  color: var(--sb-text-pri);
}

.theme-toggle-thumb, .theme-toggle-icon:nth-child(2) {
  display: none; /* Hide complex multi icons for the minimal icon */
}

.sidebar-close {
  width: 38px;
  height: 38px;
  border: none;
  background: transparent;
  color: var(--sb-text-sec);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
@media (min-width: 768px) {
  .sidebar-close { display: none; }
}

/* Nav */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  scrollbar-width: none;
}
.sidebar-nav::-webkit-scrollbar { display: none; }

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-section-label {
  margin: 0 0 8px 12px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--sb-text-mute);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.8;
}

.nav-item {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 14px;
  text-decoration: none;
  background: transparent;
  color: var(--sb-text-sec);
  font-size: 0.9rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-item:hover:not(.active) {
  background: var(--sb-bg-hover);
  color: var(--sb-text-pri);
}

.nav-item.active {
  background: var(--sb-bg-active);
  color: var(--sb-text-pri);
  font-weight: 600;
}

.nav-icon {
  width: 18px;
  height: 18px;
  opacity: 0.8;
  flex-shrink: 0;
}

.nav-label {
  flex: 1;
  text-align: left;
}

.nav-active-dot {
  display: none;
}

/* Footer & Profile */
.sidebar-footer {
  padding: 20px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Taskplus Pro Upgrade Card */
.pro-upgrade-card {
  background: var(--sb-card-bg);
  border: 1px solid var(--sb-card-border);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
  text-decoration: none;
  position: relative;
  overflow: hidden;
}

.pro-upgrade-icon {
  width: 34px;
  height: 34px;
  background: var(--sb-card-border);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sb-text-pri);
}

.pro-upgrade-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pro-upgrade-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--sb-text-pri);
}

.pro-upgrade-desc {
  font-size: 0.75rem;
  color: var(--sb-text-sec);
  line-height: 1.4;
}

.pro-upgrade-btn {
  background: var(--sb-bg-hover);
  color: var(--sb-text-pri);
  font-size: 0.8rem;
  font-weight: 600;
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid var(--sb-card-border);
  cursor: pointer;
  width: 100%;
  text-align: center;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.pro-upgrade-btn:hover {
  background: var(--sb-bg-active);
  color: var(--sb-text-pri);
  border-color: var(--sb-border);
}

.sidebar-profile-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 12px;
  text-decoration: none;
  background: transparent;
  transition: background 0.2s ease;
}

.sidebar-profile-card:hover {
  background: var(--sb-bg-hover);
}

.sidebar-profile-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--sb-bg-active);
  color: var(--sb-text-pri);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 700;
  overflow: hidden;
}

.sidebar-profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sidebar-profile-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.sidebar-profile-meta strong {
  font-size: 0.85rem;
  color: var(--sb-text-pri);
  font-weight: 600;
}

.sidebar-profile-role-text {
  font-size: 0.7rem;
  color: var(--sb-text-mute);
}

.logout-btn {
  padding: 0 12px;
  height: 40px;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: var(--sb-text-sec);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.2s ease;
  font-size: 0.85rem;
  font-weight: 600;
}

.logout-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.logout-btn .nav-icon {
  width: 16px;
  height: 16px;
}

/* Search bar mimicking the image */
.sidebar-search-box {
  margin: 0 12px 16px;
  background: var(--sb-bg-hover);
  border: 1px solid transparent;
  border-radius: 10px;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  gap: 10px;
  transition: all 0.2s ease;
}

.sidebar-search-box:focus-within {
  border-color: var(--sb-border);
  background: var(--sb-bg);
}

.sidebar-search-box input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--sb-text-pri);
  font-size: 0.85rem;
  width: 100%;
}

.sidebar-search-box input::placeholder {
  color: var(--sb-text-mute);
}

.sidebar-search-box svg {
  color: var(--sb-text-mute);
  width: 16px;
  height: 16px;
}
`;

fs.writeFileSync(sidebarCssPath, newSidebarCss, 'utf8');

let jsxContent = fs.readFileSync(sidebarJsxPath, 'utf8');

const newJsxContent = jsxContent.replace(
  /<button\s+className={`theme-toggle[^>]+>[\s\S]*?<\/button>/,
  `{/* Minimal theme toggle */}\n          <button className="theme-toggle" onClick={toggleTheme} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>\n            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}\n          </button>`
).replace(
  /<div className="sidebar-footer">[\s\S]*?<\/div>/,
  `<div className="sidebar-footer">
        {/* Taskplus Pro Replica */}
        <div className="pro-upgrade-card">
          <div className="pro-upgrade-icon">
            <Package size={18} />
          </div>
          <div className="pro-upgrade-content">
            <span className="pro-upgrade-title">Upgrade to Pro!</span>
            <span className="pro-upgrade-desc">Unlock Premium Features and<br/>Manage Unlimited projects</span>
          </div>
          <div className="pro-upgrade-btn">
            Upgrade Now
          </div>
        </div>

        <Link to="/profile" className="sidebar-profile-card sidebar-profile-card-footer" onClick={onClose}>
          <div className="sidebar-profile-avatar">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} />
            ) : (
              displayName.substring(0, 2).toUpperCase()
            )}
          </div>
          <div className="sidebar-profile-meta">
            <strong>{displayName}</strong>
            <span className="sidebar-profile-role-text">{primaryRole}</span>
          </div>
        </Link>
        <button className="logout-btn" onClick={signOut}>
          <LogOut className="nav-icon" size={16} />
          <span className="nav-label">Sign out</span>
        </button>
      </div>`
).replace(
  /<nav className="sidebar-nav">/,
  `<nav className="sidebar-nav">
        {/* Search bar inside nav for the exact visual replica */}
        <div className="sidebar-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" placeholder="Search..." />
        </div>
`
);

fs.writeFileSync(sidebarJsxPath, newJsxContent, 'utf8');

console.log("Sidebar strictly updated to Taskplus Masterpiece style.");
