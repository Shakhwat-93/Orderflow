import React from 'react';
import './ActivityTimeline.css';
import { Clock, History, User, ArrowRight } from 'lucide-react';

export const ActivityTimeline = ({ logs }) => {
  const formatAction = (log) => {
    const { action_type, old_status, new_status, changed_by_user_name, timestamp } = log;
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = new Date(timestamp).toLocaleDateString();

    switch (action_type) {
      case 'CREATE':
        return {
          title: 'Order Created',
          description: `Order initialized with status "${new_status}" by ${changed_by_user_name}`,
          icon: <History size={16} />,
          time: `${date} ${time}`
        };
      case 'STATUS_CHANGE':
        return {
          title: 'Status Updated',
          description: (
            <span>
              Changed from <span className="status-old">{old_status}</span> 
              <ArrowRight size={12} className="mx-1" /> 
              <span className="status-new">{new_status}</span> by {changed_by_user_name}
            </span>
          ),
          icon: <Clock size={16} />,
          time: `${date} ${time}`
        };
      case 'UPDATE':
        return {
          title: 'Order Edited',
          description: `General information updated by ${changed_by_user_name}`,
          icon: <User size={16} />,
          time: `${date} ${time}`
        };
      default:
        return {
          title: action_type,
          description: `Action performed by ${changed_by_user_name}`,
          icon: <Clock size={16} />,
          time: `${date} ${time}`
        };
    }
  };

  if (!logs || logs.length === 0) {
    return (
      <div className="empty-timeline">
        <p>No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="timeline-wrapper">
      <div className="timeline-line"></div>
      {logs.map((log, index) => {
        const action = formatAction(log);
        return (
          <div key={log.id || index} className="timeline-item">
            <div className="timeline-icon-outer">
              <div className="timeline-icon-inner">
                {action.icon}
              </div>
            </div>
            <div className="timeline-content liquid-glass">
              <div className="timeline-header">
                <span className="timeline-title">{action.title}</span>
                <span className="timeline-time">{action.time}</span>
              </div>
              <div className="timeline-description">
                {log.action_description || action.description}
              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
};
