import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../hooks/useBranding';
import { User, Lock, Loader2 } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import orderflowLogo from '../assets/orderflow-logo.png';
import {
  createStaggerContainer,
  hoverLift,
  scaleInVariants,
  slideUpVariants,
  tapScale,
} from '../lib/motion';
import './Login.css';

const ROLE_ROUTES = {
  'Admin': '/',
  'Moderator': '/moderator',
  'Call Team': '/call-team',
  'Courier Team': '/courier',
  'Factory Team': '/factory',
  'Digital Marketer': '/digital-marketer',
};

const getRoleRoute = (roles = []) => {
  const priority = ['Admin', 'Digital Marketer', 'Moderator', 'Call Team', 'Courier Team', 'Factory Team'];
  for (const role of priority) {
    if (roles.includes(role)) return ROLE_ROUTES[role];
  }
  return '/';
};

const loginContainerVariants = createStaggerContainer(0.08, 0.08);

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { signIn, user, loading: authLoading, userRoles } = useAuth();
  const { appName } = useBranding();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user && userRoles.length > 0) {
      navigate(getRoleRoute(userRoles), { replace: true });
    }
  }, [user, authLoading, userRoles, navigate]);

  useEffect(() => {
    document.title = `${appName} | Login`;
  }, [appName]);

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await signIn(email, password);
    } catch (err) {
      setError(err.message || 'Failed to authenticate. Please check your credentials.');
      setLoading(false);
    }
  };

  if (loading && authLoading) {
    return (
      <div className="login-resolving">
        <Motion.div 
          variants={scaleInVariants}
          initial="hidden"
          animate="visible"
          className="login-resolve-icon-neu"
        >
          <Loader2 size={40} className="login-resolve-spinner" />
        </Motion.div>
      </div>
    );
  }

  return (
    <div className="login-wrapper">
      <Motion.div 
        variants={loginContainerVariants}
        initial="hidden"
        animate="visible"
        className="login-card"
      >
        <Motion.div variants={slideUpVariants} className="login-header">
          <Motion.div 
            whileHover={hoverLift}
            className="login-logo-container"
          >
            <img src={orderflowLogo} alt={`${appName} Logo`} className="login-logo-img" />
          </Motion.div>
          <div className="login-brand-copy">
            <h1>{appName}</h1>
            <p>Sign in to continue to your dashboard.</p>
          </div>
        </Motion.div>
        
        <form onSubmit={handleAuth} className="login-form">
          <AnimatePresence mode="wait">
            {error && (
              <Motion.div 
                variants={slideUpVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="login-error"
              >
                {error}
              </Motion.div>
            )}
          </AnimatePresence>
          
          <Motion.div variants={slideUpVariants} className="neu-input-field">
            <User size={20} />
            <input 
              type="email"
              placeholder="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Motion.div>
          
          <Motion.div variants={slideUpVariants} className="neu-input-field">
            <Lock size={20} />
            <input 
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Motion.div>
          
          <Motion.button 
            variants={slideUpVariants}
            whileHover={hoverLift}
            whileTap={tapScale}
            type="submit" 
            className="login-submit-btn" 
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </Motion.button>

          <Motion.footer variants={slideUpVariants} className="login-footer">
            <span className="login-link">Forgot password?</span>
            <span>or</span>
            <span className="login-link-bold">Sign Up</span>
          </Motion.footer>
        </form>
      </Motion.div>
    </div>
  );
};
