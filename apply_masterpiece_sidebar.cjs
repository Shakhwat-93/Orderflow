const fs = require('fs');

const sidebarJsxPath = 'src/components/Sidebar.jsx';
const sidebarCssPath = 'src/components/Sidebar.css';

// 1. UPDATE CSS
const newCss = `/* ================================================================
   ELITE SIDEBAR — SmartShort / Masterpiece Aesthetic
   Glowing left pip, deep gradient active states, minimal typography
   ================================================================ */

:root {
  --sb-bg: #f8fafc;
  --sb-bg-hover: #f1f5f9;
  --sb-bg-active: #ffffff;
  --sb-text-pri: #0f172a;
  --sb-text-sec: #475569;
  --sb-text-mute: #94a3b8;
  --sb-border: rgba(0,0,0,0.06);
  --sb-nav-glow: #22c55e;
  --sb-nav-glow-rgb: 34, 197, 94;
  --sb-nav-active-bg: linear-gradient(90deg, rgba(34,197,94,0.08) 0%, rgba(255,255,255,0) 100%);
  --sb-logo-bg: #0f172a;
  --sb-logo-text: #ffffff;
}

[data-theme='dark'] {
  --sb-bg: #141414;
  --sb-bg-hover: #1a1a1a;
  --sb-bg-active: #1a1a1a;
  --sb-text-pri: #ffffff;
  --sb-text-sec: #a3a3a3;
  --sb-text-mute: #737373;
  --sb-border: rgba(255,255,255,0.04);
  --sb-nav-glow: #b1fc3d; /* Vibrant glowing lime like the image */
  --sb-nav-glow-rgb: 177, 252, 61;
  --sb-nav-active-bg: linear-gradient(90deg, rgba(177, 252, 61, 0.12) 0%, rgba(26, 26, 26, 0) 100%);
  --sb-logo-bg: #ffffff;
  --sb-logo-text: #000000;
}

/* Base Sidebar */
.sidebar {
  position: fixed;
  top: 0; left: 0; bottom: 0;
  width: 270px;
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
  padding: 32px 24px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.sidebar-logo-container {
  display: flex;
  align-items: center;
  gap: 14px;
  text-decoration: none;
}

.logo-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--sb-logo-bg);
  color: var(--sb-logo-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1rem;
  box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}

.logo-text {
  font-size: 1.15rem;
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
  width: 36px;
  height: 36px;
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

.sidebar-close {
  width: 36px;
  height: 36px;
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
  padding: 0 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  scrollbar-width: none;
}
.sidebar-nav::-webkit-scrollbar { display: none; }

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 12px 10px;
}

.nav-section-label {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 650;
  color: var(--sb-text-mute);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.nav-section-action {
  color: var(--sb-text-mute);
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
}
.nav-section-action:hover {
  opacity: 1;
  color: var(--sb-text-pri);
}

.nav-item {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  text-decoration: none;
  background: transparent;
  color: var(--sb-text-sec);
  font-size: 0.92rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.nav-item:hover:not(.active) {
  background: var(--sb-bg-hover);
  color: var(--sb-text-pri);
}

/* THE MASTERPIECE ACTIVE STATE */
.nav-item.active {
  background: var(--sb-nav-active-bg);
  color: var(--sb-text-pri);
  font-weight: 600;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 24px;
  background: var(--sb-nav-glow);
  border-radius: 0 4px 4px 0;
  box-shadow: 0 0 12px var(--sb-nav-glow);
}

.nav-item.active .nav-icon {
  color: var(--sb-text-pri);
  opacity: 1;
}

.nav-icon {
  width: 18px;
  height: 18px;
  opacity: 0.75;
  flex-shrink: 0;
}

.nav-label {
  flex: 1;
  text-align: left;
}

.nav-active-chevron {
  opacity: 0.5;
  color: var(--sb-text-sec);
}

/* Footer & Profile */
.sidebar-footer {
  padding: 20px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--sb-border);
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
  border-radius: 10px;
  background: var(--sb-logo-bg);
  color: var(--sb-logo-text);
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
  height: 48px;
  border-radius: 12px;
  background: transparent;
  border: none;
  color: var(--sb-text-sec);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.2s ease;
  font-size: 0.92rem;
  font-weight: 500;
}

.logout-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

.logout-btn .nav-icon {
  width: 18px;
  height: 18px;
}

/* Search Box removed for purity or integrated natively? 
   We will keep it if it was there but style it matte */
.sidebar-search-box {
  background: transparent;
  border: 1px solid var(--sb-border);
  border-radius: 10px;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  gap: 10px;
  margin-bottom: 8px;
  transition: all 0.2s ease;
}

.sidebar-search-box:focus-within {
  border-color: var(--sb-text-mute);
  background: var(--sb-bg-hover);
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

fs.writeFileSync(sidebarCssPath, newCss, 'utf8');

// 2. UPDATE JSX
let jsxContent = fs.readFileSync(sidebarJsxPath, 'utf8');

// Add specific lucide imports
if (!jsxContent.includes('ChevronRight')) {
  jsxContent = jsxContent.replace('Moon\n} from \'lucide-react\';', 'Moon,\n  ChevronRight,\n  Plus\n} from \'lucide-react\';');
}

// Update the groupedItems mapping to use the masterpiece group headers
jsxContent = jsxContent.replace(
  /\{groupedItems\.map\(\(\{ group, items \}\) => \([\s\S]*?className="nav-group">\s*<p className="nav-section-label">\{group\}<\/p>([\s\S]*?)<\/nav>/,
  `{groupedItems.map(({ group, items }) => (
          <div key={group} className="nav-group">
            <div className="nav-section-header">
              <p className="nav-section-label">{group}</p>
              <Plus className="nav-section-action" size={14} />
            </div>
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={\`nav-item \${isActive ? 'active' : ''}\`}
                  onClick={onClose}
                >
                  <Icon className="nav-icon" size={18} />
                  <span className="nav-label">{item.label}</span>
                  {isActive && <ChevronRight className="nav-active-chevron" size={16} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>`
);

// Note: Ensure the replace regex perfectly hits the nav-group if it was slightly different
// Let's do a more robust replacement for the map body
let robustSearch = /\{groupedItems\.map\(\(\{ group, items \}\) => \([\s\S]*?\{isActive && <span className="nav-active-dot" \/>\}\s*<\/Link>\s*\);\s*\}\)\}\s*<\/div>\s*\)\)\}\s*<\/nav>/;

if (robustSearch.test(jsxContent)) {
  jsxContent = jsxContent.replace(
    robustSearch,
    `{groupedItems.map(({ group, items }) => (
          <div key={group} className="nav-group">
            <div className="nav-section-header">
              <p className="nav-section-label">{group}</p>
              <Plus className="nav-section-action" size={14} />
            </div>
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={\`nav-item \${isActive ? 'active' : ''}\`}
                  onClick={onClose}
                >
                  <Icon className="nav-icon" size={18} />
                  <span className="nav-label">{item.label}</span>
                  {isActive && <ChevronRight className="nav-active-chevron" size={16} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>`
  );
} else {
  // If it fails, fallback to simpler replace
  jsxContent = jsxContent.replace(
    /<p className="nav-section-label">\{group\}<\/p>/g,
    `<div className="nav-section-header">
              <p className="nav-section-label">{group}</p>
              <Plus className="nav-section-action" size={14} />
            </div>`
  );
  jsxContent = jsxContent.replace(
    /\{isActive && <span className="nav-active-dot" \/>\}/g,
    `{isActive && <ChevronRight className="nav-active-chevron" size={16} />}`
  );
}


fs.writeFileSync(sidebarJsxPath, jsxContent, 'utf8');

console.log("Masterpiece sidebar applied!");
