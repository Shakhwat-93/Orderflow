import React from 'react';
import { Sparkles, ArrowRight, AlertCircle, Clock, CheckCircle2, TrendingUp } from 'lucide-react';
import './AIBriefing.css';

export const AIBriefing = ({ stats, avgCallDelay, slaRate }) => {
  // Logic to generate narrative based on stats
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getBriefingNarrative = () => {
    if (stats.pending > 10) {
      return (
        <p className="narrative-text">
          It's a busy day! You have <span className="stat-highlight alert">{stats.pending} orders</span> waiting for a call. 
          Your current average call delay is <span className="stat-highlight">{avgCallDelay} minutes</span>. 
          We need to speed up to hit the 30m SLA target (currently at <span className="stat-highlight warning">{slaRate}%</span>).
        </p>
      );
    } else if (stats.pending > 0) {
      return (
        <p className="narrative-text">
          Steady flow today. <span className="stat-highlight info">{stats.pending} orders</span> are in the queue. 
          The team is doing great with a <span className="stat-highlight success">{slaRate}% SLA success rate</span>. 
          Factory is currently processing <span className="stat-highlight info">{stats.processing} items</span>.
        </p>
      );
    } else {
      return (
        <p className="narrative-text">
          All caught up! No orders are currently waiting in the call queue. 
          Revenue for today has reached <span className="stat-highlight success">৳{stats.addedTodayRevenue?.toLocaleString() || '0'}</span>.
        </p>
      );
    }
  };

  const getSuggestions = () => {
    const suggestions = [];
    if (stats.pending > 5) {
      suggestions.push({
        id: 'call-team',
        text: 'Prioritize the Call Team queue to reduce delay',
        icon: <Clock size={14} />,
        action: '/call-team'
      });
    }
    if (stats.factoryQueueCount > 10) {
      suggestions.push({
        id: 'factory',
        text: 'Factory backlog is growing. Check production capacity.',
        icon: <TrendingUp size={14} />,
        action: '/factory'
      });
    }
    if (slaRate < 70) {
      suggestions.push({
        id: 'sla',
        text: 'SLA rate is dropping. Review first-call protocols.',
        icon: <AlertCircle size={14} />,
        action: '/reports'
      });
    }
    
    // Default suggestion
    if (suggestions.length === 0) {
      suggestions.push({
        id: 'new',
        text: 'Create a new order to boost today\'s revenue',
        icon: <Sparkles size={14} />,
        action: '/orders'
      });
    }

    return suggestions.slice(0, 2);
  };

  return (
    <div className="ai-briefing-card">
      <div className="briefing-header">
        <div className="ai-icon-pulse">
          <Sparkles size={20} />
        </div>
        <div className="briefing-title">
          <span className="briefing-subtitle">Intel Intelligence</span>
          <h2>{getGreeting()}, Chief.</h2>
        </div>
      </div>

      <div className="briefing-content">
        <div className="briefing-narrative">
          {getBriefingNarrative()}
        </div>
        
        <div className="briefing-actions">
          {getSuggestions().map(sug => (
            <button key={sug.id} className="action-suggestion" onClick={() => window.location.href = sug.action}>
              <div className="suggestion-icon">
                {sug.icon}
              </div>
              <span className="suggestion-text">{sug.text}</span>
              <div className="suggestion-arrow">
                <ArrowRight size={14} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
