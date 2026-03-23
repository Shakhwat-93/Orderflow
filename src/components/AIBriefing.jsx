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
        <>
          It's a busy day! You have <strong>{stats.pending} orders</strong> waiting for a call. 
          Your current average call delay is <strong>{avgCallDelay} minutes</strong>. 
          We need to speed up to hit the 30m SLA target (currently at <strong>{slaRate}%</strong>).
        </>
      );
    } else if (stats.pending > 0) {
      return (
        <>
          Steady flow today. <strong>{stats.pending} orders</strong> are in the queue. 
          The team is doing great with a <strong>{slaRate}% SLA success rate</strong>. 
          Factory is currently processing <strong>{stats.processing} items</strong>.
        </>
      );
    } else {
      return (
        <>
          All caught up! No orders are currently waiting in the call queue. 
          Revenue for today has reached <strong>৳{stats.addedTodayRevenue?.toLocaleString() || '0'}</strong>.
        </>
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
            <div key={sug.id} className="action-suggestion" onClick={() => window.location.href = sug.action}>
              <div className="suggestion-icon">
                {sug.icon}
              </div>
              <span>{sug.text}</span>
              <ArrowRight size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
