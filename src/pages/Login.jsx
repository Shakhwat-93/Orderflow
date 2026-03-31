import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, Lock, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import orderflowLogo from '../assets/orderflow-logo.png';
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
  const navigate = useNavigate();

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
    } catch (err) {
      setError(err.message || 'Failed to authenticate. Please check your credentials.');
      setLoading(false);
    }
  };

  if (loading && authLoading) {
    return (
      <div className="login-resolving">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="login-resolve-icon-neu"
        >
          <Loader2 size={40} className="login-resolve-spinner" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="login-wrapper">
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="login-card"
      >
        <motion.div variants={itemVariants} className="login-header">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="login-logo-container"
          >
            <img src={orderflowLogo} alt="Orderflow Logo" className="login-logo-img" />
          </motion.div>
        </motion.div>
        
        <form onSubmit={handleAuth} className="login-form">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="login-error"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
          
          <motion.div variants={itemVariants} className="neu-input-field">
            <User size={20} />
            <input 
              type="email"
              placeholder="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </motion.div>
          
          <motion.div variants={itemVariants} className="neu-input-field">
            <Lock size={20} />
            <input 
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </motion.div>
          
          <motion.button 
            variants={itemVariants}
            whileHover={{ scale: 1.01, translateY: -1 }}
            whileTap={{ scale: 0.98 }}
            type="submit" 
            className="login-submit-btn" 
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </motion.button>

          <motion.footer variants={itemVariants} className="login-footer">
            <span className="login-link">Forgot password?</span>
            <span>or</span>
            <span className="login-link-bold">Sign Up</span>
          </motion.footer>
        </form>
      </motion.div>
    </div>
  );
};
