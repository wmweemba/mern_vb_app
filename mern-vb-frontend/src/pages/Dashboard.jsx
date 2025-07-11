import React from 'react';

const Dashboard = ({ title }) => (
  <div className="p-4">
    <h1 className="text-2xl font-bold mb-4">{title || 'Dashboard'}</h1>
    {/* Bank balance summary */}
    <div className="mb-4">[Bank Balance Here]</div>
    {/* Reports summary or quick links */}
    <div>[Reports Summary/Links Here]</div>
  </div>
);

export default Dashboard; 