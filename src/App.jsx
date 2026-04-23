import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { OrderProvider, useOrders } from './context/OrderContext';
import { TaskProvider } from './context/TaskContext';
import { NotificationProvider } from './context/NotificationContext';
import { CourierRatioProvider } from './context/CourierRatioContext';
import { BrandingProvider } from './context/BrandingContext';
import { DashboardLayout } from './components/DashboardLayout';
import { AccessRestricted } from './components/AccessRestricted';
import { ChatBot } from './components/ChatBot';
import { CommandPalette } from './components/CommandPalette';
import { getRoleRoute } from './utils/authRoutes';

// Lazy loading components
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const DashboardOverview = lazy(() => import('./pages/DashboardOverview').then(m => ({ default: m.DashboardOverview })));
const OrdersBoard = lazy(() => import('./pages/OrdersBoard').then(m => ({ default: m.OrdersBoard })));
const ModeratorPanel = lazy(() => import('./pages/ModeratorPanel').then(m => ({ default: m.ModeratorPanel })));
const CallTeamPanel = lazy(() => import('./pages/CallTeamPanel').then(m => ({ default: m.CallTeamPanel })));
const CourierPanel = lazy(() => import('./pages/CourierPanel').then(m => ({ default: m.CourierPanel })));
const FactoryPanel = lazy(() => import('./pages/FactoryPanel').then(m => ({ default: m.FactoryPanel })));
const ReportsPanel = lazy(() => import('./pages/ReportsPanel').then(m => ({ default: m.ReportsPanel })));
const UserManagement = lazy(() => import('./pages/UserManagement').then(m => ({ default: m.UserManagement })));
const InventoryPage = lazy(() => import('./pages/InventoryPage').then(m => ({ default: m.InventoryPage })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const TaskBoard = lazy(() => import('./pages/TaskBoard').then(m => ({ default: m.TaskBoard })));
const DigitalMarketerPanel = lazy(() => import('./pages/DigitalMarketerPanel').then(m => ({ default: m.DigitalMarketerPanel })));
const SteadfastPanel = lazy(() => import('./pages/SteadfastPanel').then(m => ({ default: m.SteadfastPanel })));
const FraudControl = lazy(() => import('./pages/FraudControl').then(m => ({ default: m.FraudControl })));

// ── Premium Skeleton Loading Screen ──
const SkeletonScreen = () => (
  <div style={{
    display: 'flex', minHeight: '100vh', background: '#f8fafc',
    fontFamily: 'Inter, system-ui, sans-serif'
  }}>
    {/* Sidebar skeleton */}
    <div style={{
      width: 240, flexShrink: 0,
      background: '#fff', borderRight: '1px solid #e2e8f0',
      padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 8
    }}>
      <div style={{ height: 40, borderRadius: 12, background: '#e2e8f0', marginBottom: 24, animation: 'sk-pulse 1.5s ease-in-out infinite' }} />
      {[80, 65, 75, 70, 65, 70, 60, 55].map((w, i) => (
        <div key={i} style={{
          height: 36, borderRadius: 10, background: '#f1f5f9',
          width: `${w}%`,
          animation: `sk-pulse 1.5s ease-in-out ${i * 0.1}s infinite`
        }} />
      ))}
    </div>
    {/* Main content skeleton */}
    <div style={{ flex: 1, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ height: 48, width: '100%', borderRadius: 12, background: '#e2e8f0', animation: 'sk-pulse 1.5s ease-in-out infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ height: 100, borderRadius: 16, background: '#e2e8f0', animation: `sk-pulse 1.5s ease-in-out ${i*0.15}s infinite` }} />
        ))}
      </div>
      <div style={{ height: 280, borderRadius: 16, background: '#e2e8f0', animation: 'sk-pulse 1.5s ease-in-out 0.3s infinite' }} />
      <div style={{ height: 160, borderRadius: 16, background: '#f1f5f9', animation: 'sk-pulse 1.5s ease-in-out 0.5s infinite' }} />
    </div>
    <style>{`
      @keyframes sk-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    `}</style>
  </div>
);


const ProtectedRoute = ({ children }) => {
  const { user, loading: authLoading, isAuthReady, isUnauthorized } = useAuth();
  const { isInitialized } = useOrders();

  if (!isAuthReady || authLoading || (user && !isInitialized)) {
    return <SkeletonScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isUnauthorized) {
    return <AccessRestricted />;
  }
  
  return children;
};

const PublicOnlyRoute = ({ children }) => {
  const { user, userRoles, loading: authLoading, isAuthReady } = useAuth();

  if (!isAuthReady || authLoading) {
    return <SkeletonScreen />;
  }

  if (user) {
    return <Navigate to={getRoleRoute(userRoles)} replace />;
  }

  return children;
};

const RoleRoute = ({ children, roles }) => {
  const { userRoles, loading, isAuthReady } = useAuth();

  if (!isAuthReady || loading) {
    return <SkeletonScreen />;
  }

  const hasAccess = roles.some(role => userRoles.includes(role));

  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <BrandingProvider>
            <NotificationProvider>
              <OrderProvider>
                <CourierRatioProvider>
                  <TaskProvider>
                  <Suspense fallback={<SkeletonScreen />}>
                  <Routes>
                    <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
                    <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                      <Route index element={<DashboardOverview />} />
                      <Route path="orders" element={<OrdersBoard />} />
                      <Route path="moderator" element={<RoleRoute roles={['Admin', 'Moderator']}><ModeratorPanel /></RoleRoute>} />
                      <Route path="call-team" element={<RoleRoute roles={['Admin', 'Call Team']}><CallTeamPanel /></RoleRoute>} />
                      <Route path="courier" element={<RoleRoute roles={['Admin', 'Courier Team']}><CourierPanel /></RoleRoute>} />
                      <Route path="factory" element={<RoleRoute roles={['Admin', 'Factory Team']}><FactoryPanel /></RoleRoute>} />
                      <Route path="users" element={<RoleRoute roles={['Admin']}><UserManagement /></RoleRoute>} />
                      <Route path="fraud" element={<RoleRoute roles={['Admin']}><FraudControl /></RoleRoute>} />
                      <Route path="inventory" element={<RoleRoute roles={['Admin', 'Moderator']}><InventoryPage /></RoleRoute>} />
                      <Route path="reports" element={<RoleRoute roles={['Admin']}><ReportsPanel /></RoleRoute>} />
                      <Route path="profile" element={<Profile />} />
                      <Route path="settings" element={<Settings />} />
                      <Route path="tasks" element={<TaskBoard />} />
                      <Route path="digital-marketer" element={<RoleRoute roles={['Admin', 'Digital Marketer']}><DigitalMarketerPanel /></RoleRoute>} />
                      <Route path="steadfast" element={<RoleRoute roles={['Admin', 'Courier Team', 'Moderator']}><SteadfastPanel /></RoleRoute>} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                  </Routes>
                </Suspense>
                <ChatBot />
                <CommandPalette />
                  </TaskProvider>
                </CourierRatioProvider>
              </OrderProvider>
            </NotificationProvider>
          </BrandingProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
