import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../hooks/useBranding';
import { User, Lock, Loader2 } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import orderflowLogo from '../assets/orderflow-logo.png';
import { getRoleRoute } from '../utils/authRoutes';
import './Login.css';

// Animation Variants
const containerVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { 
      duration: 0.5, 
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.1,
      delayChildren: 0.2
    } 
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" }
  }
};

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
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
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
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="login-card"
      >
        <Motion.div variants={itemVariants} className="login-header">
          <Motion.div 
            whileHover={{ scale: 1.05 }}
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
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="login-error"
              >
                {error}
              </Motion.div>
            )}
          </AnimatePresence>
          
          <Motion.div variants={itemVariants} className="neu-input-field">
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
          
          <Motion.div variants={itemVariants} className="neu-input-field">
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
            variants={itemVariants}
            whileHover={{ scale: 1.01, translateY: -1 }}
            whileTap={{ scale: 0.98 }}
            type="submit" 
            className="login-submit-btn" 
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </Motion.button>

          <Motion.footer variants={itemVariants} className="login-footer">
            <span className="login-link">Forgot password?</span>
            <span>or</span>
            <span className="login-link-bold">Sign Up</span>
          </Motion.footer>
        </form>
      </Motion.div>
    </div>
  );
};
