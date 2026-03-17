import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OrderProvider } from './context/OrderContext';
import { NotificationProvider } from './context/NotificationContext';
import { DashboardLayout } from './components/DashboardLayout';
import { AccessRestricted } from './components/AccessRestricted';

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


const ProtectedRoute = ({ children }) => {
  const { user, loading, isUnauthorized } = useAuth();
  
  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isUnauthorized) {
    return <AccessRestricted />;
  }
  
  return children;
};

const RoleRoute = ({ children, roles }) => {
  const { userRoles, loading } = useAuth();

  if (loading) return null;

  const hasAccess = roles.some(role => userRoles.includes(role));

  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <OrderProvider>
            <Suspense fallback={<div className="loading-screen">Preparing your experience...</div>}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                  <Route index element={<DashboardOverview />} />
                  <Route path="orders" element={<OrdersBoard />} />
                  <Route path="moderator" element={<RoleRoute roles={['Admin', 'Moderator']}><ModeratorPanel /></RoleRoute>} />
                  <Route path="call-team" element={<RoleRoute roles={['Admin', 'Call Team']}><CallTeamPanel /></RoleRoute>} />
                  <Route path="courier" element={<RoleRoute roles={['Admin', 'Courier Team']}><CourierPanel /></RoleRoute>} />
                  <Route path="factory" element={<RoleRoute roles={['Admin', 'Factory Team']}><FactoryPanel /></RoleRoute>} />
                  <Route path="users" element={<RoleRoute roles={['Admin']}><UserManagement /></RoleRoute>} />
                  <Route path="inventory" element={<RoleRoute roles={['Admin', 'Moderator']}><InventoryPage /></RoleRoute>} />
                  <Route path="reports" element={<RoleRoute roles={['Admin']}><ReportsPanel /></RoleRoute>} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </OrderProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );

}

export default App;
