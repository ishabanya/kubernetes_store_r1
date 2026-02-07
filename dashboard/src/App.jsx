import React, { useState } from 'react';
import StoreList from './components/StoreList';
import ActivityLog from './components/ActivityLog';

export default function App() {
  const [tab, setTab] = useState('stores');

  return (
    <div className="app">
      <div className="tabs">
        <button
          className={`tab ${tab === 'stores' ? 'active' : ''}`}
          onClick={() => setTab('stores')}
        >
          Stores
        </button>
        <button
          className={`tab ${tab === 'activity' ? 'active' : ''}`}
          onClick={() => setTab('activity')}
        >
          Activity Log
        </button>
      </div>

      {tab === 'stores' && <StoreList />}
      {tab === 'activity' && <ActivityLog />}
    </div>
  );
}
