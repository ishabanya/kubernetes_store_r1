import React, { useState, useEffect, useCallback } from 'react';
import { fetchStores, createStore, deleteStore } from '../services/api';
import StoreCard from './StoreCard';
import CreateStoreDialog from './CreateStoreDialog';
import DeleteConfirmDialog from './DeleteConfirmDialog';

export default function StoreList() {
  const [stores, setStores] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState(null);
  const [error, setError] = useState('');

  const loadStores = useCallback(async () => {
    try {
      const data = await fetchStores();
      setStores(data);
      setError('');
    } catch (err) {
      setError('Failed to load stores');
    }
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  // Poll: every 5s when provisioning/deleting, every 30s otherwise
  useEffect(() => {
    const hasActive = stores.some(
      (s) => s.status === 'provisioning' || s.status === 'deleting'
    );
    const interval = setInterval(loadStores, hasActive ? 5000 : 30000);
    return () => clearInterval(interval);
  }, [stores, loadStores]);

  const handleCreate = async (name, type, adminUser, adminPassword) => {
    await createStore(name, type, adminUser, adminPassword);
    await loadStores();
  };

  const handleDelete = async (id) => {
    await deleteStore(id);
    setStoreToDelete(null);
    await loadStores();
  };

  const activeStores = stores.filter((s) => s.status !== 'deleted');

  return (
    <>
      <div className="header">
        <h1>Store Platform</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + Create Store
        </button>
      </div>

      {error && (
        <div className="store-card-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {activeStores.length === 0 ? (
        <div className="empty-state">
          <h3>No stores yet</h3>
          <p>Click "Create Store" to deploy your first WooCommerce store.</p>
        </div>
      ) : (
        <div className="store-grid">
          {activeStores.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              onDelete={setStoreToDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateStoreDialog
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}

      {storeToDelete && (
        <DeleteConfirmDialog
          store={storeToDelete}
          onClose={() => setStoreToDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
