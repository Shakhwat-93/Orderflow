import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { TrendingUp } from 'lucide-react';
import './Login.css';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to authenticate. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

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
