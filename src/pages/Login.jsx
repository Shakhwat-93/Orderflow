import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { TrendingUp, Loader2 } from 'lucide-react';
import './Login.css';

// Role → default landing route mapping
const ROLE_ROUTES = {
  'Admin': '/',
  'Moderator': '/moderator',
  'Call Team': '/call-team',
  'Courier Team': '/courier',
  'Factory Team': '/factory',
  'Digital Marketer': '/digital-marketer',
};

const getRoleRoute = (roles = []) => {
  // Priority order: pick the most specific route available
  const priority = ['Admin', 'Digital Marketer', 'Moderator', 'Call Team', 'Courier Team', 'Factory Team'];
  for (const role of priority) {
    if (roles.includes(role)) return ROLE_ROUTES[role];
  }
  return '/'; // fallback to dashboard
};

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { signIn, user, loading: authLoading, userRoles } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in AND roles are resolved
  useEffect(() => {
    if (!authLoading && user && userRoles.length > 0) {
      navigate(getRoleRoute(userRoles), { replace: true });
    }
  }, [user, authLoading, userRoles, navigate]);

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await signIn(email, password);
      // ⬆️ DON'T navigate here — let the useEffect above
      // handle the redirect once userRoles are loaded in AuthContext.
    } catch (err) {
      setError(err.message || 'Failed to authenticate. Please check your credentials.');
      setLoading(false);
    }
  };

  // Show a full-screen loading overlay while auth resolves after login
  if (loading && authLoading) {
    return (
      <div className="login-resolving">
        <div className="login-resolving-inner">
          <div className="login-resolve-icon">
            <TrendingUp size={32} />
          </div>
          <Loader2 size={24} className="login-resolve-spinner" />
          <p>Signing you in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrapper">
      <Card className="login-card liquid-glass floating">
        <div className="login-header">
          <div className="login-logo glow-logo">
            <TrendingUp size={32} />
          </div>
          <h2>Welcome Back</h2>
          <p>Sign in to access the system.</p>
        </div>
        
        <form onSubmit={handleAuth} className="login-form">
          {error && <div className="login-error">{error}</div>}
          

          <Input 
            label="Email Address"
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          
          <Input 
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          
          <Button type="submit" variant="primary" fullWidth disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </Button>

          <div className="login-help">
            <p>
              Login with credentials provided by your system administrator.
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
};
